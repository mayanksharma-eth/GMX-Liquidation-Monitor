import { FastifyRequest, FastifyReply } from 'fastify';
import { GMXService } from '../services/gmx.service';
import { RiskService } from '../services/risk.service';
import { SimpleCache } from '../utils/cache';
import { isValidAddress, normalizeAddress } from '../utils/validation';
import { Position, RiskPosition } from '../types';

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
      const cacheKey = `positions:${normalizedAccount}`;

      // Check cache
      let positions = positionsCache.get(cacheKey);

      if (!positions) {
        // Fetch from chain
        positions = await this.gmxService.getPositions(normalizedAccount);
        positionsCache.set(cacheKey, positions);
      }

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
      const cacheKey = `risk:${normalizedAccount}`;

      // Check cache
      let riskPositions = riskCache.get(cacheKey);

      if (!riskPositions) {
        // Fetch positions and assess risk
        const positions = await this.gmxService.getPositions(normalizedAccount);
        riskPositions = this.riskService.assessRisk(positions);
        riskCache.set(cacheKey, riskPositions);
      }

      return reply.send(riskPositions);
    } catch (error) {
      console.error('Error assessing risk:', error);
      return reply.code(500).send({ error: 'Failed to assess position risk' });
    }
  }
}
