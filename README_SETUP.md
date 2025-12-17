# Simple Trader - Complete Setup Guide

## Overview

Simple Trader is an AI-powered autonomous trading application with the following features:

- **AI Council Voting System**: Multiple AI agents vote on trading decisions using OpenAI GPT models
- **Crypto Trading**: Kraken API integration for cryptocurrency trading
- **Stock Trading**: Alpaca API integration for stock trading (paper and live)
- **Bank Integration**: Plaid API for linking bank accounts and fund transfers
- **24/7 Operation**: Backend bot that runs continuously and makes autonomous decisions
- **Mobile APK**: Android app built with Capacitor for on-the-go trading

## Architecture

### Frontend
- **Framework**: React 18 + TypeScript + Vite
- **UI**: Shadcn/ui components with Tailwind CSS
- **State Management**: React Query (@tanstack/react-query)
- **Authentication**: Supabase Auth
- **Mobile**: Capacitor for Android APK generation

### Backend
- **Framework**: Python FastAPI
- **APIs**: Kraken, Alpaca, Plaid, OpenAI
- **Database**: SQLite (local) + Supabase (cloud)
- **Deployment**: Railway, Render, or self-hosted

## Prerequisites

1. **Node.js** (v18 or higher) - [Install with nvm](https://github.com/nvm-sh/nvm)
2. **Python** (3.10 or higher)
3. **Android Studio** (for APK builds) - [Download](https://developer.android.com/studio)
4. **API Keys** (see API Setup section below)

## Quick Start

### 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone <your-repo-url>
cd my-simple-trader

# Install frontend dependencies
npm install

# Install backend dependencies
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your actual API keys (see API Setup section below).

### 3. Run Development Server

**Frontend:**
```bash
npm run dev
```
This starts the Vite dev server at http://localhost:5173

**Backend:**
```bash
python main.py
```
This starts the FastAPI backend at http://localhost:8000

You can view the API documentation at http://localhost:8000/docs

## API Setup

### Required APIs

#### 1. Supabase (Authentication & Database)

1. Create a free account at [supabase.com](https://supabase.com)
2. Create a new project
3. Get your credentials from Project Settings > API:
   - `VITE_SUPABASE_URL`: Your project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: Anon/public key
   - `SUPABASE_SERVICE_ROLE_KEY`: Service role key (keep secret!)
4. Run the migrations in the `supabase/migrations/` folder

#### 2. Kraken (Crypto Trading)

1. Sign up at [kraken.com](https://www.kraken.com)
2. Generate API keys:
   - Go to Settings > API
   - Create new key with permissions: Query Funds, Query Orders, Create & Modify Orders
   - **Important**: For live trading, enable withdrawals only if needed
3. Add to `.env`:
   ```
   KRAKEN_KEY=your_api_key
   KRAKEN_SECRET=your_api_secret
   KRAKEN_ENABLE_TRADING=false  # Set to true for live trading
   ```

#### 3. Alpaca (Stock Trading)

1. Sign up at [alpaca.markets](https://alpaca.markets)
2. Get paper trading credentials from dashboard
3. Add to `.env`:
   ```
   ALPACA_API_KEY=your_api_key
   ALPACA_SECRET=your_secret_key
   ALPACA_PAPER=true  # Use paper trading for testing
   ```

For live trading:
- Complete account verification on Alpaca
- Fund your account
- Set `ALPACA_PAPER=false` and `TRADING_MODE=live`

#### 4. OpenAI (AI Council)

1. Sign up at [platform.openai.com](https://platform.openai.com)
2. Create an API key in API Keys section
3. Add to `.env`:
   ```
   OPENAI_API_KEY=sk-...your_key
   OPENAI_ENABLED=true
   OPENAI_MODEL=gpt-4o-mini  # Or gpt-4, gpt-4o
   SWARM_AI_COUNT=5  # Number of AI agents (1-10)
   ```

**Model Recommendations:**
- `gpt-4o-mini`: Fast and cost-effective (recommended for testing)
- `gpt-4o`: Balanced performance and cost
- `gpt-4`: Most capable but slower and more expensive

#### 5. Plaid (Bank Integration) - Optional

1. Sign up at [plaid.com/docs](https://plaid.com/docs)
2. Use sandbox credentials for testing
3. Add to `.env`:
   ```
   PLAID_CLIENT_ID=your_client_id
   PLAID_SECRET=your_sandbox_secret
   PLAID_ENV=sandbox  # Use 'production' for real banking
   ```

**Note**: Plaid Transfer (for withdrawals) requires approval from Plaid. For basic account linking, the free tier works.

### Optional Configuration

```bash
# Trading Configuration
TRADING_MODE=paper          # paper, dry_run, or live
MAX_NOTIONAL_PER_ORDER_USD=1.00  # Max $ per trade
MAX_ORDERS_PER_DAY=20       # Daily order limit

# Bot Timing
BOT_TICK_INTERVAL_SECONDS=30     # How often bot checks market
BOT_POLL_INTERVAL_SECONDS=10     # How often to poll for active users
```

## Using the Application

### 1. Sign Up / Login

1. Start the frontend dev server
2. Navigate to http://localhost:5173
3. Create an account with email and password
4. Verify your email (check spam folder)

### 2. Configure API Keys

**Option A: Via Settings Page**
1. Log in and go to Settings
2. Enter your API keys
3. Keys are stored in Supabase `user_exchange_keys` table

**Option B: Via Backend Endpoint**
```bash
curl -X POST http://localhost:8000/config/set_keys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "alpaca_api_key": "...",
    "alpaca_secret": "...",
    "kraken_key": "...",
    "kraken_secret": "...",
    "openai_api_key": "..."
  }'
```

### 3. Link Bank Account (Optional)

1. Go to Banking (Plaid) page
2. Click "Link Bank Account"
3. Follow Plaid Link flow
4. Select your bank and accounts
5. Verify connection in the app

### 4. Enable Trading Bot

1. Go to Dashboard
2. Click "SWARM ON" to enable autonomous trading
3. Bot will start making decisions based on AI council votes
4. View AI Council page to see voting details

### 5. Monitor Trading

- **Dashboard**: View balance, P/L, portfolio value, win rate
- **AI Council**: See detailed voting from each AI agent
- **Recent Trades**: View trade history on dashboard

### 6. Withdraw Funds

For Kraken crypto → bank:
1. Sell crypto positions (or use "Sell to Cash" button)
2. Go to Withdraw page
3. Set up withdrawal key in Kraken first
4. Enter amount and submit

For Plaid transfer (requires Plaid Transfer approval):
1. Ensure bank is linked
2. Go to Withdraw page
3. Select Plaid transfer
4. Enter amount

## Building APK for Android

### Prerequisites
- Android Studio installed
- Java Development Kit (JDK) 17 or higher

### Build Steps

1. **Build the web app:**
   ```bash
   npm run build
   ```

2. **Sync Capacitor:**
   ```bash
   npx cap sync android
   ```

3. **Open in Android Studio:**
   ```bash
   npx cap open android
   ```

4. **Build APK:**
   - In Android Studio: Build > Build Bundle(s) / APK(s) > Build APK(s)
   - Or via command line:
     ```bash
     cd android
     ./gradlew assembleDebug
     ```

5. **Find APK:**
   - Location: `android/app/build/outputs/apk/debug/app-debug.apk`
   - For release: Use `assembleRelease` instead

6. **Install on Device:**
   ```bash
   adb install android/app/build/outputs/apk/debug/app-debug.apk
   ```

### Troubleshooting APK Build

**Issue**: Build fails with "SDK not found"
- **Solution**: Open Android Studio, go to SDK Manager, install Android SDK

**Issue**: "Command not found: adb"
- **Solution**: Add Android SDK platform-tools to PATH

**Issue**: App crashes on launch
- **Solution**: Check Capacitor configuration in `capacitor.config.json`

## Testing

### Test Backend Locally

```bash
# Check health
curl http://localhost:8000/health

# Check config status
curl http://localhost:8000/config/status

# Test simulation (requires auth)
curl -X POST http://localhost:8000/simulate/run \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "seconds": 20,
    "tick_seconds": 5,
    "use_openai": true,
    "ai_count": 5
  }'
```

### Test Trading (Paper Mode)

1. Set `TRADING_MODE=paper` and `ALPACA_PAPER=true`
2. Enable swarm on dashboard
3. Monitor trades in dashboard
4. Verify no real money is used

### Test AI Council

1. Set `OPENAI_ENABLED=true` in `.env`
2. Go to AI Council page
3. Enable swarm
4. Wait for next tick (default 30 seconds)
5. Verify AI agents show voting results

## Security Best Practices

1. **Never commit `.env` file** - It's in `.gitignore` by default
2. **Use paper trading first** - Test with fake money
3. **Enable 2FA** - On all exchange accounts
4. **Use strong API permissions** - Only enable what you need
5. **Set order limits** - `MAX_NOTIONAL_PER_ORDER_USD` and `MAX_ORDERS_PER_DAY`
6. **Monitor regularly** - Check trades and balances daily
7. **Use HTTPS** - Deploy backend with SSL certificate
8. **Rotate API keys** - Periodically regenerate keys
9. **Backup data** - Export important data regularly

## Deployment

### Frontend (Vercel/Netlify)

1. Connect GitHub repo to Vercel/Netlify
2. Set environment variables in dashboard
3. Deploy

### Backend (Railway/Render)

**Railway:**
```bash
# Install Railway CLI
npm install -g railway

# Login and deploy
railway login
railway up
```

**Render:**
1. Create new Web Service
2. Connect GitHub repo
3. Set build command: `pip install -r requirements.txt`
4. Set start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

### Environment Variables for Production

Make sure to set these in your deployment platform:
- All API keys from `.env`
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- `TRADING_MODE=paper` (until ready for live)

## Troubleshooting

### Common Issues

**Issue**: "Supabase URL not configured"
- **Solution**: Check `.env` has `VITE_SUPABASE_URL` and restart dev server

**Issue**: "Unauthorized" errors
- **Solution**: Check JWT token is valid, re-login if needed

**Issue**: "OpenAI API error"
- **Solution**: Check API key, ensure billing is enabled on OpenAI account

**Issue**: Bot not trading
- **Solution**: Check swarm is ON, verify API keys, check logs for errors

**Issue**: Plaid link fails
- **Solution**: Use sandbox mode for testing, check Plaid credentials

### Logs

**Frontend**: Check browser console (F12)
**Backend**: Python prints to console, check terminal output

### Support

For issues:
1. Check this documentation
2. Review error messages in console/logs
3. Test API keys individually
4. Verify environment variables are loaded

## Advanced Features

### Custom AI Strategies

Edit the `personas` array in `main.py` `_openai_council_vote()` function to add custom AI trading personalities.

### Multiple Users

The backend supports multiple users trading simultaneously. Each user's bot runs independently with their own API keys.

### Open Source Swarm Bot Integration

The codebase is designed to be extensible. To integrate open-source swarm bot code:

1. Review compatibility with FastAPI architecture
2. Ensure proper error handling and logging
3. Test thoroughly in paper mode
4. Add as optional module that users can enable

## License

This project is for personal use. Ensure compliance with all API terms of service.

## Disclaimer

**Trading involves substantial risk of loss. This software is provided "as is" without warranty. Use at your own risk. Never invest more than you can afford to lose. Always test with paper trading first.**

---

Built with ❤️ for autonomous AI trading
