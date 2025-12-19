import { NormalizedPosition } from '../adapters/position-source.interface';
import { RiskPosition, TraderSummary } from '../types/whale.types';

/**
 * Whale Risk Assessment Service
 * Applies risk classification to trader positions
 */
export class WhaleRiskService {
  /**
   * Assess risk for a single position
   */
  assessPositionRisk(position: NormalizedPosition): RiskPosition {
    const { liqDistancePct, market, isLong } = position;

    let riskLabel: 'SAFE' | 'WARNING' | 'CRITICAL';
    let explanation: string;

    const marketToken = market.split('-')[0];
    const direction = isLong ? 'drops' : 'rises';

    if (liqDistancePct >= 15) {
      riskLabel = 'SAFE';
      explanation = `SAFE: liquidates if ${marketToken} ${direction} ~${liqDistancePct.toFixed(2)}%`;
    } else if (liqDistancePct >= 7) {
      riskLabel = 'WARNING';
      explanation = `WARNING: liquidates if ${marketToken} ${direction} ~${liqDistancePct.toFixed(2)}%`;
    } else {
      riskLabel = 'CRITICAL';
      explanation = `CRITICAL: liquidates if ${marketToken} ${direction} ~${liqDistancePct.toFixed(2)}%`;
    }

    return {
      ...position,
      riskLabel,
      explanation,
    };
  }

  /**
   * Assess risk for all positions and create summary
   */
  assessTraderRisk(positions: NormalizedPosition[]): {
    riskPositions: RiskPosition[];
    summary: TraderSummary;
  } {
    if (positions.length === 0) {
      return {
        riskPositions: [],
        summary: {
          positions: 0,
          worstRisk: 'SAFE',
          closestLiqDistancePct: 100,
        },
      };
    }

    const riskPositions = positions.map(pos => this.assessPositionRisk(pos));

    // Find worst risk level
    const hasCritical = riskPositions.some(p => p.riskLabel === 'CRITICAL');
    const hasWarning = riskPositions.some(p => p.riskLabel === 'WARNING');
    const worstRisk = hasCritical ? 'CRITICAL' : hasWarning ? 'WARNING' : 'SAFE';

    // Find closest liquidation distance
    const closestLiqDistancePct = Math.min(...riskPositions.map(p => p.liqDistancePct));

    return {
      riskPositions,
      summary: {
        positions: positions.length,
        worstRisk,
        closestLiqDistancePct,
      },
    };
  }
}
