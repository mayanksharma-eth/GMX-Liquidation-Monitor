export interface Position {
  market: string;
  isLong: boolean;
  sizeUsd: number;
  collateralUsd: number;
  entryPrice: number;
  markPrice: number;
  liquidationPrice: number;
  liqDistancePct: number;
}

export interface RiskPosition extends Position {
  riskLevel: 'SAFE' | 'WARNING' | 'CRITICAL';
  riskExplanation: string;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
