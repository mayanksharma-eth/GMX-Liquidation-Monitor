# GMX Risk & Liquidation Monitor

A comprehensive system for monitoring GMX position liquidation risk on Arbitrum, featuring:
- Individual wallet position monitoring (on-chain)
- Top trader whale monitoring (via Copin Analyzer API)
- Real-time liquidation risk assessment
- Dashboard quality-of-life: watchlists, filters, auto-refresh, and whale-to-wallet jumps

## Features


### Core Features
- Fetches open GMX positions for any wallet address  (on-chain)
- Monitors top GMX traders (whales) via Copin Analyzer
- Computes liquidation distance metrics per position
- Risk classification (SAFE / WARNING / CRITICAL)
- REST API backend with Fastify
- Clean Next.js dashboard UI
- Dashboard controls: watchlist persistence, risk/side/market filters, auto-refresh cadence, whale rows can be loaded into wallet checker
- In-memory caching to avoid RPC/API spam

### Data Sources
- **On-Chain**: Direct GMX v1 Vault contract reads via ethers v6
- **Copin API**: Leaderboard + position filter with optional HMAC auth, plus statistics fallback when leaderboard is empty

## Architecture

```
GMX_Liquidation_Monitor/
├── backend/               # Fastify + ethers v6 + Copin client
│   ├── src/
│   │   ├── adapters/      # Position data source adapters
│   │   ├── clients/       # Copin API client
│   │   ├── controllers/   # API endpoint handlers
│   │   ├── services/      # Risk assessment logic
│   │   ├── utils/         # Contracts, cache, validation
│   │   ├── types/         # TypeScript interfaces + Zod schemas
│   │   └── server.ts      # Entry point
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/              # Next.js 14 App Router
│   ├── app/
│   │   ├── page.tsx       # Main dashboard
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── package.json
│   └── tsconfig.json
│
├── .env.example
├── readme.md
├── COPIN_SETUP.md         # Copin integration guide
└── IMPLEMENTATION_NOTES.md
```

## Tech Stack

- **Backend**: Node.js, Fastify, ethers v6, Zod, p-limit, TypeScript
- **Frontend**: Next.js 14 (App Router), React, TypeScript
- **Chain**: Arbitrum (GMX v1)
- **APIs**: Copin Analyzer (whale monitoring)
- **No database** - in-memory cache only

## Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- Arbitrum RPC URL (public or private like Alchemy/Infura)
- Copin API key (and optional API secret for HMAC; required for whale monitoring)

## Quick Start

### 1. Clone and Configure

```bash
# Navigate to project directory
cd GMX_Liquidation_Monitor

# Copy environment variables
cp .env.example .env

# Edit .env and configure:
# - ARBITRUM_RPC_URL (required)
# - COPIN_API_KEY (required for whale monitoring)
# - COPIN_API_SECRET (optional HMAC signing, recommended if Copin requires it)
# - COPIN_API_BASE_URL (optional override, defaults to https://api.copin.io)
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies (includes zod, p-limit) - or run `npm run install:all` from repo root
npm install

# Start development server
npm run dev   # or from repo root: npm run dev:backend
```

Backend will run at `http://localhost:3001`

### 3. Frontend Setup

Open a new terminal:

```bash
cd frontend

# Create frontend environment file
cp .env.local.example .env.local

# Install dependencies
npm install

# Start development server
npm run dev   # or from repo root: npm run dev:frontend
```

Frontend will run at `http://localhost:3000`

### 4. Test the Application

1. Open browser to `http://localhost:3000`
2. **Wallet Checker**: Enter a wallet address to check individual positions
3. **Whale Monitor**: Select timeframe/limit and click "Load Top Traders"

## Dashboard Highlights

- Saved watchlist stored locally for quick wallet lookups (including whale rows -> "Load wallet")
- Auto-refresh toggle with 15/30/60/120s cadence plus manual refresh button
- Filters for risk tier, side, and market search; top-risk heat cards and summary stats up top
- API status + last sync indicator so you know when backend calls are healthy
- Expandable whale table shows per-trader positions with risk badges and liquidation buffers

