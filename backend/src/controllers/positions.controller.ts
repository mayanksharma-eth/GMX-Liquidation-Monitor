import { FastifyRequest, FastifyReply } from 'fastify';
import { GMXService } from '../services/gmx.service';
import { RiskService } from '../services/risk.service';
import { SimpleCache } from '../utils/cache';
import { isValidAddress, normalizeAddress } from '../utils/validation';
import { Position, RiskOverviewResponse, RiskPosition } from '../types';

const positionsCache = new SimpleCache<Position[]>(15);
const riskCache = new SimpleCache<RiskPosition[]>(15);

export class PositionsController {
  private gmxService: GMXService;
  private riskService: RiskService;

  constructor(rpcUrl: string) {
    this.gmxService = new GMXService(rpcUrl);
    this.riskService = new RiskService();
  }

  async getPositions(
    request: FastifyRequest<{ Querystring: { account: string } }>,
    reply: FastifyReply
  ) {
    const { account } = request.query;

    if (!account) {
      return reply.code(400).send({ error: 'Missing account parameter' });
    }

    if (!isValidAddress(account)) {
      return reply.code(400).send({ error: 'Invalid Ethereum address' });
    }

    try {
      const normalizedAccount = normalizeAddress(account);
      const positions = await this.getPositionsForAccount(normalizedAccount);

      return reply.send(positions);
    } catch (error) {
      console.error('Error fetching positions:', error);
      return reply.code(500).send({ error: 'Failed to fetch positions from chain' });
    }
  }

  async getRisk(
    request: FastifyRequest<{ Querystring: { account: string } }>,
    reply: FastifyReply
  ) {
    const { account } = request.query;

    if (!account) {
      return reply.code(400).send({ error: 'Missing account parameter' });
    }

    if (!isValidAddress(account)) {
      return reply.code(400).send({ error: 'Invalid Ethereum address' });
    }

    try {
      const normalizedAccount = normalizeAddress(account);
      const riskPositions = await this.getRiskForAccount(normalizedAccount);

      return reply.send(riskPositions);
    } catch (error) {
      console.error('Error assessing risk:', error);
      return reply.code(500).send({ error: 'Failed to assess position risk' });
    }
  }

  /**
   * GET /risk/overview
   * Returns risk positions plus a precomputed summary for UI dashboards
   */
  async getRiskOverview(
    request: FastifyRequest<{ Querystring: { account: string } }>,
    reply: FastifyReply
  ) {
    const { account } = request.query;

    if (!account) {
      return reply.code(400).send({ error: 'Missing account parameter' });
    }

    if (!isValidAddress(account)) {
      return reply.code(400).send({ error: 'Invalid Ethereum address' });
    }

    try {
      const normalizedAccount = normalizeAddress(account);
      const riskPositions = await this.getRiskForAccount(normalizedAccount);
      const summary = this.riskService.buildSummary(riskPositions);

      const payload: RiskOverviewResponse = {
        account: normalizedAccount,
        updatedAt: new Date().toISOString(),
        positions: riskPositions,
        summary,
      };

      return reply.send(payload);
    } catch (error) {
      console.error('Error building risk overview:', error);
      return reply.code(500).send({ error: 'Failed to build risk overview' });
    }
  }

  private async getPositionsForAccount(account: string): Promise<Position[]> {
    const cacheKey = `positions:${account}`;
    let positions = positionsCache.get(cacheKey);

    if (!positions) {
      positions = await this.gmxService.getPositions(account);
      positionsCache.set(cacheKey, positions);
    }

    return positions;
  }

  private async getRiskForAccount(account: string): Promise<RiskPosition[]> {
    const cacheKey = `risk:${account}`;
    let riskPositions = riskCache.get(cacheKey);

    if (!riskPositions) {
      const positions = await this.getPositionsForAccount(account);
      riskPositions = this.riskService.assessRisk(positions);
      riskCache.set(cacheKey, riskPositions);
    }

    return riskPositions;
  }
}
