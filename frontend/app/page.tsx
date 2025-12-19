'use client';

import { useState } from 'react';

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

  return (
    <div className="container">
      <h1>GMX Risk Monitor</h1>
      <p className="subtitle">Monitor liquidation risk for GMX positions on Arbitrum</p>

      {/* Wallet Checker Section */}
      <section className="section">
        <h2>Check Wallet Positions</h2>
        <div className="search-section">
          <div className="input-group">
            <input
              type="text"
              placeholder="Enter wallet address (0x...)"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchPositions()}
            />
            <button onClick={fetchPositions} disabled={loading}>
              {loading ? 'Loading...' : 'Check Positions'}
            </button>
          </div>
        </div>

        {error && <div className="error">{error}</div>}
        {loading && <div className="loading">Fetching positions from Arbitrum...</div>}

        {!loading && positions.length > 0 && (
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
                <th>Liq. Distance</th>
                <th>Risk Level</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((position, index) => (
                <tr key={index}>
                  <td><strong>{position.market}</strong></td>
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
                  <td><strong>{position.liqDistancePct.toFixed(2)}%</strong></td>
                  <td>
                    <span className={`badge ${position.riskLevel.toLowerCase()}`}>
                      {position.riskLevel}
                    </span>
                    {position.riskExplanation && (
                      <div className="risk-explanation">{position.riskExplanation}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Whale Monitoring Section */}
      <section className="section whale-section">
        <h2>Top Traders Whale Monitor</h2>
        <p className="section-subtitle">Monitor liquidation risk for top GMX traders via Copin</p>

        <div className="whale-controls">
          <div className="control-group">
            <label>Timeframe:</label>
            <select value={whaleTimeframe} onChange={(e) => setWhaleTimeframe(e.target.value as any)}>
              <option value="7d">7 Days</option>
              <option value="30d">30 Days</option>
              <option value="90d">90 Days</option>
            </select>
          </div>

          <div className="control-group">
            <label>Limit:</label>
            <select value={whaleLimit} onChange={(e) => setWhaleLimit(parseInt(e.target.value))}>
              <option value={10}>Top 10</option>
              <option value={25}>Top 25</option>
              <option value={50}>Top 50</option>
            </select>
          </div>

          <div className="control-group">
            <label>Protocol:</label>
            <select value={whaleProtocol} onChange={(e) => setWhaleProtocol(e.target.value as any)}>
              <option value="GMX">GMX v1</option>
              <option value="GMX_V2">GMX v2</option>
            </select>
          </div>

          <button onClick={fetchWhales} disabled={whalesLoading} className="whale-button">
            {whalesLoading ? 'Loading Whales...' : 'Load Top Traders'}
          </button>
        </div>

        {whalesError && <div className="error">{whalesError}</div>}
        {whalesLoading && <div className="loading">Fetching whale data from Copin...</div>}

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
                  <>
                    <tr
                      key={whale.address}
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
                                      <span className={`badge ${pos.riskLabel.toLowerCase()}`}>
                                        {pos.riskLabel}
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
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
