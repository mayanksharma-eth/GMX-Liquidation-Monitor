import { PositionSource, NormalizedPosition } from './position-source.interface';
import { CopinClient } from '../clients/copin.client';
import { CopinPosition } from '../types/copin.types';

/**
 * Copin-based GMX position source
 * Fetches positions via Copin Analyzer API instead of on-chain reads
 */
export class CopinGMXSource implements PositionSource {
  private client: CopinClient;
  private protocol: 'GMX' | 'GMX_V2';
  private chain: string;

  constructor(
    client: CopinClient,
    options: {
      protocol?: 'GMX' | 'GMX_V2';
      chain?: string;
    } = {}
  ) {
    this.client = client;
    this.protocol = options.protocol || 'GMX';
    this.chain = options.chain || 'arbitrum';
  }

  async getPositions(account: string): Promise<NormalizedPosition[]> {
    try {
      const copinPositions = await this.client.getTraderPositions({
        address: account,
        protocol: this.protocol,
        chain: this.chain,
      });

      return copinPositions
        .map(pos => this.normalizePosition(pos))
        .filter((pos): pos is NormalizedPosition => pos !== null);
    } catch (error) {
      console.error('Error fetching positions from Copin:', error);
      return [];
    }
  }

  /**
   * Convert Copin position format to NormalizedPosition
   */
  private normalizePosition(copinPos: CopinPosition): NormalizedPosition | null {
    try {
      // Extract market symbol
      const market = `${copinPos.indexToken}-USD`;

      // Determine side (long/short)
      const side = copinPos.side.toUpperCase();
      if (side !== 'LONG' && side !== 'SHORT') {
        console.warn(`Unknown position side: ${copinPos.side}`);
        return null;
      }
      const isLong = side === 'LONG';

      // Get size (try multiple field names)
      const sizeUsd = copinPos.sizeUsd || copinPos.size;
      if (!sizeUsd) {
        console.warn('Position missing size data');
        return null;
      }

      // Get collateral (try multiple field names)
      const collateralUsd = copinPos.collateralUsd || copinPos.collateral;
      if (!collateralUsd) {
        console.warn('Position missing collateral data');
        return null;
      }

      // Get entry price (try multiple field names)
      const entryPrice = copinPos.entryPrice || copinPos.averagePrice;
      if (!entryPrice) {
        console.warn('Position missing entry price');
        return null;
      }

      // Get mark price (try multiple field names)
      const markPrice = copinPos.markPrice || copinPos.currentPrice;
      if (!markPrice) {
        console.warn('Position missing mark price');
        return null;
      }

      // Get liquidation price - prefer Copin's value if available
      let liquidationPrice: number;
      if (copinPos.liquidationPrice && copinPos.liquidationPrice > 0) {
        // Use Copin's liquidation price
        liquidationPrice = copinPos.liquidationPrice;
      } else {
        // Calculate approximate liquidation price
        liquidationPrice = this.calculateLiquidationPrice(
          sizeUsd,
          collateralUsd,
          entryPrice,
          isLong
        );
      }

      // Calculate liquidation distance
      const liqDistancePct = this.calculateLiquidationDistance(
        markPrice,
        liquidationPrice,
        isLong
      );

      return {
        market,
        isLong,
        sizeUsd,
        collateralUsd,
        entryPrice,
        markPrice,
        liquidationPrice,
        liqDistancePct,
      };
    } catch (error) {
      console.error('Error normalizing Copin position:', error);
      return null;
    }
  }

  /**
   * Calculate approximate liquidation price
   * Used when Copin doesn't provide liquidationPrice field
   *
   * Assumptions:
   * - Liquidation fee: ~$5 or 0.5% of collateral
   * - Funding fees: NOT included (would require historical data)
   * - Simplified GMX v1 logic
   */
  private calculateLiquidationPrice(
    sizeUsd: number,
    collateralUsd: number,
    entryPrice: number,
    isLong: boolean
  ): number {
    const leverage = sizeUsd / collateralUsd;
    const liquidationFeeUsd = Math.max(5, collateralUsd * 0.005);
    const remainingCollateral = collateralUsd - liquidationFeeUsd;

    if (isLong) {
      const liqPrice = entryPrice - (remainingCollateral / leverage);
      return Math.max(0, liqPrice);
    } else {
      return entryPrice + (remainingCollateral / leverage);
    }
  }

  /**
   * Calculate distance to liquidation as percentage
   */
  private calculateLiquidationDistance(
    markPrice: number,
    liquidationPrice: number,
    isLong: boolean
  ): number {
    const distance = Math.abs(markPrice - liquidationPrice);
    const pct = (distance / markPrice) * 100;
    return Math.round(pct * 100) / 100; // Round to 2 decimals
  }
}
