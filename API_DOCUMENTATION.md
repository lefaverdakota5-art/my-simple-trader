# API Documentation

## Base URL
- Development: `http://localhost:8000`
- Production: `https://your-domain.com/api`

## API Documentation
- Interactive Swagger UI: `/docs`
- ReDoc: `/redoc`
- OpenAPI JSON: `/openapi.json`

## Health & Status Endpoints

### GET /health
Health check endpoint for monitoring.

**Response:**
```json
{
  "ok": true,
  "configured": true,
  "trading_mode": "paper",
  "alpaca_paper": true,
  "active_users": []
}
```

### GET /config/status
Check configuration status of all services.

**Response:**
```json
{
  "supabase_configured": true,
  "alpaca_configured": true,
  "kraken_configured": true,
  "plaid_configured": true,
  "missing": [],
  "note": "Secrets are never returned..."
}
```

## AI Trading Endpoints

### GET /ai/decision?symbol=AAPL
Get AI trading decision for a symbol.

**Parameters:**
- `symbol` (query, optional): Stock/crypto symbol (default: "AAPL")

**Response:**
```json
{
  "symbol": "AAPL",
  "decision": {
    "price_momentum": 0.2,
    "volume_trend": 0.15,
    "volatility": 0.8,
    "technical": 0.4,
    "sentiment": 0.0,
    "final_score": 0.35,
    "final_decision": "buy",
    "confidence": 0.35
  },
  "sentiment": 0.0
}
```

### POST /ai/decision
Get AI trading decision with optional news headlines.

**Request Body:**
```json
{
  "symbol": "BTC",
  "headlines": [
    "Bitcoin surges to new high",
    "Crypto market shows strong momentum"
  ]
}
```

**Response:**
```json
{
  "symbol": "BTC",
  "decision": {...},
  "sentiment": 0.65
}
```

## High-Frequency Trading

### POST /hft/execute
Execute a high-frequency trade with safety checks.

**Request Body:**
```json
{
  "symbol": "BTCUSD",
  "amount": 100.0,
  "side": "buy"
}
```

**Response (Success):**
```json
{
  "status": "executed",
  "symbol": "BTCUSD",
  "amount": 100.0,
  "side": "buy",
  "execution_time": "2026-01-15T08:00:00.000Z",
  "position_after": 100.0,
  "orders_in_last_second": 1
}
```

**Response (Rate Limit):**
```json
{
  "status": "rejected",
  "reason": "Rate limit exceeded",
  "symbol": "BTCUSD",
  "amount": 100.0,
  "side": "buy",
  "rate_limit": 10
}
```

## Arbitrage

### GET /arbitrage/check
Check for arbitrage opportunities across exchanges.

**Response (Opportunity Found):**
```json
{
  "status": "executed",
  "buy_exchange": "coinbase",
  "buy_price": 99.5,
  "sell_exchange": "binance",
  "sell_price": 101.0,
  "amount": 1.0,
  "expected_profit": 1.3,
  "message": "Arbitrage executed (simulated)"
}
```

**Response (No Opportunity):**
```json
{
  "status": "no_opportunity",
  "message": "No profitable arbitrage found"
}
```

## Profit Allocation

### POST /profit/allocate
Calculate optimal capital allocation based on performance.

**Request Body:**
```json
{
  "performance": {
    "BTC": {
      "returns": [0.05, 0.03, -0.01, 0.08, 0.02],
      "win_rate": 0.75,
      "total_return": 0.17,
      "max_drawdown": 0.01
    },
    "ETH": {
      "returns": [0.02, 0.04, 0.06, -0.02, 0.01],
      "win_rate": 0.80,
      "total_return": 0.11,
      "max_drawdown": 0.02
    }
  }
}
```

**Response:**
```json
{
  "allocation": {
    "BTC": 0.55,
    "ETH": 0.45
  },
  "scores": {
    "BTC": 0.234,
    "ETH": 0.189
  },
  "timestamp": "2026-01-15T08:00:00.000Z",
  "total_assets": 2,
  "recommendations": [
    "BTC: Optimal allocation (55.0%)",
    "ETH: Optimal allocation (45.0%)"
  ]
}
```

## Banking & Deposits

### POST /deposit/from_chime
Deposit funds from Chime account to trading balance.

**Headers:**
- `Authorization: Bearer <jwt_token>`

**Request Body:**
```json
{
  "amount": 50.00
}
```

**Response:**
```json
{
  "success": true,
  "amount": 50.00,
  "new_balance": 150.00,
  "message": "Successfully deposited $50.00 from Chime to trading account"
}
```

## Trading Configuration

### POST /config/set_keys
Store API keys on the backend (requires authentication).

