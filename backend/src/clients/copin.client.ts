import { createHmac } from 'crypto';
import {
  CopinTopTradersResponseSchema,
  CopinPositionsResponseSchema,
  CopinTraderStatisticsResponseSchema,
  GetTopTradersParams,
  GetTraderPositionsParams,
  CopinTrader,
  CopinPosition,
  CopinTraderStatistic,
} from '../types/copin.types';

/**
 * Copin Analyzer API Client
 * Updated with actual Copin API endpoints and HMAC authentication
 */

// Configuration - Real Copin API endpoints
const ENDPOINTS = {
  LEADERBOARDS: '/leaderboards/page',                    // GET - Top traders leaderboard
  POSITION_FILTER: '/:PROTOCOL/position/filter',         // POST - Filter trader positions
  TRADER_STATS: '/public/:PROTOCOL/position/statistic/filter', // POST - Trader statistics
};

interface CopinClientConfig {
  baseUrl: string;
  apiKey?: string;
  apiSecret?: string;
  maxRetries?: number;
  retryDelay?: number;
}

export class CopinClient {
  private baseUrl: string;
  private apiKey?: string;
  private apiSecret?: string;
  private maxRetries: number;
  private retryDelay: number;

  constructor(config: CopinClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.maxRetries = config.maxRetries || 2;
    this.retryDelay = config.retryDelay || 1000; // 1 second
  }

  /**
   * Fetch top traders leaderboard with automatic fallback
   * Tries /leaderboards/page first, falls back to /position/statistic/filter if empty
   */
  async getTopTraders(params: GetTopTradersParams): Promise<CopinTrader[]> {
    // Try leaderboard first (snapshot-based)
    const leaderboardTraders = await this.getTopTradersFromLeaderboard(params);

    if (leaderboardTraders.length > 0) {
      console.log(`Found ${leaderboardTraders.length} traders from leaderboard`);
      return leaderboardTraders;
    }

    // Fallback to statistics filter (more reliable for active traders)
    console.log(`📊 Leaderboard empty for ${params.protocol}, trying statistics filter...`);
    const statisticsTraders = await this.getTopTradersFromStatistics(params);

    if (statisticsTraders.length > 0) {
      console.log(`✅ Found ${statisticsTraders.length} traders from statistics`);
    } else {
      console.log(`ℹ️  No trader data available for ${params.protocol} (${params.timeframe})`);
    }

    return statisticsTraders;
  }

  /**
   * Fetch top traders from leaderboard snapshot
   * Uses GET /leaderboards/page
   */
  private async getTopTradersFromLeaderboard(params: GetTopTradersParams): Promise<CopinTrader[]> {
    try {
      // Map timeframe to Copin's statisticType enum
      let statisticType = 'WEEK';
      if (params.timeframe === '30d' || params.timeframe === '90d') {
        statisticType = 'MONTH';
      }

      const queryParams = new URLSearchParams({
        protocol: params.protocol,
        queryDate: Date.now().toString(),
        statisticType: statisticType,
        limit: params.limit.toString(),
        offset: '0',
        sort_by: 'ranking',
        sort_type: 'asc',
      });

      const url = `${this.baseUrl}${ENDPOINTS.LEADERBOARDS}?${queryParams}`;
      const response = await this.fetchWithRetry(url, 'GET');

      const parsed = CopinTopTradersResponseSchema.parse(response);
      return parsed.data;
    } catch (e) {
      console.warn('Leaderboard fetch failed:', e instanceof Error ? e.message : 'Unknown error');
      return [];
    }
  }

  /**
   * Fetch top traders from statistics filter (more reliable)
   * Uses POST /public/:PROTOCOL/position/statistic/filter
   */
  private async getTopTradersFromStatistics(params: GetTopTradersParams): Promise<CopinTrader[]> {
    try {
      // Map timeframe to Copin's type enum
      let typeValue = 'D7';
      if (params.timeframe === '30d') {
        typeValue = 'D30';
      } else if (params.timeframe === '90d') {
        typeValue = 'D90';
      }

      // Replace :PROTOCOL in endpoint path
      const protocol = params.protocol.toUpperCase(); // Keep as-is: GMX or GMX_V2
      const endpoint = ENDPOINTS.TRADER_STATS.replace(':PROTOCOL', protocol);
      const url = `${this.baseUrl}${endpoint}`;

      const requestBody = {
        pagination: {
          limit: params.limit,
          offset: 0,
        },
        queries: [
          { fieldName: 'type', value: typeValue }
        ],
        ranges: [
          { fieldName: 'totalTrade', gte: 1 }, // At least 1 trade
        ],
        sortBy: 'totalVolume',
        sortType: 'desc',
      };

      const response = await this.fetchWithRetry(url, 'POST', requestBody);
      const parsed = CopinTraderStatisticsResponseSchema.parse(response);

      // Convert CopinTraderStatistic to CopinTrader format
      return parsed.data.map((stat: CopinTraderStatistic) => ({
        address: stat.account,
        rank: 0, // No rank in statistics
        volumeUsd: stat.totalVolume,
        pnlUsd: stat.realisedPnl,
        winRate: stat.totalWin && stat.totalTrade
          ? (stat.totalWin / stat.totalTrade) * 100
          : undefined,
        totalTrade: stat.totalTrade,
        totalWin: stat.totalWin,
        totalLoss: stat.totalLose,
      }));
    } catch (e) {
      console.warn('Statistics filter fetch failed:', e instanceof Error ? e.message : 'Unknown error');
      return [];
    }
  }

