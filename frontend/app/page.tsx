'use client';

import { Fragment, useMemo, useState } from 'react';

interface RiskPosition {
  market: string;
  isLong: boolean;
  sizeUsd: number;
  collateralUsd: number;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  liqDistancePct: number;
  riskLevel: 'SAFE' | 'WARNING' | 'CRITICAL';
  riskLabel?: 'SAFE' | 'WARNING' | 'CRITICAL';
  riskExplanation?: string;
  explanation?: string;
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Whale monitoring state
  const [whaleTimeframe, setWhaleTimeframe] = useState<'7d' | '30d' | '90d'>('7d');
  const [whaleLimit, setWhaleLimit] = useState(10);
  const [whaleProtocol, setWhaleProtocol] = useState<'GMX' | 'GMX_V2'>('GMX');
  const [whales, setWhales] = useState<WhaleTrader[]>([]);
  const [whalesLoading, setWhalesLoading] = useState(false);
  const [whalesError, setWhalesError] = useState('');
  const [expandedTrader, setExpandedTrader] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  // Wallet position fetch
  const fetchPositions = async () => {
    if (!address.trim()) {
      setError('Please enter a wallet address');
      return;
    }

    setLoading(true);
    setError('');
    setPositions([]);

    try {
      const response = await fetch(`${API_URL}/risk?account=${address.trim()}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch positions');
      }

      const data = await response.json();
      setPositions(data);

      if (data.length === 0) {
        setError('No open positions found for this address');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch positions');
    } finally {
      setLoading(false);
    }
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

  const hasPositions = positions.length > 0;
  const riskTally = useMemo(
    () =>
      positions.reduce(
        (acc, pos) => {
          const label = (pos.riskLabel || pos.riskLevel || 'SAFE').toLowerCase() as
            | 'safe'
            | 'warning'
            | 'critical';
          acc[label] = (acc[label] || 0) + 1;
          return acc;
        },
        { safe: 0, warning: 0, critical: 0 }
      ),
    [positions]
  );

  const closestLiqDistance = positions.length
    ? Math.min(...positions.map((pos) => pos.liqDistancePct))
    : null;
  const totalSizeUsd = positions.reduce((sum, pos) => sum + pos.sizeUsd, 0);

  return (
    <div className="page-shell">
      <header className="hero">
        <div className="hero-copy">
          <div className="eyebrow">GMX liquidation radar</div>
          <h1>Watch exposure before it gets liquidated.</h1>
          <p className="subtitle">
            Track any wallet and the top Copin traders, with real-time liquidation distance and risk heat.
          </p>
          <div className="hero-pills">
            <span className="pill">Arbitrum perps</span>
            <span className="pill pill-ghost">Live risk pulses</span>
            <span className="pill pill-highlight">Copin whale feed</span>
          </div>
        </div>

        <div className="hero-meter">
          <div className="meter-card">
            <div className="meter-label">Fast check</div>
            <div className="meter-value">{hasPositions ? 'Wallet loaded' : 'Paste an address'}</div>
            <p>Scan for liquidation bands and risk labels without leaving the page.</p>
          </div>
        </div>
      </header>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Open positions</div>
          <div className="stat-value">{positions.length || '—'}</div>
          <p className="stat-sub">Fetched from your wallet lookup.</p>
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
          <div className="stat-label">Closest liq buffer</div>
          <div className="stat-value">
            {closestLiqDistance !== null ? `${closestLiqDistance.toFixed(2)}%` : '—'}
          </div>
          <p className="stat-sub">Distance to nearest liquidation band.</p>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total size</div>
          <div className="stat-value">{hasPositions ? formatUSD(totalSizeUsd) : '—'}</div>
          <p className="stat-sub">Nominal notional across positions.</p>
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

        <div className="search-section">
          <label className="input-label">Wallet address</label>
          <div className="input-group">
            <input
              type="text"
              placeholder="0x123…"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchPositions()}
            />
            <button onClick={fetchPositions} disabled={loading}>
              {loading ? 'Loading...' : 'Check positions'}
            </button>
          </div>
          <p className="helper-text">We only read public data; no wallet connection required.</p>
        </div>

        {error && <div className="error">{error}</div>}
        {loading && <div className="loading">Fetching positions from Arbitrum…</div>}

        {!loading && positions.length > 0 && (
          <div className="table-card">
            <div className="table-header">
              <div>
                <p className="eyebrow">Live positions</p>
                <h3>Wallet exposure</h3>
              </div>
              <div className="legend">
                <span className="legend-dot long"></span> Long
                <span className="legend-dot short"></span> Short
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Side</th>
                  <th>Size</th>
                  <th>Collateral</th>
                  <th>Entry Price</th>
                  <th>Mark Price</th>
                  <th>Liq. Price</th>
                  <th>Liq. Buffer</th>
                  <th>Risk Level</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((position, index) => (
                  <tr key={index} className={`position-row ${position.riskLevel.toLowerCase()}`}>
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
                      <span className={`badge ${position.riskLevel.toLowerCase()}`}>
                        {position.riskLevel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                        <code className="address-code">{shortAddress(whale.address)}</code>
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
