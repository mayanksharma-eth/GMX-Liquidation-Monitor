# Copin Analyzer Integration Guide

This document explains how the whale monitoring feature works and how to configure Copin Analyzer API integration.

## Overview

The whale monitoring feature uses **Copin Analyzer API** to:
1. Fetch a leaderboard of top GMX traders
2. Get position data for each trader
3. Compute liquidation risk metrics

This is separate from the original wallet checker, which reads positions directly from on-chain GMX contracts.

## Architecture

### Data Source Adapter Pattern

The system uses a clean adapter pattern for position data sources:

```
PositionSource Interface
├── OnChainGMXV1Source (on-chain reads via ethers)
└── CopinGMXSource (Copin API reads)
```

Both adapters return the same `NormalizedPosition` structure, making risk assessment consistent across data sources.

## Copin API Configuration

### Environment Variables

Add these to `backend/.env`:

```bash
# Copin API Base URL (default: https://api.copin.io)
COPIN_API_BASE_URL=https://api.copin.io

# Your Copin API Key (required for whale monitoring)
COPIN_API_KEY=your_api_key_here

# Chain to query (default: arbitrum)
COPIN_CHAIN=arbitrum
```

### Getting a Copin API Key

**IMPORTANT:** The endpoint paths in the codebase are placeholders. You need to:

1. Visit Copin Analyzer website
2. Sign up for API access
3. Get your API key
4. Find the actual API documentation with correct endpoint paths
5. Update `backend/src/clients/copin.client.ts` with real endpoints

### Updating Endpoint Paths

In [backend/src/clients/copin.client.ts](backend/src/clients/copin.client.ts:14), update the `ENDPOINTS` object:

```typescript
const ENDPOINTS = {
  // TODO: Replace with actual Copin API endpoints
  TOP_TRADERS: '/api/v1/leaderboard',        // PLACEHOLDER - UPDATE ME
  TRADER_POSITIONS: '/api/v1/positions',     // PLACEHOLDER - UPDATE ME
};
```

Replace these paths with the actual endpoints from Copin's documentation.

## How Whale Monitoring Works

### 1. Fetch Top Traders

**Endpoint:** `GET /top-traders?timeframe=7d&limit=25&protocol=GMX`

**Pipeline:**
1. Call Copin API to get leaderboard
2. Parse and validate response with Zod schema
3. Cache results for 60 seconds
4. Return trader list with rank, address, stats

**Parameters:**
- `timeframe`: `7d`, `30d`, or `90d`
- `limit`: Number of traders (1-100)
- `protocol`: `GMX` (v1) or `GMX_V2`

### 2. Fetch Whale Risk Data

**Endpoint:** `GET /whales/risk?timeframe=7d&limit=25&protocol=GMX`

**Pipeline:**
1. Fetch top traders list (cached if available)
2. For each trader:
   - Fetch positions from Copin API (with concurrency limit)
   - Normalize position data to standard format
   - Apply risk assessment logic
   - Cache individual trader results for 30 seconds
3. Return aggregated risk data with trader summaries

**Concurrency:** Max 5 concurrent API calls (configurable via `p-limit`)

### 3. Risk Assessment

Uses the same thresholds as the original system:
- **SAFE**: `liqDistancePct >= 15%`
- **WARNING**: `7% <= liqDistancePct < 15%`
- **CRITICAL**: `liqDistancePct < 7%`

## Position Data Mapping

### From Copin to Normalized Format

The `CopinGMXSource` adapter maps Copin position fields:

| Normalized Field | Copin Field(s) | Notes |
|-----------------|----------------|-------|
| `market` | `indexToken` + "-USD" | e.g., "ETH-USD" |
| `isLong` | `side` (LONG/SHORT) | Converted to boolean |
| `sizeUsd` | `sizeUsd` or `size` | Try multiple field names |
| `collateralUsd` | `collateralUsd` or `collateral` | Try multiple field names |
| `entryPrice` | `entryPrice` or `averagePrice` | Try multiple field names |
| `markPrice` | `markPrice` or `currentPrice` | Try multiple field names |
| `liquidationPrice` | `liquidationPrice` | **Preferred if provided** |
| `liqDistancePct` | Calculated | From mark price and liq price |

### Liquidation Price Calculation

**If Copin provides `liquidationPrice`:** Use it directly (preferred).

**If not provided:** Calculate approximately using:

```
For LONG:
  liqPrice = entryPrice - (collateral - fees) / leverage

For SHORT:
  liqPrice = entryPrice + (collateral - fees) / leverage

Where:
  leverage = sizeUsd / collateralUsd
  fees = max($5, 0.5% of collateral)
```

**Assumptions when calculating:**
- Liquidation fee: ~$5 or 0.5% of collateral
- Funding fees: **NOT included** (would require historical data)
- This matches the on-chain calculation logic

