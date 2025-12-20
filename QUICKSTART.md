# Quick Start Guide

This guide helps you get the AI Trader app running on your Samsung Galaxy S20.

## Step 1: Download the APK

1. Go to GitHub → Actions tab
2. Find the latest successful workflow run
3. Download the APK artifact
4. Transfer to your phone and install

## Step 2: Configure Backend (One-Time Setup)

### Option A: Use Railway (Recommended)

1. Go to [Railway.app](https://railway.app)
2. Create new project → Deploy from GitHub
3. Select this repository
4. Add environment variables:
   ```
   SUPABASE_URL=https://whdljtbtqisoszbrzdwq.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   SUPABASE_PUSH_UPDATE_URL=your_edge_function_url
   
   ALPACA_API_KEY=your_alpaca_key
   ALPACA_SECRET=your_alpaca_secret
   ALPACA_PAPER=true
   
   KRAKEN_KEY=your_kraken_key
   KRAKEN_SECRET=your_kraken_secret
   
   PLAID_CLIENT_ID=your_plaid_client_id
   PLAID_SECRET=your_plaid_secret
   PLAID_ENV=sandbox
   
   OPENAI_API_KEY=your_openai_key
   
   TRADING_MODE=paper
   MAX_NOTIONAL_PER_ORDER_USD=1.00
   MAX_ORDERS_PER_DAY=20
   ```
5. Deploy and copy your Railway URL (e.g., `https://your-app.railway.app`)

### Option B: Use Render

1. Go to [Render.com](https://render.com)
2. New → Web Service → Connect GitHub
3. Select this repository
4. Build command: `pip install -r requirements.txt`
5. Start command: `python main.py`
6. Add the same environment variables as above
7. Deploy and copy your Render URL

## Step 3: Configure App

1. Open AI Trader app on your phone
2. Go to Settings
3. Set "Bot Backend URL" to your Railway/Render URL
4. Click Save

## Step 4: Configure Supabase (One-Time)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `whdljtbtqisoszbrzdwq`
3. Go to SQL Editor
4. Run these migrations if not already done:
   - `supabase/migrations/20251215023500_plaid_tables.sql`
   - `supabase/migrations/20251215060000_user_exchange_keys.sql`
   - `supabase/migrations/20251215073000_user_exchange_keys_openai.sql`

## Step 5: Start Trading

1. Open the app
2. Login/Sign up with your email
3. Dashboard will show:
   - Current balance
   - Portfolio value
   - AI Council votes
4. Navigate to:
   - **Council** - See AI agent decisions
   - **Banking** - Connect Chime via Plaid (optional)
   - **Withdraw** - Move funds (when configured)
   - **Settings** - Update API keys anytime

## Automatic Backend Connection

Once you've set the Backend URL in Settings:
- App auto-connects on startup
- No need to enter API keys in the app
- All keys stay secure on your server
- Trading happens automatically based on AI council votes

## Trading Modes

Set `TRADING_MODE` on your backend:
- `paper` - Safe testing with paper money (recommended)
- `dry_run` - Simulates trades, no actual orders
- `live` - Real trading (use carefully!)

## Getting API Keys

- **Alpaca**: [alpaca.markets](https://alpaca.markets) - Free paper trading
- **Kraken**: [kraken.com](https://www.kraken.com) - Create API key in Settings
- **Plaid**: [plaid.com](https://plaid.com) - Sign up for developer account
- **OpenAI**: [platform.openai.com](https://platform.openai.com) - Create API key
- **Supabase**: Already configured (see `.env` file)

## Troubleshooting

**"Edge function error" when connecting Plaid:**
- Use backend URL instead of edge functions
- Or configure edge function secrets in Supabase

**"Cannot connect to backend":**
- Check Backend URL in Settings
- Verify your Railway/Render deployment is running
- Check environment variables are set

**"No trades happening":**
- Check Dashboard → Council votes
- Verify `TRADING_MODE=paper` or `live` (not `dry_run`)
- Ensure `MAX_ORDERS_PER_DAY` > 0
- Check AI Council requires 4/5 YES votes

## Security Notes

- Never commit API keys to GitHub
- Keep your backend URL private
- Use paper trading mode for testing
- Review all trades before going live
- Start with small amounts (`MAX_NOTIONAL_PER_ORDER_USD=1.00`)

## Support

For issues:
1. Check backend logs in Railway/Render dashboard
2. Check browser console in the app (if using web version)
3. Review `IMPLEMENTATION.md` for technical details
4. See `README.md` for full documentation
