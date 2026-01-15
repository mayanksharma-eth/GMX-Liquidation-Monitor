import { ethers } from 'ethers';
import { Position } from '../types';
import { VAULT_ABI, READER_ABI, CONTRACTS, TOKENS, MARKET_TOKENS } from '../utils/contracts';

export class GMXService {
  private provider: ethers.JsonRpcProvider;
  private vaultContract: ethers.Contract;
  private readerContract: ethers.Contract;

  constructor(rpcUrl: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.vaultContract = new ethers.Contract(CONTRACTS.VAULT, VAULT_ABI, this.provider);
    this.readerContract = new ethers.Contract(CONTRACTS.READER, READER_ABI, this.provider);
  }

  async getPositions(account: string): Promise<Position[]> {
    const positions: Position[] = [];

    // Check positions for each market token (ETH, BTC) with USDC collateral
    for (const indexToken of MARKET_TOKENS) {
      // Check long position
      const longPosition = await this.getPosition(account, TOKENS.USDC.address, indexToken.address, true);
      if (longPosition) {
        positions.push(longPosition);
      }

      // Check short position
      const shortPosition = await this.getPosition(account, TOKENS.USDC.address, indexToken.address, false);
      if (shortPosition) {
        positions.push(shortPosition);
      }
    }

    return positions;
  }

  private async getPosition(
    account: string,
    collateralToken: string,
    indexToken: string,
    isLong: boolean
  ): Promise<Position | null> {
    try {
      const positionData = await this.vaultContract.getPosition(
        account,
        collateralToken,
        indexToken,
        isLong
      );

      const [size, collateral, averagePrice] = positionData;

      // Position doesn't exist if size is 0
      if (size === 0n) {
        return null;
      }

      // Get current mark price
      const markPrice = isLong
        ? await this.vaultContract.getMinPrice(indexToken)
        : await this.vaultContract.getMaxPrice(indexToken);

      // Get token info
      const tokenInfo = MARKET_TOKENS.find(t => t.address.toLowerCase() === indexToken.toLowerCase());
      const market = tokenInfo ? `${tokenInfo.symbol}-USD` : 'UNKNOWN-USD';

      // Convert from contract units to human readable
      const PRICE_PRECISION = 10n ** 30n;
      const USD_PRECISION = 10n ** 30n;

      const sizeUsd = Number(size) / Number(USD_PRECISION);
      const collateralUsd = Number(collateral) / Number(USD_PRECISION);
      const leverage = collateralUsd > 0 ? sizeUsd / collateralUsd : 0;
      const entryPrice = Number(averagePrice) / Number(PRICE_PRECISION);
      const markPriceNum = Number(markPrice) / Number(PRICE_PRECISION);

      // Calculate liquidation price
      const liquidationPrice = this.calculateLiquidationPrice(
        sizeUsd,
        collateralUsd,
        entryPrice,
        isLong
      );

      // Calculate liquidation distance percentage
      const liqDistancePct = this.calculateLiquidationDistance(
        markPriceNum,
        liquidationPrice,
        isLong
      );

      return {
        market,
        isLong,
        sizeUsd,
        collateralUsd,
        leverage,
        entryPrice,
        markPrice: markPriceNum,
        liquidationPrice,
        liqDistancePct
      };
    } catch (error) {
      console.error('Error fetching position:', error);
      return null;
    }
  }

  private calculateLiquidationPrice(
    sizeUsd: number,
    collateralUsd: number,
    entryPrice: number,
    isLong: boolean
  ): number {
    if (collateralUsd <= 0 || sizeUsd <= 0) {
      return entryPrice;
    }

    // GMX v1 liquidation logic (simplified):
    // Position is liquidated when: losses + fees >= collateral
    //
    // Assumptions for MVP:
    // - Liquidation fee: ~$5 (we'll use 0.5% of collateral as approximation)
    // - Margin fees: already accounted in collateral reduction
    // - Funding fees: ignored in MVP (would need historical tracking)
    //
    // For LONG: liquidation when (entryPrice - markPrice) * size/entryPrice + fees >= collateral
    //   => (entryPrice - liqPrice) * leverage + fees >= collateral
    //   => liqPrice = entryPrice - (collateral - fees) / leverage
    //
    // For SHORT: liquidation when (markPrice - entryPrice) * size/entryPrice + fees >= collateral
    //   => liqPrice = entryPrice + (collateral - fees) / leverage

    const leverage = sizeUsd / collateralUsd;
    if (!isFinite(leverage) || leverage <= 0) {
      return entryPrice;
    }

    const liquidationFeeUsd = Math.max(5, collateralUsd * 0.005); // ~$5 or 0.5% of collateral
    const remainingCollateral = collateralUsd - liquidationFeeUsd;

    if (isLong) {
      // Long liquidation price = entry - (remaining collateral / leverage)
      const liqPrice = entryPrice - (remainingCollateral / leverage);
      return Math.max(0, liqPrice); // Can't be negative
    } else {
      // Short liquidation price = entry + (remaining collateral / leverage)
      return entryPrice + (remainingCollateral / leverage);
    }
  }

  private calculateLiquidationDistance(
    markPrice: number,
    liquidationPrice: number,
    isLong: boolean
  ): number {
    // Calculate percentage distance to liquidation
    if (markPrice <= 0) {
      return 0;
    }

    const distance = Math.abs(markPrice - liquidationPrice);
    const pct = (distance / markPrice) * 100;
    return Math.round(pct * 100) / 100; // Round to 2 decimals
  }
}
