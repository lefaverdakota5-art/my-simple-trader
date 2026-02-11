# AI Simple Trader - Complete Setup Guide

This guide will walk you through setting up the complete AI Simple Trader application with Supabase, Railway, and all necessary API integrations.

## Table of Contents
1. [Supabase Configuration](#1-supabase-configuration)
2. [Railway Configuration](#2-railway-configuration)
3. [API Keys Setup](#3-api-keys-setup)
4. [Verification Steps](#4-verification-steps)

---

## 1. Supabase Configuration

### 1.1 Getting Your Supabase Keys

Your Supabase project is already set up with ID: `pchaijknfmrddivqjesm`

1. **Go to Supabase Dashboard**: https://supabase.com/dashboard/project/pchaijknfmrddivqjesm
2. **Navigate to**: Settings → API
3. **Copy the following keys**:
   - **Project URL**: `https://pchaijknfmrddivqjesm.supabase.co`
   - **anon/public key**: This is your `VITE_SUPABASE_PUBLISHABLE_KEY`
   - **service_role key**: This is your `SUPABASE_SERVICE_ROLE_KEY` (⚠️ **NEVER** expose this on frontend!)

### 1.2 Configure Edge Function Secrets

Edge functions need API keys to work properly. Configure them in Supabase:

```bash
# Navigate to your project
cd /path/to/my-simple-trader

# Set secrets for edge functions (run these one by one)
npx supabase secrets set KRAKEN_KEY=your_kraken_api_key
npx supabase secrets set KRAKEN_SECRET=your_kraken_secret
npx supabase secrets set ALPACA_API_KEY=your_alpaca_key
npx supabase secrets set ALPACA_SECRET=your_alpaca_secret
npx supabase secrets set PLAID_CLIENT_ID=your_plaid_client_id
npx supabase secrets set PLAID_SECRET=your_plaid_secret
npx supabase secrets set OPENAI_API_KEY=your_openai_key
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
npx supabase secrets set SUPABASE_WEBHOOK_SECRET=your_webhook_secret
```

**Alternative: Set secrets via Supabase Dashboard**:
1. Go to: Edge Functions → Settings → Secrets
2. Add each secret manually

### 1.3 Verify Database Schema

Check that all migrations have been applied:

```bash
# List migrations
npx supabase db remote ls

# If migrations are missing, push them
npx supabase db push
```

**Expected tables**:
- `trader_state` - User trading balances and settings
- `withdrawal_requests` - Withdrawal/deposit history
- `user_exchange_keys` - Per-user API keys (encrypted)
- `plaid_items` - Plaid bank connections
- `plaid_accounts` - Plaid account details

### 1.4 Deploy Edge Functions

```bash
# Deploy all edge functions
npx supabase functions deploy push-update
npx supabase functions deploy bot-actions
npx supabase functions deploy bot-tick
npx supabase functions deploy kraken-withdraw
npx supabase functions deploy plaid

# Verify deployment
npx supabase functions list
```

**Edge Function URLs**:
- `push-update`: `https://pchaijknfmrddivqjesm.supabase.co/functions/v1/push-update`
- `bot-actions`: `https://pchaijknfmrddivqjesm.supabase.co/functions/v1/bot-actions`
- `bot-tick`: `https://pchaijknfmrddivqjesm.supabase.co/functions/v1/bot-tick`
- `kraken-withdraw`: `https://pchaijknfmrddivqjesm.supabase.co/functions/v1/kraken-withdraw`
- `plaid`: `https://pchaijknfmrddivqjesm.supabase.co/functions/v1/plaid`

---

## 2. Railway Configuration

### 2.1 Create Railway Project

1. **Go to**: https://railway.app
2. **Click**: "New Project" → "Deploy from GitHub repo"
3. **Select**: `lefaverdakota5-art/my-simple-trader`
4. **Configure**: Railway will detect the Dockerfile automatically

### 2.2 Add Environment Variables

In Railway Dashboard → Your Project → Variables, add the following:

#### Required Variables

```bash
# Supabase Configuration (REQUIRED)
SUPABASE_URL=https://pchaijknfmrddivqjesm.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
SUPABASE_PUSH_UPDATE_URL=https://pchaijknfmrddivqjesm.supabase.co/functions/v1/push-update
SUPABASE_WEBHOOK_SECRET=your_webhook_secret_here

# Frontend Supabase Config (for environment reuse)
VITE_SUPABASE_URL=https://pchaijknfmrddivqjesm.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key_here
VITE_SUPABASE_PROJECT_ID=pchaijknfmrddivqjesm

# Trading Mode
TRADING_MODE=paper  # paper|dry_run|live (start with paper!)
MAX_NOTIONAL_PER_ORDER_USD=1.00
MAX_ORDERS_PER_DAY=20

# Bot Polling
BOT_POLL_INTERVAL_SECONDS=10
BOT_TICK_INTERVAL_SECONDS=30

# CORS (important for web app)
BOT_CORS_ORIGINS=*  # Or your specific domain
```

#### Optional Variables (can be set via UI later)

```bash
# Alpaca (Stock Trading)
ALPACA_API_KEY=your_alpaca_key
ALPACA_SECRET=your_alpaca_secret
ALPACA_PAPER=true
ALPACA_SYMBOLS=AAPL,SPY

# Kraken (Crypto Trading)
KRAKEN_KEY=your_kraken_key
KRAKEN_SECRET=your_kraken_secret
KRAKEN_PAIRS=XBTUSD,ETHUSD
KRAKEN_ENABLE_TRADING=false  # Set true when ready for live
KRAKEN_ENABLE_WITHDRAWALS=false  # Set true when ready for live

# Plaid (Bank Integration)
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret
PLAID_ENV=sandbox  # sandbox|development|production
PLAID_PRODUCTS=auth,transactions
PLAID_ENABLE_TRANSFERS=false
PLAID_ENABLE_PROCESSOR=true

# OpenAI (AI Council)
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4o-mini

# Railway-specific
PORT=8000  # Railway sets this automatically
BOT_SQLITE_PATH=/data/bot_data.sqlite
```

### 2.3 Deploy Backend

1. **Railway will auto-deploy** when you push to GitHub
2. **Manual deploy**: Click "Deploy" in Railway dashboard
3. **View logs**: Click "View Logs" to monitor deployment
4. **Get URL**: Railway will provide a public URL like `https://your-app.up.railway.app`

### 2.4 Verify Deployment

Test the health endpoint:
```bash
curl https://your-app.up.railway.app/health
```

Expected response:
```json
{
  "ok": true,
  "configured": true,
  "trading_mode": "paper",
  "alpaca_paper": true,
  "active_users": []
}
```

---

## 3. API Keys Setup

### 3.1 Alpaca (Stock Trading)

**Where to get**:
1. Go to: https://alpaca.markets
2. Sign up for free paper trading account
3. Navigate to: Dashboard → Paper Trading → API Keys
4. Generate new API key

**How to configure**:
- **Option 1 (Railway)**: Add `ALPACA_API_KEY` and `ALPACA_SECRET` to Railway variables
- **Option 2 (Settings UI)**: Use the app's Settings page to add keys (stored in database)

**Security best practices**:
- ✅ Use paper trading keys first (`ALPACA_PAPER=true`)
- ✅ Never commit keys to git
- ✅ Rotate keys periodically
- ❌ Don't use live keys until fully tested

### 3.2 Kraken (Crypto Trading)

**Where to get**:
1. Go to: https://kraken.com
2. Login → Settings → API
3. Create API key with permissions:
   - ✅ Query Funds
   - ✅ Query Open Orders & Trades
   - ✅ Query Closed Orders & Trades
   - ✅ Create & Modify Orders (only if trading enabled)
   - ✅ Withdraw Funds (only if withdrawals enabled)

**How to configure**:
- **Option 1 (Railway)**: Add `KRAKEN_KEY` and `KRAKEN_SECRET` to Railway variables
- **Option 2 (Settings UI)**: Use the app's Settings page to add keys

**Security best practices**:
- ✅ Start with `KRAKEN_ENABLE_TRADING=false` (read-only mode)
- ✅ Set withdrawal whitelist addresses in Kraken
- ✅ Enable 2FA on Kraken account
- ❌ Don't enable withdrawals until fully tested

### 3.3 Plaid (Bank Integration)

**Where to get**:
1. Go to: https://plaid.com/dashboard
2. Sign up for free developer account
3. Navigate to: Team Settings → Keys
4. Copy `client_id` and sandbox secret

**How to configure**:
- **Option 1 (Railway)**: Add `PLAID_CLIENT_ID` and `PLAID_SECRET` to Railway variables
- **Option 2 (Settings UI)**: Use the app's Settings page to add keys

**Security best practices**:
- ✅ Start with `PLAID_ENV=sandbox` for testing
- ✅ Keep `PLAID_ENABLE_TRANSFERS=false` until approved by Plaid
- ✅ Never expose Plaid secret on frontend
- ❌ Don't use production until Plaid approves your use case

### 3.4 OpenAI (AI Council)

**Where to get**:
1. Go to: https://platform.openai.com/api-keys
2. Create new API key
3. Copy the key (shown only once!)

**How to configure**:
- **Option 1 (Railway)**: Add `OPENAI_API_KEY` to Railway variables
- **Option 2 (Settings UI)**: Use the app's Settings page to add keys
- **Option 3 (Database)**: Store in user_exchange_keys table per user

**Security best practices**:
- ✅ Set usage limits in OpenAI dashboard
- ✅ Use `gpt-4o-mini` for cost efficiency
- ✅ Monitor usage regularly
- ❌ Don't expose key on frontend

### 3.5 OpenAI API Key: GitHub Secrets, Vercel & Supabase

If you are deploying the **frontend to Vercel**, you need to configure the OpenAI API key in the right places. Here's where and how:

#### GitHub Repository Secrets (for CI/CD & Vercel)

If you connect your GitHub repo to Vercel for automatic deployments, Vercel can read environment variables you set directly in the **Vercel dashboard** (recommended). You do **not** need to add `OPENAI_API_KEY` as a GitHub repository secret unless a GitHub Actions workflow needs it.

However, if you want to pass environment variables from GitHub to Vercel via a GitHub Actions deployment workflow, add them as **GitHub repository secrets**:

1. Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Add the following secrets:

| Secret Name         | Value                        | Description                   |
|---------------------|------------------------------|-------------------------------|
| `OPENAI_API_KEY`    | `sk-...your key...`         | Your OpenAI API key           |
| `OPENAI_MODEL`      | `gpt-4o-mini`               | (Optional) OpenAI model name  |

> **Note:** The secret **must** be named exactly `OPENAI_API_KEY` — this matches the environment variable name used by the backend (`main.py`) and Supabase Edge Functions.

#### Vercel Environment Variables

When deploying the frontend to Vercel, add environment variables in the **Vercel dashboard**:

1. Go to: https://vercel.com → Your Project → **Settings** → **Environment Variables**
2. Add the following:

| Name                               | Value                              | Environment     |
|------------------------------------|------------------------------------|-----------------|
| `VITE_SUPABASE_URL`               | `https://pchaijknfmrddivqjesm.supabase.co` | All |
| `VITE_SUPABASE_PUBLISHABLE_KEY`   | Your Supabase anon/public key      | All             |

> **Important:** The OpenAI API key is a **backend secret** — it should **not** be added to Vercel as a `VITE_` prefixed variable because that would expose it in the browser. The frontend never calls OpenAI directly; it goes through the backend (Railway) or Supabase Edge Functions.

#### Do You Need to Add It to Supabase?

**Yes** — if you use Supabase Edge Functions for trading (the `bot-tick` function calls OpenAI for AI council voting). Add it as a Supabase Edge Function secret:

```bash
npx supabase secrets set OPENAI_API_KEY=sk-...your_key_here
```

Or via the Supabase Dashboard:
1. Go to: https://supabase.com/dashboard/project/pchaijknfmrddivqjesm
2. Navigate to: **Edge Functions** → **Settings** → **Secrets**
3. Add: `OPENAI_API_KEY` = your key

Additionally, per-user OpenAI keys can be stored in the `user_exchange_keys` table via the **Settings UI** in the app. This allows each user to bring their own OpenAI key.

#### Summary: Where to Put the OpenAI API Key

| Platform          | Variable Name     | Required? | Purpose                                    |
|-------------------|-------------------|-----------|--------------------------------------------|
| **Railway**       | `OPENAI_API_KEY`  | Yes*      | Backend bot uses it for AI council voting   |
| **Supabase**      | `OPENAI_API_KEY`  | Yes*      | Edge Functions (`bot-tick`) call OpenAI     |
| **GitHub Secrets**| `OPENAI_API_KEY`  | Optional  | Only if a GitHub Actions workflow deploys to a service that needs it |
| **Vercel**        | Do **not** add    | No        | Frontend never calls OpenAI directly        |
| **Settings UI**   | (per-user)        | Optional  | Users can add their own key in the app      |

\* At least one of Railway or Supabase is required if you want AI council voting to work.

### 3.6 Where to Set Keys: Railway vs Settings UI

**Use Railway Environment Variables when**:
- ✅ Keys are shared across all users (single-tenant deployment)
- ✅ You want keys loaded at startup
- ✅ You're using one exchange/bank account for everyone

**Use Settings UI when**:
- ✅ Each user has their own API keys (multi-tenant)
- ✅ Users manage their own integrations
- ✅ You want dynamic key updates without restart

**Best Practice**: 
- **Backend keys** (Supabase service role, webhook secrets): Railway only
- **Trading keys** (Alpaca, Kraken): Settings UI preferred for multi-user
- **OpenAI**: Settings UI for per-user enablement

---

## 4. Verification Steps

### 4.1 Run Verification Script

```bash
# Make script executable
chmod +x scripts/verify-setup.sh

# Run verification
./scripts/verify-setup.sh
```

The script checks:
- ✅ Supabase project ID consistency
- ✅ Required environment variables
- ✅ Database schema is up to date
- ✅ Edge functions are deployed
- ✅ Railway configuration
- ✅ API connections

### 4.2 Test Supabase Connection

**Method 1: Browser**
```bash
# Open Supabase dashboard
open https://supabase.com/dashboard/project/pchaijknfmrddivqjesm
```

**Method 2: API Test**
```bash
# Test auth endpoint
curl https://pchaijknfmrddivqjesm.supabase.co/rest/v1/ \
  -H "apikey: YOUR_ANON_KEY"
```

**Method 3: Edge Function Test**
```bash
# Test push-update function
curl -X POST https://pchaijknfmrddivqjesm.supabase.co/functions/v1/push-update \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test","balance":100}'
```

### 4.3 Test Railway Deployment

**Check health endpoint**:
```bash
curl https://your-app.up.railway.app/health
```

**Check config status**:
```bash
curl https://your-app.up.railway.app/config/status
```

Expected response shows which services are configured:
```json
{
  "supabase_configured": true,
  "alpaca_configured": true,
  "kraken_configured": true,
  "plaid_configured": false,
  "missing": [],
  "note": "..."
}
```

**View logs**:
```bash
# In Railway dashboard
Click "View Logs" to see real-time backend logs
```

### 4.4 Test Trading Functionality

**Start a simulation** (no real trades):
```bash
curl -X POST https://your-app.up.railway.app/simulate/run \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "seconds": 20,
    "tick_seconds": 5,
    "pairs": ["XBTUSD"],
    "symbols": ["AAPL"]
  }'
```

**Check bot status**:
```bash
curl https://your-app.up.railway.app/me/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 4.5 Test Frontend Integration

1. **Update frontend .env**:
   ```bash
   VITE_SUPABASE_URL=https://pchaijknfmrddivqjesm.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
   VITE_SUPABASE_PROJECT_ID=pchaijknfmrddivqjesm
   ```

2. **Start dev server**:
   ```bash
   npm install
   npm run dev
   ```

3. **Test features**:
   - ✅ User signup/login
   - ✅ Deposit money (virtual)
   - ✅ Enable trading bot
   - ✅ View portfolio
   - ✅ Check trade history

### 4.6 Common Issues & Fixes

**Issue**: "Supabase not configured"
- **Fix**: Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Railway

**Issue**: "CORS error" in browser
- **Fix**: Set `BOT_CORS_ORIGINS` to your frontend URL (or `*` for development)

**Issue**: "Edge function not found"
- **Fix**: Deploy edge functions with `npx supabase functions deploy <name>`

**Issue**: "Alpaca/Kraken not configured"
- **Fix**: Add keys via Settings UI or Railway environment variables

**Issue**: "Database schema mismatch"
- **Fix**: Run `npx supabase db push` to apply migrations

**Issue**: Railway deployment fails
- **Fix**: Check Dockerfile syntax and requirements.txt dependencies

**Issue**: Bot not starting automatically
- **Fix**: Enable swarm in database: `UPDATE trader_state SET swarm_active=true WHERE user_id='...'`

---

## Security Checklist

Before going live, verify:

- [ ] ✅ All secrets stored in Railway (never in git)
- [ ] ✅ Service role key never exposed to frontend
- [ ] ✅ CORS configured to specific domains (not `*`)
- [ ] ✅ Supabase RLS policies enabled
- [ ] ✅ API rate limiting configured
- [ ] ✅ HTTPS enforced on all endpoints
- [ ] ✅ OpenAI usage limits set
- [ ] ✅ Kraken withdrawal whitelist configured
- [ ] ✅ Started with paper/sandbox trading
- [ ] ✅ Monitoring and alerts configured
- [ ] ✅ Database backups enabled

---

## Next Steps

1. **Local Development**: 
   - Copy `.env.example` to `.env`
   - Fill in your keys
   - Run `npm run dev` (frontend) and `python main.py` (backend)

2. **Production Deployment**:
   - Push to GitHub → Railway auto-deploys
   - Configure production keys in Railway
   - Update CORS to your domain
   - Enable monitoring

3. **Mobile App** (optional):
   - Run `./build-apk.sh` to build Android app
   - Configure Capacitor for iOS/Android

4. **Monitoring**:
   - Railway logs: Real-time backend logs
   - Supabase logs: Database queries and edge function calls
   - OpenAI usage: Check API usage dashboard

---

## Support

**Documentation**:
- Supabase: https://supabase.com/docs
- Railway: https://docs.railway.app
- Alpaca: https://alpaca.markets/docs
- Kraken: https://docs.kraken.com/rest
- Plaid: https://plaid.com/docs

**Project Files**:
- `README.md` - Project overview
- `QUICKSTART.md` - Quick start guide
- `TESTING_REAL_TRADES.md` - Trading safety guide
- `IMPLEMENTATION.md` - Technical details

**Issues**:
- GitHub Issues: Report bugs and request features
- Edge Function Logs: Supabase Dashboard → Edge Functions → Logs
- Backend Logs: Railway Dashboard → View Logs

---

**⚠️ IMPORTANT REMINDER**:
- Always test with paper trading first
- Never commit API keys to git
- Review all trades before enabling live mode
- Monitor costs and usage regularly
- Keep service role key secret
- Enable 2FA on all exchange accounts
