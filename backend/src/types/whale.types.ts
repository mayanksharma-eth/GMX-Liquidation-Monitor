import { NormalizedPosition } from '../adapters/position-source.interface';

export interface RiskPosition extends NormalizedPosition {
  riskLabel: 'SAFE' | 'WARNING' | 'CRITICAL';
  explanation: string;
}

export interface TraderSummary {
  positions: number;
  worstRisk: 'SAFE' | 'WARNING' | 'CRITICAL';
  closestLiqDistancePct: number;
}

export interface WhaleTraderRisk {
  address: string;
  rank: number;
  summary: TraderSummary;
  positions: RiskPosition[];
}

export interface TopTraderInfo {
  address: string;
  rank: number;
  volumeUsd?: number;
  pnlUsd?: number;
  winRate?: number;
}

export interface WhalesRiskResponse {
  timeframe: string;
  protocol: string;
  updatedAt: string;
  traders: WhaleTraderRisk[];
}

export interface TopTradersResponse {
  timeframe: string;
  protocol: string;
  traders: TopTraderInfo[];
}
