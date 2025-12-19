import { FastifyRequest, FastifyReply } from 'fastify';
import pLimit from 'p-limit';
import { CopinClient } from '../clients/copin.client';
import { CopinGMXSource } from '../adapters/copin-source';
import { WhaleRiskService } from '../services/whale-risk.service';
import { SimpleCache } from '../utils/cache';
import {
  WhalesRiskResponse,
  TopTradersResponse,
  WhaleTraderRisk,
  TopTraderInfo,
} from '../types/whale.types';

interface TopTradersQuery {
  timeframe?: '7d' | '30d' | '90d';
  limit?: string;
  protocol?: 'GMX' | 'GMX_V2';
}

interface WhalesRiskQuery {
  timeframe?: '7d' | '30d' | '90d';
  limit?: string;
  protocol?: 'GMX' | 'GMX_V2';
}

// Caches
const leaderboardCache = new SimpleCache<TopTraderInfo[]>(60); // 60 second TTL
const traderPositionsCache = new SimpleCache<WhaleTraderRisk>(30); // 30 second TTL

// Concurrency limit for parallel API calls
const limit = pLimit(5); // Max 5 concurrent Copin API calls

export class WhalesController {
  private copinClient: CopinClient;
  private copinSource: CopinGMXSource;
  private riskService: WhaleRiskService;
  private chain: string;

  constructor(copinClient: CopinClient, chain: string = 'arbitrum') {
    this.copinClient = copinClient;
    this.chain = chain;
    this.copinSource = new CopinGMXSource(copinClient, { chain });
    this.riskService = new WhaleRiskService();
  }

  /**
   * GET /top-traders
   * Fetch leaderboard of top GMX traders
   */
  async getTopTraders(
    request: FastifyRequest<{ Querystring: TopTradersQuery }>,
    reply: FastifyReply
  ) {
    const timeframe = request.query.timeframe || '7d';
    const limitParam = parseInt(request.query.limit || '25', 10);
    const protocol = request.query.protocol || 'GMX';

    // Validate params
    if (!['7d', '30d', '90d'].includes(timeframe)) {
      return reply.code(400).send({ error: 'Invalid timeframe. Use 7d, 30d, or 90d' });
    }

    if (limitParam < 1 || limitParam > 100) {
      return reply.code(400).send({ error: 'Limit must be between 1 and 100' });
    }

    if (!['GMX', 'GMX_V2'].includes(protocol)) {
      return reply.code(400).send({ error: 'Invalid protocol. Use GMX or GMX_V2' });
    }

    try {
      const cacheKey = `leaderboard:${protocol}:${timeframe}:${limitParam}`;

      // Check cache
      let traders = leaderboardCache.get(cacheKey);

      if (!traders) {
        // Fetch from Copin
        const copinTraders = await this.copinClient.getTopTraders({
          protocol,
          timeframe,
          limit: limitParam,
          chain: this.chain,
        });

        traders = copinTraders.map((trader, index) => ({
          address: trader.address,
          rank: trader.rank || index + 1,
          volumeUsd: trader.volumeUsd,
          pnlUsd: trader.pnlUsd,
          winRate: trader.winRate,
        }));

        leaderboardCache.set(cacheKey, traders);
      }

      const response: TopTradersResponse = {
        timeframe,
        protocol,
        traders,
      };

      return reply.send(response);
    } catch (error: any) {
      console.error('Error fetching top traders:', error);

      // Check for rate limiting
      if (error.message?.includes('rate limit')) {
        return reply.code(503).send({
          error: 'Copin API rate limit exceeded',
          message: 'Please try again in a few moments',
        });
      }

      return reply.code(500).send({ error: 'Failed to fetch top traders from Copin' });
    }
  }

  /**
   * GET /whales/risk
   * Fetch top traders and their position risk assessment
   */
  async getWhalesRisk(
    request: FastifyRequest<{ Querystring: WhalesRiskQuery }>,
    reply: FastifyReply
  ) {
    const timeframe = request.query.timeframe || '7d';
    const limitParam = parseInt(request.query.limit || '25', 10);
    const protocol = request.query.protocol || 'GMX';

    // Validate params
    if (!['7d', '30d', '90d'].includes(timeframe)) {
      return reply.code(400).send({ error: 'Invalid timeframe. Use 7d, 30d, or 90d' });
    }

    if (limitParam < 1 || limitParam > 100) {
      return reply.code(400).send({ error: 'Limit must be between 1 and 100' });
    }

    if (!['GMX', 'GMX_V2'].includes(protocol)) {
      return reply.code(400).send({ error: 'Invalid protocol. Use GMX or GMX_V2' });
    }

    try {
      // Step 1: Fetch top traders (with cache)
      const leaderboardCacheKey = `leaderboard:${protocol}:${timeframe}:${limitParam}`;
      let topTraders = leaderboardCache.get(leaderboardCacheKey);

      if (!topTraders) {
        const copinTraders = await this.copinClient.getTopTraders({
          protocol,
          timeframe,
          limit: limitParam,
          chain: this.chain,
        });

        topTraders = copinTraders.map((trader, index) => ({
          address: trader.address,
          rank: trader.rank || index + 1,
          volumeUsd: trader.volumeUsd,
          pnlUsd: trader.pnlUsd,
          winRate: trader.winRate,
        }));

        leaderboardCache.set(leaderboardCacheKey, topTraders);
      }

      // Step 2: Fetch positions for each trader with concurrency limit
      const traderRiskPromises = topTraders.map(trader =>
        limit(async () => {
          const positionsCacheKey = `trader:${protocol}:${trader.address}`;

          // Check individual trader cache
          let traderRisk = traderPositionsCache.get(positionsCacheKey);

          if (!traderRisk) {
            // Fetch positions from Copin
            const positions = await this.copinSource.getPositions(trader.address);

            // Assess risk
            const { riskPositions, summary } = this.riskService.assessTraderRisk(positions);

            traderRisk = {
              address: trader.address,
              rank: trader.rank,
              summary,
              positions: riskPositions,
            };

            traderPositionsCache.set(positionsCacheKey, traderRisk);
          }

          return traderRisk;
        })
      );

      const traders = await Promise.all(traderRiskPromises);

      const response: WhalesRiskResponse = {
        timeframe,
        protocol,
        updatedAt: new Date().toISOString(),
        traders,
      };

      return reply.send(response);
    } catch (error: any) {
      console.error('Error assessing whale risk:', error);

      // Check for rate limiting
      if (error.message?.includes('rate limit')) {
        return reply.code(503).send({
          error: 'Copin API rate limit exceeded',
          message: 'Please try again in a few moments',
        });
      }

      return reply.code(500).send({ error: 'Failed to assess whale risk' });
    }
  }
}
