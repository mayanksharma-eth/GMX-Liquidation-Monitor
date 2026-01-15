import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { PositionsController } from './controllers/positions.controller';
import { WhalesController } from './controllers/whales.controller';
import { StatusController } from './controllers/status.controller';
import { CopinClient } from './clients/copin.client';

// Load environment variables
dotenv.config();

const PORT = parseInt(process.env.PORT || '3001', 10);
const RPC_URL = process.env.ARBITRUM_RPC_URL || '';

// Copin configuration
const COPIN_API_BASE_URL = process.env.COPIN_API_BASE_URL || 'https://api.copin.io';
const COPIN_API_KEY = process.env.COPIN_API_KEY || process.env.API_KEY;
const COPIN_API_SECRET = process.env.COPIN_API_SECRET || process.env.API_SECRET;
const COPIN_CHAIN = process.env.COPIN_CHAIN || 'arbitrum';

if (!RPC_URL) {
  console.error('ERROR: ARBITRUM_RPC_URL environment variable is required');
  process.exit(1);
}

// Initialize Fastify
const fastify = Fastify({
  logger: true
});

// Register CORS
fastify.register(cors, {
  origin: true
});

// Initialize controllers
const positionsController = new PositionsController(RPC_URL);

// Initialize Copin client and whales controller
const copinClient = new CopinClient({
  baseUrl: COPIN_API_BASE_URL,
  apiKey: COPIN_API_KEY,
  apiSecret: COPIN_API_SECRET,
  maxRetries: 2,
  retryDelay: 1000,
  defaultChain: COPIN_CHAIN,
});
const whalesController = new WhalesController(copinClient, COPIN_CHAIN);
const statusController = new StatusController(RPC_URL, copinClient, COPIN_CHAIN);

// Routes

// Health check
fastify.get('/health', async (request, reply) => {
  return { ok: true };
});

// Extended status (RPC + Copin)
fastify.get('/status', async (request, reply) => {
  return statusController.getStatus(request as any, reply);
});

// Original endpoints (on-chain)
fastify.get('/positions', async (request, reply) => {
  return positionsController.getPositions(request as any, reply);
});

fastify.get('/risk', async (request, reply) => {
  return positionsController.getRisk(request as any, reply);
});

fastify.get('/risk/overview', async (request, reply) => {
  return positionsController.getRiskOverview(request as any, reply);
});

// Whale monitoring endpoints (Copin-based)
fastify.get('/top-traders', async (request, reply) => {
  return whalesController.getTopTraders(request as any, reply);
});

fastify.get('/whales/risk', async (request, reply) => {
  return whalesController.getWhalesRisk(request as any, reply);
});

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`\n🚀 Server running at http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`📈 Endpoints:
  Original (on-chain):
    - GET /positions?account=0x...
    - GET /risk?account=0x...
    - GET /risk/overview?account=0x...

  Whale Monitoring (Copin):
    - GET /top-traders?timeframe=7d&limit=25&protocol=GMX
    - GET /whales/risk?timeframe=7d&limit=25&protocol=GMX

  Diagnostics:
    - GET /status\n`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
