'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';

interface RiskPosition {
  market: string;
  isLong: boolean;
  sizeUsd: number;
  collateralUsd: number;
  leverage: number;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  liqDistancePct: number;
  riskLevel?: 'SAFE' | 'WARNING' | 'CRITICAL';
  riskLabel?: 'SAFE' | 'WARNING' | 'CRITICAL';
  riskExplanation?: string;
  explanation?: string;
}

interface RiskSummary {
  positions: number;
  atRisk: number;
  critical: number;
  totalSizeUsd: number;
  totalCollateralUsd: number;
  averageLeverage: number | null;
  closestLiqDistancePct: number | null;
  worstRisk: 'SAFE' | 'WARNING' | 'CRITICAL';
}

interface RiskOverviewResponse {
  account: string;
  updatedAt: string;
  positions: RiskPosition[];
  summary: RiskSummary;
}

interface ApiStatus {
  ok: boolean;
  timestamp: string;
  rpc: {
    ok: boolean;
    chainId?: number;
    blockNumber?: number;
    error?: string;
  };
  copin?: {
    ok: boolean;
    enabled: boolean;
    rateLimited?: boolean;
    error?: string;
  };
}

interface TraderSummary {
  positions: number;
  worstRisk: 'SAFE' | 'WARNING' | 'CRITICAL';
  closestLiqDistancePct: number;
}

interface WhaleTrader {
  address: string;
  rank: number;
  summary: TraderSummary;
  positions: RiskPosition[];
}

