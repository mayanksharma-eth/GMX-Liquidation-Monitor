import { Position, RiskPosition, RiskSummary } from '../types';

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

  buildSummary(riskPositions: RiskPosition[]): RiskSummary {
    if (riskPositions.length === 0) {
      return {
        positions: 0,
        atRisk: 0,
        critical: 0,
        totalSizeUsd: 0,
        totalCollateralUsd: 0,
        averageLeverage: null,
        closestLiqDistancePct: null,
        worstRisk: 'SAFE',
      };
    }

    const atRisk = riskPositions.filter(p => p.riskLevel !== 'SAFE').length;
    const critical = riskPositions.filter(p => p.riskLevel === 'CRITICAL').length;
    const totalSizeUsd = riskPositions.reduce((sum, pos) => sum + pos.sizeUsd, 0);
    const totalCollateralUsd = riskPositions.reduce((sum, pos) => sum + pos.collateralUsd, 0);
    const averageLeverageRaw = riskPositions.reduce((sum, pos) => sum + (pos.leverage || 0), 0) / riskPositions.length;
    const averageLeverage = Number.isFinite(averageLeverageRaw)
      ? Math.round(averageLeverageRaw * 100) / 100
      : null;
    const closestLiqDistancePct = Math.min(...riskPositions.map(p => p.liqDistancePct));
    const worstRisk = critical > 0 ? 'CRITICAL' : atRisk > 0 ? 'WARNING' : 'SAFE';

    return {
      positions: riskPositions.length,
      atRisk,
      critical,
      totalSizeUsd,
      totalCollateralUsd,
      averageLeverage,
      closestLiqDistancePct,
      worstRisk,
    };
  }
}