## Caching Strategy

| Cache Type | TTL | Purpose |
|------------|-----|---------|
| Leaderboard | 60s | Trader rankings don't change frequently |
| Trader Positions | 30s | Positions update more often |

Caches are **in-memory** and cleared on server restart.

**For production:** Replace with Redis for multi-instance deployments.

## Rate Limiting & Retry Logic

### Built-in Retry
- Max retries: 2
- Backoff: Exponential (1s, 2s, 4s)
- Retries on: Network errors, timeouts, 5xx errors

### 429 Rate Limit Handling
- If Copin returns 429, the API respects `Retry-After` header
- Falls back to exponential backoff if header missing
- Returns 503 to client with helpful message

### Concurrency Limit
- Max 5 parallel requests to Copin (via `p-limit`)
- Prevents overwhelming Copin API when fetching many traders

## API Response Validation

Uses **Zod** for runtime validation of Copin responses:

```typescript
// Validates trader data
CopinTraderSchema

// Validates position data
CopinPositionSchema
```

If Copin's API response doesn't match schema:
- Logs validation error
- Returns empty/null data gracefully
- Doesn't crash the server

**When Copin API changes:** Update schemas in `backend/src/types/copin.types.ts`

## Limitations & Known Issues

### 1. Endpoint Placeholders
- **Current:** Placeholder paths in code
- **Action:** Update with real Copin API paths after getting documentation

### 2. Field Name Assumptions
- **Issue:** Copin might use different field names than assumed
- **Mitigation:** Code tries multiple field name variants
- **Action:** Adjust mapping in `CopinGMXSource` if needed

### 3. Liquidation Price Accuracy
- **If Copin provides it:** Accurate (uses Copin's value)
- **If calculated:** Approximate (~1-5% margin due to missing funding fees)

### 4. API Key Authentication
- **Current:** Supports `Bearer` token in `Authorization` header
- **Alternative:** May need `X-API-Key` or `api-key` header
- **Action:** Check Copin docs and adjust in `copin.client.ts`

### 5. No GMX v2 Support Yet
- **Status:** Code supports `GMX_V2` parameter
- **Reality:** Depends on whether Copin API supports GMX v2
- **Action:** Verify with Copin and adjust if needed

## Testing the Integration

### 1. Without Real API Key

The whale endpoints will fail gracefully:
```bash
curl "http://localhost:3001/whales/risk?timeframe=7d&limit=10&protocol=GMX"
# Returns error about Copin API
```

### 2. With API Key

```bash
# 1. Add key to backend/.env
COPIN_API_KEY=your_real_key

# 2. Update endpoint paths in copin.client.ts

# 3. Restart backend
cd backend && npm run dev

# 4. Test leaderboard
curl "http://localhost:3001/top-traders?timeframe=7d&limit=10&protocol=GMX"

# 5. Test whale risk
curl "http://localhost:3001/whales/risk?timeframe=7d&limit=10&protocol=GMX"
```

### 3. Frontend Testing

1. Start backend and frontend
2. Navigate to whale monitoring section
3. Select timeframe/limit/protocol
4. Click "Load Top Traders"
5. Click trader rows to expand positions

## Upgrading to Production

### Short Term
1. **Get real Copin API key** and update `.env`
2. **Find correct endpoint paths** from Copin docs
3. **Update `copin.client.ts`** with real paths
4. **Test field mappings** - adjust if Copin uses different names

### Medium Term
5. **Add Redis caching** for multi-instance deployments
6. **Add monitoring** for Copin API failures
7. **Rate limit frontend** to prevent abuse
8. **Add request logging** for debugging

### Long Term
9. **WebSocket integration** for real-time updates
10. **Bulk position fetching** if Copin supports batch endpoints
11. **Historical tracking** of whale positions over time
12. **Alert system** for critical liquidation risks

## Fallback Strategy

If Copin API is down or rate-limited:

**Option 1 (Current):**
- Return 503 error with message
- User sees error in UI

**Option 2 (Future):**
- Fall back to on-chain reads for specific addresses
- Hybrid approach: Copin for discovery, on-chain for verification

## Contact & Support

**Copin API Issues:**
- Contact Copin Analyzer support
- Check their documentation/status page

**Integration Issues:**
- Check `backend/src/clients/copin.client.ts` logs
- Verify Zod validation errors
- Ensure endpoint paths are correct

## Summary

- Whale monitoring uses Copin API (not on-chain reads)
- Clean adapter pattern separates data sources
- Caching prevents excessive API calls
- Retry logic handles transient failures
- Zod validation ensures data integrity
- **Action required:** Get real API key and endpoint paths

---

**Status:** ⚠️ Requires Copin API credentials and endpoint configuration
