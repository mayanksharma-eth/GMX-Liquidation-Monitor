import { ethers } from 'ethers';
import { PositionSource, NormalizedPosition } from './position-source.interface';
import { VAULT_ABI, CONTRACTS, TOKENS, MARKET_TOKENS } from '../utils/contracts';

/**
 * On-chain GMX v1 position source
 * Reads positions directly from GMX Vault contract on Arbitrum
 */
export class OnChainGMXV1Source implements PositionSource {
  private provider: ethers.JsonRpcProvider;
  private vaultContract: ethers.Contract;

  constructor(rpcUrl: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.vaultContract = new ethers.Contract(CONTRACTS.VAULT, VAULT_ABI, this.provider);
  }

  async getPositions(account: string): Promise<NormalizedPosition[]> {
    const positions: NormalizedPosition[] = [];

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
  ): Promise<NormalizedPosition | null> {
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
        entryPrice,
        markPrice: markPriceNum,
        liquidationPrice,
        liqDistancePct
      };
    } catch (error) {
      console.error('Error fetching on-chain position:', error);
      return null;
    }
  }

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

  private calculateLiquidationDistance(
    markPrice: number,
    liquidationPrice: number,
    isLong: boolean
  ): number {
    const distance = Math.abs(markPrice - liquidationPrice);
    const pct = (distance / markPrice) * 100;
    return Math.round(pct * 100) / 100;
  }
}