## API Endpoints

### Core Endpoints (On-Chain)

#### `GET /health`
Health check endpoint.

**Response:**
```json
{ "ok": true }
```

#### `GET /positions?account=0x...`
Fetch positions for a wallet address (on-chain reads).

**Response:**
```json
[
  {
    "market": "ETH-USD",
    "isLong": true,
    "sizeUsd": 10000,
    "collateralUsd": 2000,
    "leverage": 5,
    "entryPrice": 3500,
    "markPrice": 3400,
    "liquidationPrice": 3200,
    "liqDistancePct": 5.88
  }
]
```

#### `GET /risk?account=0x...`
Fetch positions with risk assessment (on-chain reads).

**Response:**
```json
[
  {
    "market": "ETH-USD",
    "isLong": true,
    "sizeUsd": 10000,
    "collateralUsd": 2000,
    "leverage": 5,
    "entryPrice": 3500,
    "markPrice": 3400,
    "liquidationPrice": 3200,
    "liqDistancePct": 5.88,
    "riskLevel": "WARNING",
    "riskExplanation": "WARNING: liquidates if ETH drops ~5.88%"
  }
]
```

#### `GET /risk/overview?account=0x...`
Fetch risk positions plus a precomputed summary (best for dashboards).

**Response:**
```json
{
  "account": "0x...",
  "updatedAt": "2025-12-19T10:30:00Z",
  "positions": [
    {
      "market": "ETH-USD",
      "isLong": true,
      "sizeUsd": 10000,
      "collateralUsd": 2000,
      "leverage": 5,
      "entryPrice": 3500,
      "markPrice": 3400,
      "liquidationPrice": 3200,
      "liqDistancePct": 5.88,
      "riskLevel": "WARNING",
      "riskExplanation": "WARNING: liquidates if ETH drops ~5.88%"
    }
  ],
  "summary": {
    "positions": 1,
    "atRisk": 1,
    "critical": 0,
    "totalSizeUsd": 10000,
    "totalCollateralUsd": 2000,
    "averageLeverage": 5,
    "closestLiqDistancePct": 5.88,
    "worstRisk": "WARNING"
  }
}
```

#### `GET /status`
Diagnostic status for RPC + Copin integration (cached ~20s).

**Response:**
```json
{
  "ok": true,
  "timestamp": "2025-12-19T10:30:00Z",
  "rpc": { "ok": true, "chainId": 42161, "blockNumber": 21123456 },
  "copin": { "ok": true, "enabled": true }
}
```

### Whale Monitoring Endpoints (Copin API)

#### `GET /top-traders?timeframe=7d&limit=25&protocol=GMX`
Fetch top GMX traders leaderboard.

**Query Parameters:**
- `timeframe`: `7d`, `30d`, or `90d`
- `limit`: Number of traders (1-100)
- `protocol`: `GMX` (v1) or `GMX_V2`

**Response:**
```json
{
  "timeframe": "7d",
  "protocol": "GMX",
  "traders": [
    {
      "address": "0x...",
      "rank": 1,
      "volumeUsd": 12345678,
      "pnlUsd": 12345,
      "winRate": 0.65
    }
  ]
}
```

#### `GET /whales/risk?timeframe=7d&limit=25&protocol=GMX`
Fetch top traders with position risk assessment.

**Query Parameters:**
- Same as `/top-traders`

**Response:**
```json
{
  "timeframe": "7d",
  "protocol": "GMX",
  "updatedAt": "2025-12-19T10:30:00Z",
  "traders": [
    {
      "address": "0x...",
      "rank": 1,
      "summary": {
        "positions": 3,
        "worstRisk": "CRITICAL",
        "closestLiqDistancePct": 3.2
      },
      "positions": [
        {
          "market": "ETH-USD",
          "isLong": true,
          "sizeUsd": 10000,
          "collateralUsd": 2000,
          "entryPrice": 3500,
          "markPrice": 3400,
          "liquidationPrice": 3291,
          "liqDistancePct": 3.24,
          "riskLabel": "CRITICAL",
          "explanation": "CRITICAL: liquidates if ETH drops ~3.2%"
        }
      ]
    }
  ]
}
```