  /**
   * Fetch positions for a specific trader
   * Uses POST /:PROTOCOL/position/filter
   */
  async getTraderPositions(params: GetTraderPositionsParams): Promise<CopinPosition[]> {
    // Replace :PROTOCOL in endpoint path
    const protocol = params.protocol.toLowerCase().replace('_', ''); // GMX_V2 -> gmxv2
    const endpoint = ENDPOINTS.POSITION_FILTER.replace(':PROTOCOL', protocol);
    const url = `${this.baseUrl}${endpoint}`;

    // Copin uses POST with JSON body for filtering
    const requestBody = {
      queries: [
        {
          fieldName: 'account',
          value: params.address.toLowerCase(),
        }
      ],
      ranges: [],
      sortBy: 'openBlockTime',
      sortType: 'desc',
      limit: 100,
      offset: 0,
    };

    const response = await this.fetchWithRetry(url, 'POST', requestBody);

    // Try to validate, but be flexible
    try {
      const parsed = CopinPositionsResponseSchema.parse(response);
      return parsed.data;
    } catch (e) {
      console.warn('Copin positions response structure differs, adapting...');
      if (Array.isArray(response)) {
        return response;
      }
      if (response.data && Array.isArray(response.data)) {
        return response.data;
      }
      return [];
    }
  }

  /**
   * Generate HMAC signature for authentication
   */
  private generateHmacSignature(timestamp: string, method: string, path: string, body?: string): string {
    if (!this.apiSecret) {
      return '';
    }

    // Create signature string: timestamp + method + path + body
    const signatureString = timestamp + method + path + (body || '');

    // Create HMAC SHA256 signature
    const hmac = createHmac('sha256', this.apiSecret);
    hmac.update(signatureString);
    return hmac.digest('hex');
  }

  /**
   * Fetch with retry logic and exponential backoff
   */
  private async fetchWithRetry(
    url: string,
    method: 'GET' | 'POST' = 'GET',
    body?: any,
    attempt: number = 0
  ): Promise<any> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Prepare request body
      const bodyString = body ? JSON.stringify(body) : undefined;

      // HMAC Authentication (if both key and secret are provided)
      if (this.apiKey && this.apiSecret) {
        const timestamp = Date.now().toString();
        const urlPath = new URL(url).pathname + new URL(url).search;
        const signature = this.generateHmacSignature(timestamp, method, urlPath, bodyString);

        // Set HMAC headers
        headers['X-BAPI-API-KEY'] = this.apiKey;
        headers['X-BAPI-TIMESTAMP'] = timestamp;
        headers['X-BAPI-SIGN'] = signature;

        // Also try alternative header names
        headers['api-key'] = this.apiKey;
        headers['timestamp'] = timestamp;
        headers['signature'] = signature;
      } else if (this.apiKey) {
        // Fallback to simple API key auth
        headers['Authorization'] = `Bearer ${this.apiKey}`;
        headers['X-API-Key'] = this.apiKey;
        headers['api-key'] = this.apiKey;
      }

      const options: RequestInit = {
        method,
        headers,
      };

      if (bodyString && method === 'POST') {
        options.body = bodyString;
      }

      const response = await fetch(url, options);

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : this.retryDelay * Math.pow(2, attempt);

        if (attempt < this.maxRetries) {
          console.warn(`Rate limited by Copin API, retrying in ${waitTime}ms...`);
          await this.sleep(waitTime);
          return this.fetchWithRetry(url, method, body, attempt + 1);
        } else {
          throw new Error('Copin API rate limit exceeded. Please try again later.');
        }
      }

      // Handle other HTTP errors
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Copin API error (${response.status}): ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      // Retry on network errors
      if (attempt < this.maxRetries && this.isRetryableError(error)) {
        const waitTime = this.retryDelay * Math.pow(2, attempt);
        console.warn(`Copin API request failed, retrying in ${waitTime}ms...`, error);
        await this.sleep(waitTime);
        return this.fetchWithRetry(url, method, body, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Check if error is retryable (network errors, timeouts, etc.)
   */
  private isRetryableError(error: any): boolean {
    return (
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT' ||
      error.code === 'ENOTFOUND' ||
      error.message?.includes('fetch failed')
    );
  }

  /**
   * Sleep utility for backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
