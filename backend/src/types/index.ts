export interface Position {
  market: string;
  isLong: boolean;
  sizeUsd: number;
  collateralUsd: number;
  leverage: number;
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

export interface RiskSummary {
  positions: number;
  atRisk: number;
  critical: number;
  totalSizeUsd: number;
  totalCollateralUsd: number;
  averageLeverage: number | null;
  closestLiqDistancePct: number | null;
  worstRisk: 'SAFE' | 'WARNING' | 'CRITICAL';
}

export interface RiskOverviewResponse {
  account: string;
  updatedAt: string;
  positions: RiskPosition[];
  summary: RiskSummary;
}

export interface RpcStatus {
  ok: boolean;
  chainId?: number;
  blockNumber?: number;
  error?: string;
}

export interface CopinStatus {
  ok: boolean;
  enabled: boolean;
  rateLimited?: boolean;
  error?: string;
}

export interface StatusResponse {
  ok: boolean;
  timestamp: string;
  rpc: RpcStatus;
  copin?: CopinStatus;
}
