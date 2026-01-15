import { FastifyReply, FastifyRequest } from 'fastify';
import { ethers } from 'ethers';
import { CopinClient } from '../clients/copin.client';
import { SimpleCache } from '../utils/cache';
import { CopinStatus, RpcStatus, StatusResponse } from '../types';

const statusCache = new SimpleCache<StatusResponse>(20);

/**
 * Health + availability controller
 * Provides richer diagnostics than /health by actually pinging RPC and Copin
 */
export class StatusController {
  private provider: ethers.JsonRpcProvider;
  private copinClient?: CopinClient;
  private copinChain?: string;

  constructor(rpcUrl: string, copinClient?: CopinClient, copinChain?: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.copinClient = copinClient;
    this.copinChain = copinChain;
  }

  async getStatus(request: FastifyRequest, reply: FastifyReply) {
    const cached = statusCache.get('status');
    if (cached) {
      return reply.send(cached);
    }

    const [rpc, copin] = await Promise.all([this.checkRpc(), this.checkCopin()]);
    const payload: StatusResponse = {
      ok: rpc.ok && (copin ? (copin.enabled ? copin.ok : true) : true),
      timestamp: new Date().toISOString(),
      rpc,
      copin,
    };

    statusCache.set('status', payload);
    return reply.send(payload);
  }

  private async checkRpc(): Promise<RpcStatus> {
    try {
      const [network, blockNumber] = await Promise.all([
        this.provider.getNetwork(),
        this.provider.getBlockNumber(),
      ]);

      return {
        ok: true,
        chainId: Number(network.chainId),
        blockNumber,
      };
    } catch (error: any) {
      return {
        ok: false,
        error: error?.message || 'Failed to reach RPC',
      };
    }
  }

  private async checkCopin(): Promise<CopinStatus | undefined> {
    if (!this.copinClient) {
      return undefined;
    }

    if (!this.copinClient.isConfigured()) {
      return {
        ok: false,
        enabled: false,
        error: 'COPIN_API_KEY missing',
      };
    }

    try {
      await this.copinClient.ping({ protocol: 'GMX', chain: this.copinChain });
      return {
        ok: true,
        enabled: true,
      };
    } catch (error: any) {
      const message = error?.message || 'Failed to reach Copin';
      return {
        ok: false,
        enabled: true,
        rateLimited: message.toLowerCase().includes('rate limit'),
        error: message,
      };
    }
  }
}