## Implementation Details

### Position Data Sources

The system uses a clean **adapter pattern** for position data:

```typescript
interface PositionSource {
  getPositions(account: string): Promise<NormalizedPosition[]>
}
```

**Implementations:**
1. **OnChainGMXV1Source** - Direct contract reads (used by `/positions`, `/risk`)
2. **CopinGMXSource** - Copin API reads (used by `/whales/risk`)

Both return the same normalized format, ensuring consistent risk assessment.

### On-Chain Position Fetching

**Contracts used:**
- Vault: `0x489ee077994B6658eAfA855C308275EAd8097C4A`
- Reader: `0x22199a49A999c351eF7927602CFB187ec3cae489`

**Markets checked:** ETH-USD, BTC-USD (both long and short positions)

**Process:**
1. Calls `Vault.getPosition()` for each market/side combination
2. Fetches current mark prices via `getMinPrice()`/`getMaxPrice()`
3. Calculates liquidation metrics

### Copin Integration

**For whale monitoring only.** See [COPIN_SETUP.md](COPIN_SETUP.md) for detailed guide.

**Key Features:**
- Pre-wired to Copin leaderboard (`/leaderboards/page`) with fallback to statistics filter (`/public/:PROTOCOL/position/statistic/filter`) when snapshots are empty
- Trader positions fetched via `/:PROTOCOL/position/filter`
- Optional HMAC auth when `COPIN_API_KEY` + `COPIN_API_SECRET` are set (falls back to bearer/API-key headers if only key provided)
- Zod schema validation for API responses
- Automatic retry with exponential backoff + 429-aware rate limiting
- Concurrency limiting (max 5 parallel calls) and caching: leaderboard (60s), positions (30s)

**Adjust if needed:** If Copin exposes different paths on your plan, update `ENDPOINTS` in [backend/src/clients/copin.client.ts](backend/src/clients/copin.client.ts).

### Liquidation Calculation

**Formula:**
```
For LONG:
  liquidationPrice = entryPrice - (remainingCollateral / leverage)

For SHORT:
  liquidationPrice = entryPrice + (remainingCollateral / leverage)

Where:
  leverage = sizeUsd / collateralUsd
  remainingCollateral = collateralUsd - liquidationFee
  liquidationFee = max($5, 0.5% of collateral)
```

**Assumptions:**
- Liquidation fee: ~$5 or 0.5% of collateral
- Funding fees: **NOT included** (would require historical tracking)
- Margin fees: Assumed in current collateral

**For Copin positions:**
- Prefers `liquidationPrice` from Copin if provided
- Falls back to calculation if missing

### Risk Classification

- **SAFE**: `liqDistancePct >= 15%`
- **WARNING**: `7% <= liqDistancePct < 15%`
- **CRITICAL**: `liqDistancePct < 7%`

### Caching

| Endpoint | Cache TTL | Purpose |
|----------|-----------|---------|
| `/positions` | 15s | Individual wallet on-chain reads |
| `/risk` | 15s | Individual wallet risk assessment |
| `/top-traders` (leaderboard) | 60s | Top trader rankings |
| Trader positions (internal) | 30s | Per-trader position data |

## Environment Variables

### Backend (`backend/.env`)

```bash
# Required
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc

# Optional
PORT=3001

# Whale Monitoring (optional but required for whale endpoints)
COPIN_API_BASE_URL=https://api.copin.io
COPIN_API_KEY=your_api_key_here
COPIN_API_SECRET=your_api_secret_here   # optional; enables HMAC signing if your plan requires it
COPIN_CHAIN=arbitrum
```

The backend also reads `API_KEY` / `API_SECRET` as fallbacks for Copin credentials.

### Frontend (`frontend/.env.local`)

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Whale Monitoring Setup

**Required Steps:**

1. **Get Copin API credentials**
   - Sign up at Copin Analyzer
   - Grab API key (and API secret if your plan requires HMAC)
   - Add to `backend/.env`

