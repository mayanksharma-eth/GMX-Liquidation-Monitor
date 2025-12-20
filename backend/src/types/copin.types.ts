import { z } from 'zod';

/**
 * Zod schemas for Copin Analyzer API responses
 * These provide runtime validation of external API data
 */

// Top Trader Schema
export const CopinTraderSchema = z.object({
  address: z.string(),
  rank: z.number().optional(),
  volumeUsd: z.number().optional(),
  pnlUsd: z.number().optional(),
  winRate: z.number().optional(),
  totalTrade: z.number().optional(),
  totalWin: z.number().optional(),
  totalLoss: z.number().optional(),
});

export const CopinTopTradersResponseSchema = z.object({
  data: z.array(CopinTraderSchema),
  meta: z.object({
    total: z.number().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
  }).optional(),
});

// Position Schema
export const CopinPositionSchema = z.object({
  // Core fields
  indexToken: z.string(), // Token symbol like "ETH", "BTC"
  collateralToken: z.string().optional(),
  side: z.enum(['LONG', 'SHORT', 'long', 'short']),

  // Size and collateral
  size: z.number().optional(), // Size in USD
  sizeUsd: z.number().optional(),
  collateral: z.number().optional(), // Collateral in USD
  collateralUsd: z.number().optional(),

  // Prices
  entryPrice: z.number().optional(),
  averagePrice: z.number().optional(),
  markPrice: z.number().optional(),
  currentPrice: z.number().optional(),
  liquidationPrice: z.number().optional(),

  // PnL
  pnl: z.number().optional(),
  pnlUsd: z.number().optional(),
  roi: z.number().optional(),

  // Leverage
  leverage: z.number().optional(),
});

export const CopinPositionsResponseSchema = z.object({
  data: z.array(CopinPositionSchema),
  meta: z.object({
    total: z.number().optional(),
  }).optional(),
});

// Trader Statistics Schema (for /position/statistic/filter)
export const CopinTraderStatisticSchema = z.object({
  account: z.string(),
  type: z.string(), // D7, D30, etc.
  totalVolume: z.number().optional(),
  totalTrade: z.number().optional(),
  totalWin: z.number().optional(),
  totalLose: z.number().optional(),
  totalLiquidation: z.number().optional(),
  realisedPnl: z.number().optional(),
  avgRoi: z.number().optional(),
  maxRoi: z.number().optional(),
  lastTradeAtTs: z.number().optional(),
});

export const CopinTraderStatisticsResponseSchema = z.object({
  data: z.array(CopinTraderStatisticSchema),
  meta: z.object({
    total: z.number().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
  }).optional(),
});

// Inferred TypeScript types
export type CopinTrader = z.infer<typeof CopinTraderSchema>;
export type CopinPosition = z.infer<typeof CopinPositionSchema>;
export type CopinTraderStatistic = z.infer<typeof CopinTraderStatisticSchema>;
export type CopinTopTradersResponse = z.infer<typeof CopinTopTradersResponseSchema>;
export type CopinPositionsResponse = z.infer<typeof CopinPositionsResponseSchema>;
export type CopinTraderStatisticsResponse = z.infer<typeof CopinTraderStatisticsResponseSchema>;

// Request parameter types
export interface GetTopTradersParams {
  protocol: 'GMX' | 'GMX_V2';
  timeframe: '7d' | '30d' | '90d';
  limit: number;
  chain?: string;
}

export interface GetTraderPositionsParams {
  address: string;
  protocol: 'GMX' | 'GMX_V2';
  chain: string;
}
