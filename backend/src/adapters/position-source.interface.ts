/**
 * Normalized position structure used across all data sources
 * This is the contract that both on-chain and Copin adapters must return
 */
export interface NormalizedPosition {
  market: string;           // "ETH-USD", "BTC-USD", etc.
  isLong: boolean;          // true for long, false for short
  sizeUsd: number;          // Position size in USD
  collateralUsd: number;    // Collateral in USD
  entryPrice: number;       // Average entry price
  markPrice: number;        // Current mark/oracle price
  liquidationPrice: number; // Liquidation threshold price
  liqDistancePct: number;   // Distance to liquidation as percentage
}

/**
 * Abstract interface for position data sources
 * Implementations: OnChainGMXV1Source, CopinSource
 */
export interface PositionSource {
  /**
   * Fetch all positions for a given account address
   * @param account - Ethereum address (checksummed or lowercase)
   * @returns Array of normalized positions
   */
  getPositions(account: string): Promise<NormalizedPosition[]>;
}
