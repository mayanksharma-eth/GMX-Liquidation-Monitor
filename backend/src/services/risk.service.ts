import { Position, RiskPosition } from '../types';

export class RiskService {
  assessRisk(positions: Position[]): RiskPosition[] {
    return positions.map(position => {
      const { liqDistancePct, market, isLong } = position;

      let riskLevel: 'SAFE' | 'WARNING' | 'CRITICAL';
      let riskExplanation: string;

      if (liqDistancePct >= 15) {
        riskLevel = 'SAFE';
        riskExplanation = `SAFE: liquidates if ${market.split('-')[0]} ${isLong ? 'drops' : 'rises'} ~${liqDistancePct.toFixed(2)}%`;
      } else if (liqDistancePct >= 7) {
        riskLevel = 'WARNING';
        riskExplanation = `WARNING: liquidates if ${market.split('-')[0]} ${isLong ? 'drops' : 'rises'} ~${liqDistancePct.toFixed(2)}%`;
      } else {
        riskLevel = 'CRITICAL';
        riskExplanation = `CRITICAL: liquidates if ${market.split('-')[0]} ${isLong ? 'drops' : 'rises'} ~${liqDistancePct.toFixed(2)}%`;
      }

      return {
        ...position,
        riskLevel,
        riskExplanation
      };
    });
  }
}