2. **Confirm endpoints (optional)**
   - Default paths use Copin `leaderboards/page`, `public/:PROTOCOL/position/statistic/filter`, and `/:PROTOCOL/position/filter`
   - If your account uses different paths, update `ENDPOINTS` in `backend/src/clients/copin.client.ts`

3. **Test integration**
   ```bash
   curl "http://localhost:3001/top-traders?timeframe=7d&limit=10&protocol=GMX"
   ```

See [COPIN_SETUP.md](COPIN_SETUP.md) for complete guide.

## Production Build

### Backend
```bash
cd backend
npm run build
npm start
```

### Frontend
```bash
cd frontend
npm run build
npm start
```

## Troubleshooting

**"Failed to fetch positions":**
- Check `ARBITRUM_RPC_URL` is valid and accessible
- Verify wallet address format (must start with 0x)
- Public RPCs may have rate limits - use private RPC

**"No positions found":**
- Wallet may not have open GMX v1 positions on Arbitrum
- Only checks ETH-USD and BTC-USD markets
- Only checks USDC collateral positions

**"Copin API rate limit exceeded":**
- Wait a few moments before retrying
- Check if `COPIN_API_KEY` is valid
- Verify you haven't exceeded Copin's rate limits

**"Whale monitoring not working":**
- Ensure `COPIN_API_KEY` (and `COPIN_API_SECRET` if needed) are set in `backend/.env`
- Verify `COPIN_API_BASE_URL` and `ENDPOINTS` in `copin.client.ts` match your Copin plan
- Check Copin API status and backend logs for rate limits/auth errors

## Upgrading from Original MVP

If you have the original version (before whale monitoring):

1. **Pull new code**
2. **Install new dependencies:**
   ```bash
   cd backend && npm install  # Adds zod, p-limit
   ```
3. **Update `.env`** with Copin variables (optional)
4. **Original endpoints unchanged** - wallet checker still works the same

## Limitations

### MVP Constraints
- Only checks USDC-collateralized positions
- Funding fees not included in liquidation calculation
- No historical position tracking
- No alerts/notifications
- No PnL calculations
- In-memory caching only

### Copin Integration
- Whale endpoints require Copin API credentials; HMAC signing is supported if your plan requires it
- Liquidation price accuracy depends on Copin providing the field; otherwise uses approximated calc
- API rate limits apply; current concurrency limit is 5 with 30-60s caches
- No fallback to on-chain for whale monitoring yet; GMX v2 support depends on Copin feed

## Future Enhancements

**Short Term:**
- Redis for distributed caching
- Webhook alerts for critical positions
- More GMX markets (LINK, UNI, etc.)
- Multiple collateral types

**Medium Term:**
- GMX v2 full support
- Historical whale tracking
- WebSocket real-time updates
- Position change notifications

**Long Term:**
- Multi-chain support (Avalanche)
- Automated liquidation protection
- Portfolio risk scoring
- Machine learning risk predictions

## Documentation

- [README.md](readme.md) - This file
- [COPIN_SETUP.md](COPIN_SETUP.md) - Copin Analyzer integration guide
- [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md) - Technical deep dive
- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) - Quick reference

## Testing

### With Real Positions

Need a wallet with active GMX v1 positions:
1. Visit [GMX v1](https://app.gmx.io) (legacy)
2. Create a small test position
3. Use that wallet address in the monitor

### API Examples

```bash
# Health check
curl http://localhost:3001/health

# Check wallet positions
curl "http://localhost:3001/risk?account=0xYOUR_ADDRESS"

# Get top traders (requires Copin setup)
curl "http://localhost:3001/top-traders?timeframe=7d&limit=10&protocol=GMX"

# Get whale risk (requires Copin setup)
curl "http://localhost:3001/whales/risk?timeframe=7d&limit=10&protocol=GMX"
```

## License

MIT

---

**Status:**
- ✅ Core wallet monitoring: Ready
- ⚠️ Whale monitoring: Requires Copin API setup (see [COPIN_SETUP.md](COPIN_SETUP.md))