export default function Home() {
  // Wallet checker state
  const [address, setAddress] = useState('');
  const [positions, setPositions] = useState<RiskPosition[]>([]);
  const [summary, setSummary] = useState<RiskSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Whale monitoring state
  const [whaleTimeframe, setWhaleTimeframe] = useState<'7d' | '30d' | '90d'>('7d');
  const [whaleLimit, setWhaleLimit] = useState(10);
  const [whaleProtocol, setWhaleProtocol] = useState<'GMX' | 'GMX_V2'>('GMX');
  const [whales, setWhales] = useState<WhaleTrader[]>([]);
  const [whalesLoading, setWhalesLoading] = useState(false);
  const [whalesError, setWhalesError] = useState('');
  const [expandedTrader, setExpandedTrader] = useState<string | null>(null);

  // Flexibility controls
  const [riskFilter, setRiskFilter] = useState<'all' | 'at-risk' | 'critical'>('all');
  const [sideFilter, setSideFilter] = useState<'all' | 'long' | 'short'>('all');
  const [marketFilter, setMarketFilter] = useState('');
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [apiStatus, setApiStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [status, setStatus] = useState<ApiStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const apiHost = useMemo(() => {
    try {
      return new URL(API_URL).host;
    } catch {
      return API_URL;
    }
  }, [API_URL]);

  // Seed watchlist from localStorage for quicker lookups without wallet connection.
  useEffect(() => {
    try {
      const stored = localStorage.getItem('gmx-watchlist');
      if (stored) {
        setWatchlist(JSON.parse(stored));
      }
    } catch {
      // Ignore storage errors to avoid blocking the UI.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('gmx-watchlist', JSON.stringify(watchlist));
    } catch {
      // Ignore storage errors to avoid blocking the UI.
    }
  }, [watchlist]);

  const normalizePositions = useCallback((input: RiskPosition[]): RiskPosition[] => {
    return input.map((pos) => {
      const leverage = pos.leverage ?? (pos.collateralUsd ? pos.sizeUsd / pos.collateralUsd : 0);
      const riskLevel = pos.riskLevel || pos.riskLabel || 'SAFE';

      return {
        ...pos,
        leverage,
        riskLevel,
        riskLabel: pos.riskLabel || riskLevel,
        riskExplanation: pos.riskExplanation || pos.explanation,
      };
    });
  }, []);

  const deriveSummary = useCallback((riskPositions: RiskPosition[]): RiskSummary => {
    if (!riskPositions.length) {
      return {
        positions: 0,
        atRisk: 0,
        critical: 0,
        totalSizeUsd: 0,
        totalCollateralUsd: 0,
        averageLeverage: null,
        closestLiqDistancePct: null,
        worstRisk: 'SAFE',
      };
    }

    const atRisk = riskPositions.filter((p) => (p.riskLabel || p.riskLevel) !== 'SAFE').length;
    const critical = riskPositions.filter((p) => (p.riskLabel || p.riskLevel) === 'CRITICAL').length;
    const totalSizeUsd = riskPositions.reduce((sum, pos) => sum + pos.sizeUsd, 0);
    const totalCollateralUsd = riskPositions.reduce((sum, pos) => sum + pos.collateralUsd, 0);
    const averageLeverageRaw =
      riskPositions.reduce((sum, pos) => sum + (pos.leverage || 0), 0) / riskPositions.length;
    const averageLeverage = Number.isFinite(averageLeverageRaw)
      ? Math.round(averageLeverageRaw * 100) / 100
      : null;
    const closestLiqDistancePct = Math.min(...riskPositions.map((p) => p.liqDistancePct));
    const worstRisk = critical > 0 ? 'CRITICAL' : atRisk > 0 ? 'WARNING' : 'SAFE';

    return {
      positions: riskPositions.length,
      atRisk,
      critical,
      totalSizeUsd,
      totalCollateralUsd,
      averageLeverage,
      closestLiqDistancePct,
      worstRisk,
    };
  }, []);

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError('');

    try {
      const response = await fetch(`${API_URL}/status`);
      const payload = (await response.json().catch(() => ({}))) as Partial<ApiStatus> & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Status endpoint unavailable');
      }

      setStatus(payload as ApiStatus);
      setApiStatus(payload.ok ? 'ok' : 'error');
    } catch (err) {
      setStatus(null);
      setStatusError(err instanceof Error ? err.message : 'Failed to load status');
    } finally {
      setStatusLoading(false);
    }
  }, [API_URL]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Wallet position fetch
  const fetchPositions = useCallback(
    async (opts?: { addressOverride?: string; silent?: boolean }) => {
      const targetAddress = (opts?.addressOverride ?? address).trim();
      if (!targetAddress) {
        setError('Please enter a wallet address');
        return;
      }

      if (opts?.silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
        setPositions([]);
        setSummary(null);
      }

      setError('');

      try {
        let overview: RiskOverviewResponse | null = null;
        let fallbackPositions: RiskPosition[] | null = null;

        // Prefer richer overview endpoint, but gracefully fall back if unavailable
        try {
          const response = await fetch(`${API_URL}/risk/overview?account=${targetAddress}`);
          const payload = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(payload.error || 'Failed to fetch overview');
          }

          overview = payload;
        } catch (overviewErr) {
          const response = await fetch(`${API_URL}/risk?account=${targetAddress}`);
          const payload = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(payload.error || 'Failed to fetch positions');
          }

          fallbackPositions = Array.isArray(payload) ? payload : [];
        }

        const normalizedPositions = overview
          ? normalizePositions(overview.positions || [])
          : normalizePositions(fallbackPositions || []);
        const computedSummary = overview?.summary || deriveSummary(normalizedPositions);
        const updatedAt = overview?.updatedAt || new Date().toISOString();

        setPositions(normalizedPositions);
        setSummary(computedSummary);
        setLastUpdated(updatedAt);
        setApiStatus('ok');

        if (normalizedPositions.length === 0) {
          setError('No open positions found for this address');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch positions');
        setApiStatus('error');
      } finally {
        if (opts?.silent) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [API_URL, address, deriveSummary, normalizePositions]
  );

  // Auto-refresh wallet data if enabled
  useEffect(() => {
    if (!autoRefresh || !address.trim()) return;
    const timer = setInterval(() => {
      fetchPositions({ silent: true });
    }, refreshInterval * 1000);

    return () => clearInterval(timer);
  }, [address, autoRefresh, fetchPositions, refreshInterval]);

  const saveToWatchlist = () => {
    const trimmed = address.trim();
    if (!trimmed) {
      setError('Enter a wallet address before saving to watchlist');
      return;
    }

    if (watchlist.includes(trimmed)) return;
    setWatchlist((prev) => [...prev.slice(-4), trimmed]); // keep last 5 recent
  };

  const removeFromWatchlist = (target: string) => {
    setWatchlist((prev) => prev.filter((addr) => addr !== target));
  };

  const loadWatchedAddress = (target: string) => {
    setAddress(target);
    if (!watchlist.includes(target)) {
      setWatchlist((prev) => [...prev.slice(-4), target]);
    }
    fetchPositions({ addressOverride: target });
  };

  // Whale monitoring fetch
  const fetchWhales = async () => {
    setWhalesLoading(true);
    setWhalesError('');
    setWhales([]);
    setExpandedTrader(null);

    try {
      const response = await fetch(
        `${API_URL}/whales/risk?timeframe=${whaleTimeframe}&limit=${whaleLimit}&protocol=${whaleProtocol}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch whale data');
      }

      const data = await response.json();
      setWhales(data.traders || []);

      if (!data.traders || data.traders.length === 0) {
        setWhalesError('No whale traders found');
      }
    } catch (err) {
      setWhalesError(err instanceof Error ? err.message : 'Failed to fetch whales');
    } finally {
      setWhalesLoading(false);
    }
  };

  const formatUSD = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPrice = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const shortAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const toggleTrader = (address: string) => {
    setExpandedTrader(expandedTrader === address ? null : address);
  };

  const summaryData = useMemo(
    () => summary || deriveSummary(positions),
    [deriveSummary, positions, summary]
  );

  const riskTally = {
    safe: Math.max(summaryData.positions - summaryData.atRisk, 0),
    warning: Math.max(summaryData.atRisk - summaryData.critical, 0),
    critical: summaryData.critical,
  };

  const hasPositions = summaryData.positions > 0;
  const closestLiqDistance = summaryData.closestLiqDistancePct;
  const totalSizeUsd = summaryData.totalSizeUsd;
  const totalCollateralUsd = summaryData.totalCollateralUsd;
  const averageLeverage = summaryData.averageLeverage;
  const filteredPositions = useMemo(
    () =>
      positions.filter((pos) => {
        const risk = (pos.riskLabel || pos.riskLevel || 'SAFE').toUpperCase();
        const matchesRisk =
          riskFilter === 'all'
            ? true
            : riskFilter === 'at-risk'
              ? risk === 'WARNING' || risk === 'CRITICAL'
              : risk === 'CRITICAL';
        const matchesSide = sideFilter === 'all' ? true : sideFilter === 'long' ? pos.isLong : !pos.isLong;
        const matchesMarket = marketFilter
          ? pos.market.toLowerCase().includes(marketFilter.toLowerCase())
          : true;
        return matchesRisk && matchesSide && matchesMarket;
      }),
    [marketFilter, positions, riskFilter, sideFilter]
  );
  const topRiskPositions = useMemo(
    () => [...positions].sort((a, b) => a.liqDistancePct - b.liqDistancePct).slice(0, 3),
    [positions]
  );
  const lastUpdatedLabel = lastUpdated
    ? `${new Date(lastUpdated).toLocaleDateString()} · ${new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : '—';
  const rpcStatusClass = status?.rpc?.ok ? 'ok' : status ? 'error' : 'idle';
  const copinStatusClass = status?.copin
    ? status.copin.enabled
      ? status.copin.ok
        ? 'ok'
        : status.copin.rateLimited
          ? 'warning'
          : 'error'
      : 'idle'
    : 'idle';

  return (
    <div className="page-shell">
      <header className="hero">
        <div className="hero-copy">
          <div className="eyebrow">GMX liquidation radar</div>
          <h1>Leverage-aware GMX monitor with live whale signals.</h1>
          <p className="subtitle">
            Pull on-chain risk for any wallet and Copin whales, then layer filters, saved watchlists, and auto-refresh cadence.
          </p>
          <div className="hero-pills">
            <span className="pill">Arbitrum perps</span>
            <span className="pill pill-ghost">Leverage-aware</span>
            <span className="pill pill-highlight">Copin whale feed</span>
          </div>
        </div>

        <div className="hero-meter">
          <div className="meter-card status-board">
            <div className="meter-label">Backend</div>
            <div className="meter-value">{apiHost || 'Not set'}</div>
            <p className="status-row">
              <span
                className={`status-dot ${
                  apiStatus === 'error' ? 'error' : apiStatus === 'ok' ? 'ok' : 'idle'
                }`}
              />
              {status?.ok === false
                ? 'Backend reported an issue'
                : apiStatus === 'ok'
                  ? 'Healthy response'
                  : apiStatus === 'error'
                    ? 'Check RPC or backend'
                    : 'Waiting for first call'}
            </p>
              <div className="status-grid">
                <div className={`status-card ${rpcStatusClass}`}>
                  <div className="mini-label">RPC</div>
                  <strong>{status?.rpc?.ok ? `Chain #${status?.rpc?.chainId}` : 'RPC unavailable'}</strong>
                  <p className="status-note">
                    {status?.rpc?.ok
                      ? `Block ${status?.rpc?.blockNumber}`
                      : status?.rpc?.error || 'Waiting on status'}
                  </p>
                </div>
                <div className={`status-card ${copinStatusClass}`}>
                  <div className="mini-label">Copin feed</div>
                <strong>
                  {status?.copin?.enabled === false
                    ? 'Disabled'
                    : status?.copin?.ok
                      ? 'Live'
                      : status?.copin?.rateLimited
                        ? 'Rate limited'
                        : 'Unavailable'}
                </strong>
                <p className="status-note">
                  {status?.copin?.enabled === false
                    ? 'Add COPIN_API_KEY to enable whales'
                    : status?.copin?.error
                      ? status?.copin?.error
                      : 'Top trader lookups ready'}
                </p>
              </div>
            </div>
            <div className="status-foot">
              <div>
                <div className="mini-label">Last sync</div>
                <strong>{lastUpdatedLabel}</strong>
              </div>
              <div className="status-actions">
                <div>
                  <div className="mini-label">Refresh</div>
                  <strong>{autoRefresh ? `${refreshInterval}s cadence` : 'Manual pulls'}</strong>
                </div>
                <button className="micro-button" onClick={fetchStatus} disabled={statusLoading}>
                  {statusLoading ? 'Checking…' : 'Ping status'}
                </button>
              </div>
            </div>
            {statusError && <p className="status-note error-text">{statusError}</p>}
          </div>
        </div>
      </header>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Positions live</div>
          <div className="stat-value">{summaryData.positions || '—'}</div>
          <p className="stat-sub">Last sync {lastUpdatedLabel}</p>
        </div>
        <div className="stat-card">
          <div className="stat-label">At risk</div>
          <div className="stat-value accent">
            {riskTally.critical + riskTally.warning || '—'}
          </div>
          <p className="stat-sub">
            {riskTally.critical} critical · {riskTally.warning} warning
          </p>
        </div>
        <div className="stat-card">
          <div className="stat-label">Exposure</div>
          <div className="stat-value">{hasPositions ? formatUSD(totalSizeUsd) : '—'}</div>
          <p className="stat-sub">
            Collateral {hasPositions ? formatUSD(totalCollateralUsd) : '—'}
          </p>
        </div>
        <div className="stat-card">
          <div className="stat-label">Buffers</div>
          <div className="stat-value">
            {closestLiqDistance !== null ? `${closestLiqDistance.toFixed(2)}%` : '—'}
          </div>
          <p className="stat-sub">
            {averageLeverage ? `${averageLeverage.toFixed(2)}x avg lev` : 'Leverage pending'}
          </p>
        </div>
      </div>

      {/* Wallet Checker Section */}
      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Wallet sweep</p>
            <h2>Check wallet positions</h2>
            <p className="section-subtitle">
              Pull live risk stats for any address on GMX. We flag the closest liquidation distances and risk grade.
            </p>
          </div>
          <div className="panel-chip">Manual lookup</div>
        </div>

        <div className="inline-status">
          <div>
            <p className="mini-label">Last sync</p>
            <strong>{lastUpdatedLabel}</strong>
          </div>
          <div>
            <p className="mini-label">Mode</p>
            <strong>{autoRefresh ? `Auto · ${refreshInterval}s` : 'Manual pulls'}</strong>
          </div>
          <div>
            <p className="mini-label">Filters</p>
            <strong>
              {riskFilter === 'all'
                ? 'All tiers'
                : riskFilter === 'at-risk'
                  ? 'Warning + critical'
                  : 'Critical only'}
            </strong>
          </div>
        </div>

        <div className="search-section">
          <div className="search-header">
            <label className="input-label">Wallet address</label>
            <div className="search-actions">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                />
                <span>Auto-refresh</span>
              </label>
              <select
                className="compact-select"
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(Number(e.target.value))}
              >
                {[15, 30, 60, 120].map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}s
                  </option>
                ))}
              </select>
              <button className="ghost-button" onClick={saveToWatchlist}>
                Save to watchlist
              </button>
            </div>
          </div>
          <div className="input-group">
            <input
              type="text"
              placeholder="0x123…"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchPositions()}
            />
            <button onClick={() => fetchPositions()} disabled={loading}>
              {loading ? 'Loading...' : 'Check positions'}
            </button>
          </div>
          <p className="helper-text">
            We only read public data; no wallet connection required. {refreshing ? 'Auto-refreshing live.' : ''}
          </p>

          {watchlist.length > 0 && (
            <div className="watchlist-row">
              <span className="mini-label">Saved</span>
              <div className="watchlist-chips">
                {watchlist.map((addr) => (
                  <div key={addr} className="watch-chip">
                    <button className="chip" onClick={() => loadWatchedAddress(addr)}>
                      {shortAddress(addr)}
                    </button>
                    <button
                      className="chip-remove"
                      onClick={() => removeFromWatchlist(addr)}
                      aria-label={`Remove ${addr} from watchlist`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && <div className="error">{error}</div>}
        {loading && <div className="loading">Fetching positions from Arbitrum…</div>}

        {positions.length > 0 && (
          <div className="filters-row">
            <div className="filter-group">
              <p className="mini-label">Risk focus</p>
              <div className="pill-switch compact">
                {[
                  { label: 'All', value: 'all' },
                  { label: 'Warning +', value: 'at-risk' },
                  { label: 'Critical', value: 'critical' },
                ].map((item) => (
                  <button
                    key={item.value}
                    className={riskFilter === item.value ? 'active' : ''}
                    onClick={() => setRiskFilter(item.value as typeof riskFilter)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <p className="mini-label">Side</p>
              <div className="pill-switch compact">
                {[
                  { label: 'All', value: 'all' },
                  { label: 'Longs', value: 'long' },
                  { label: 'Shorts', value: 'short' },
                ].map((item) => (
                  <button
                    key={item.value}
                    className={sideFilter === item.value ? 'active' : ''}
                    onClick={() => setSideFilter(item.value as typeof sideFilter)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group search-filter">
              <p className="mini-label">Market search</p>
              <input
                className="inline-input"
                placeholder="BTC, ETH, GMX..."
                value={marketFilter}
                onChange={(e) => setMarketFilter(e.target.value)}
              />
            </div>
          </div>
        )}

        {positions.length > 0 && (
          <div className="heat-grid">
            {topRiskPositions.map((pos, idx) => {
              const riskClass = (pos.riskLabel || pos.riskLevel || 'SAFE').toLowerCase();
              return (
                <div key={`${pos.market}-${idx}`} className={`heat-card ${riskClass}`}>
                  <div className="heat-head">
                    <span className={`badge ${riskClass}`}>{pos.riskLabel || pos.riskLevel || 'SAFE'}</span>
                    <span className="mini-label">{pos.isLong ? 'LONG' : 'SHORT'}</span>
                  </div>
                  <h4>{pos.market}</h4>
                  <div className="heat-metric">
                    <span>Liq buffer</span>
                    <strong>{pos.liqDistancePct.toFixed(2)}%</strong>
                  </div>
                  <div className="heat-row">
                    <span>Mark</span>
                    <span>{formatPrice(pos.markPrice)}</span>
                  </div>
                  <div className="heat-row">
                    <span>Liq price</span>
                    <span>{formatPrice(pos.liquidationPrice)}</span>
                  </div>
                  <div className="heat-row">
                    <span>Leverage</span>
                    <span>{pos.leverage ? `${pos.leverage.toFixed(2)}x` : '—'}</span>
                  </div>
                  <div className="heat-row">
                    <span>Size</span>
                    <span>{formatUSD(pos.sizeUsd)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && positions.length > 0 && (
          <div className="table-card">
            <div className="table-header">
              <div>
                <p className="eyebrow">Live positions</p>
                <h3>
                  Wallet exposure
                  {filteredPositions.length !== positions.length && (
                    <span className="count-pill">
                      {filteredPositions.length}/{positions.length} shown
                    </span>
                  )}
                </h3>
              </div>
              <div className="legend">
                <span className="legend-dot long"></span> Long
                <span className="legend-dot short"></span> Short
              </div>
            </div>
            {filteredPositions.length === 0 ? (
              <div className="empty-state">No positions match the current filters. Clear filters to see all.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Market</th>
                    <th>Side</th>
                    <th>Size</th>
                    <th>Collateral</th>
                    <th>Lev.</th>
                    <th>Entry Price</th>
                    <th>Mark Price</th>
                    <th>Liq. Price</th>
                    <th>Liq. Buffer</th>
                    <th>Risk Level</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPositions.map((position, index) => {
                    const riskClass = (position.riskLabel || position.riskLevel || 'SAFE').toLowerCase();
                    return (
                      <tr key={index} className={`position-row ${riskClass}`}>
                        <td>
                          <strong>{position.market}</strong>
                          {position.riskExplanation && (
                            <div className="risk-explanation">{position.riskExplanation}</div>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${position.isLong ? 'long' : 'short'}`}>
                            {position.isLong ? 'LONG' : 'SHORT'}
                          </span>
                        </td>
                        <td>{formatUSD(position.sizeUsd)}</td>
                        <td>{formatUSD(position.collateralUsd)}</td>
                        <td>{position.leverage ? `${position.leverage.toFixed(2)}x` : '—'}</td>
                        <td>{formatPrice(position.entryPrice)}</td>
                        <td>{formatPrice(position.markPrice)}</td>
                        <td>{formatPrice(position.liquidationPrice)}</td>
                        <td>
                          <div className="distance">
                            <strong>{position.liqDistancePct.toFixed(2)}%</strong>
                            <div className="distance-bar">
                              <span
                                style={{ width: `${Math.min(position.liqDistancePct, 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${riskClass}`}>
                            {position.riskLevel || position.riskLabel || 'SAFE'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>

      {/* Whale Monitoring Section */}
      <section className="panel whale-section">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Copin feed</p>
            <h2>Top traders whale monitor</h2>
            <p className="section-subtitle">Watch liquidation buffers for the heaviest GMX accounts.</p>
          </div>
          <div className="panel-chip warm">Live leaderboard</div>
        </div>

        <div className="whale-controls">
          <div className="control-group">
            <label>Timeframe</label>
            <div className="pill-switch">
              {['7d', '30d', '90d'].map((tf) => (
                <button
                  key={tf}
                  className={whaleTimeframe === tf ? 'active' : ''}
                  onClick={() => setWhaleTimeframe(tf as '7d' | '30d' | '90d')}
                >
                  {tf.replace('d', ' days')}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label>Limit</label>
            <div className="pill-switch">
              {[10, 25, 50].map((limit) => (
                <button
                  key={limit}
                  className={whaleLimit === limit ? 'active' : ''}
                  onClick={() => setWhaleLimit(limit)}
                >
                  Top {limit}
                </button>
              ))}
            </div>
          </div>

          <div className="control-group">
            <label>Protocol</label>
            <div className="pill-switch">
              {[
                { label: 'GMX v1', value: 'GMX' },
                { label: 'GMX v2', value: 'GMX_V2' },
              ].map((protocol) => (
                <button
                  key={protocol.value}
                  className={whaleProtocol === protocol.value ? 'active' : ''}
                  onClick={() => setWhaleProtocol(protocol.value as 'GMX' | 'GMX_V2')}
                >
                  {protocol.label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={fetchWhales} disabled={whalesLoading} className="whale-button">
            {whalesLoading ? 'Loading whales…' : 'Refresh feed'}
          </button>
        </div>

        {whalesError && <div className="error">{whalesError}</div>}
        {whalesLoading && <div className="loading">Fetching whale data from Copin…</div>}

        {!whalesLoading && whales.length > 0 && (
          <div className="whale-table-container">
            <table className="whale-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Address</th>
                  <th>Positions</th>
                  <th>Worst Risk</th>
                  <th>Closest Liq %</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {whales.map((whale) => (
                  <Fragment key={whale.address}>
                    <tr
                      className="whale-row"
                      onClick={() => toggleTrader(whale.address)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td><strong>#{whale.rank}</strong></td>
                      <td>
                        <div className="address-stack">
                          <code className="address-code">{shortAddress(whale.address)}</code>
                          <button
                            className="micro-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              loadWatchedAddress(whale.address);
                            }}
                          >
                            Load wallet
                          </button>
                        </div>
                      </td>
                      <td>{whale.summary.positions}</td>
                      <td>
                        <span className={`badge ${whale.summary.worstRisk.toLowerCase()}`}>
                          {whale.summary.worstRisk}
                        </span>
                      </td>
                      <td>
                        <strong className={whale.summary.closestLiqDistancePct < 7 ? 'critical-text' : ''}>
                          {whale.summary.closestLiqDistancePct.toFixed(2)}%
                        </strong>
                      </td>
                      <td>
                        <span className="expand-icon">
                          {expandedTrader === whale.address ? '▼' : '▶'}
                          </span>
                        </td>
                      </tr>

                    {expandedTrader === whale.address && whale.positions.length > 0 && (
                      <tr className="expanded-positions">
                        <td colSpan={6}>
                          <div className="positions-detail">
                            <h4>Positions for {shortAddress(whale.address)}</h4>
                            <table className="nested-table">
                              <thead>
                                <tr>
                                  <th>Market</th>
                                  <th>Side</th>
                                  <th>Size</th>
                                  <th>Collateral</th>
                                  <th>Lev.</th>
                                  <th>Mark Price</th>
                                  <th>Liq. Price</th>
                                  <th>Liq. Dist %</th>
                                  <th>Risk</th>
                                </tr>
                              </thead>
                              <tbody>
                                {whale.positions.map((pos, idx) => (
                                  <tr key={idx}>
                                    <td><strong>{pos.market}</strong></td>
                                    <td>
                                      <span className={`badge ${pos.isLong ? 'long' : 'short'}`}>
                                        {pos.isLong ? 'LONG' : 'SHORT'}
                                      </span>
                                    </td>
                                    <td>{formatUSD(pos.sizeUsd)}</td>
                                    <td>{formatUSD(pos.collateralUsd)}</td>
                                    <td>{pos.leverage ? `${pos.leverage.toFixed(2)}x` : '—'}</td>
                                    <td>{formatPrice(pos.markPrice)}</td>
                                    <td>{formatPrice(pos.liquidationPrice)}</td>
                                    <td><strong>{pos.liqDistancePct.toFixed(2)}%</strong></td>
                                    <td>
                                      <span className={`badge ${(pos.riskLabel || pos.riskLevel || 'SAFE').toLowerCase()}`}>
                                        {pos.riskLabel || pos.riskLevel || 'SAFE'}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