**Headers:**
- `Authorization: Bearer <jwt_token>`

**Request Body:**
```json
{
  "alpaca_api_key": "your_key",
  "alpaca_secret": "your_secret",
  "kraken_key": "your_key",
  "kraken_secret": "your_secret",
  "openai_api_key": "your_key"
}
```

**Response:**
```json
{
  "success": true,
  "stored": ["ALPACA_API_KEY", "ALPACA_SECRET", "KRAKEN_KEY", ...],
  "note": "Keys stored on backend. Restart backend to ensure bots pick them up."
}
```

### GET /me/status
Get current user status (requires authentication).

**Headers:**
- `Authorization: Bearer <jwt_token>`

**Response:**
```json
{
  "user_id": "abc123",
  "bot_active": true,
  "trading_mode": "paper",
  "alpaca_paper": true,
  "kraken_trading_enabled": false,
  "kraken_withdrawals_enabled": false
}
```

## Plaid Banking

### POST /plaid/create_link_token
Create Plaid Link token for bank connection.

**Headers:**
- `Authorization: Bearer <jwt_token>`

**Response:**
```json
{
  "link_token": "link-sandbox-abc123..."
}
```

### GET /plaid/accounts
Get connected bank account balances.

**Headers:**
- `Authorization: Bearer <jwt_token>`

**Response:**
```json
{
  "connected": true,
  "institution_name": "Chime",
  "accounts": [
    {
      "account_id": "acc123",
      "name": "Chime Checking",
      "mask": "1234",
      "type": "depository",
      "subtype": "checking",
      "balances": {
        "available": 1250.00,
        "current": 1250.00
      }
    }
  ]
}
```

## Trading Actions

### POST /actions/sell_to_cash
Sell all positions to cash (requires authentication).

**Headers:**
- `Authorization: Bearer <jwt_token>`

**Response:**
```json
{
  "success": true,
  "mode": "paper",
  "alpaca": [
    {
      "symbol": "AAPL",
      "qty": 10,
      "status": "submitted"
    }
  ],
  "kraken": {
    "status": "note",
    "message": "Set KRAKEN_ENABLE_TRADING=true to allow market sells (live)."
  }
}
```

## Simulation

### POST /simulate/run
Run a short simulation without placing real orders.

**Headers:**
- `Authorization: Bearer <jwt_token>`

**Request Body:**
```json
{
  "seconds": 30,
  "tick_seconds": 5,
  "pairs": ["XBTUSD", "ETHUSD"],
  "symbols": ["AAPL", "SPY"]
}
```

**Response:**
```json
{
  "success": true,
  "user_id": "abc123",
  "seconds": 30,
  "tick_seconds": 5,
  "events": [
    {
      "ts": "2026-01-15T08:00:00.000Z",
      "kraken": {
        "pairs": ["XBTUSD", "ETHUSD"],
        "last": 42500.0,
        "open": 42000.0,
        "pct_change": 1.19
      },
      "council_votes": "4/5",
      "council_reasons": [...],
      "would_trade": true,
      "alpaca_latest": {...},
      "note": "Simulation only. No orders submitted."
    }
  ]
}
```

## Error Responses

All endpoints may return error responses in this format:

```json
{
  "error": "Error type",
  "message": "Detailed error message",
  "detail": "Additional context (in debug mode)"
}
```

### Common Status Codes
- `200 OK` - Success
- `400 Bad Request` - Invalid input
- `401 Unauthorized` - Missing or invalid auth token
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error
- `501 Not Implemented` - Feature not enabled

## Authentication

Most endpoints require a valid Supabase JWT token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

Get the token from Supabase authentication:
```javascript
const { data: { session } } = await supabase.auth.getSession()
const token = session.access_token
```

## Rate Limiting

- HFT endpoint: 10 orders per second per user
- API endpoints: 100 requests per minute (configurable)
- Exceeded limits return 429 status code

## Best Practices

1. **Always check /health** before making trading decisions
2. **Use /simulate/run** to test strategies without risking capital
3. **Start with paper trading** (TRADING_MODE=paper)
4. **Monitor /me/status** to verify bot state
5. **Use proper error handling** for all API calls
6. **Keep API keys secure** - never expose in client code
7. **Enable MFA** on all exchange accounts
8. **Set low limits** when first deploying to production

## WebSocket Support (Future)

Coming soon: Real-time updates via WebSocket connections for:
- Live trading signals
- Portfolio updates
- AI council decisions
- Market data streams

## Support

For issues or questions:
- Check interactive docs at `/docs`
- Review logs in `/var/log/ai-trader/app.log`
- Monitor health endpoint for system status
