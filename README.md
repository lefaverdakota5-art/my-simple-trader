# Masterpiece Swarm Trader (v1.5.0)

An AI-powered trading application with a 4-agent swarm council, Supabase ledger, real-time price feeds, and automated CI/CD builds for Android, iOS, and Desktop.

## ⬇️ Download Pre-Built Binaries

| Platform | How to Download |
|----------|----------------|
| 📱 **Android APK** | [Actions → Build All Platforms](../../actions/workflows/build-all-platforms.yml) → latest run → Artifacts |
| 🍎 **iOS Bundle**  | [Actions → Build All Platforms](../../actions/workflows/build-all-platforms.yml) → latest run → Artifacts |
| 🖥️ **Desktop (Python)** | [Actions → Build All Platforms](../../actions/workflows/build-all-platforms.yml) → latest run → Artifacts |
| 📦 **All Platforms** | [Releases](../../releases) — pick the latest tagged release |

> See [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md) for full CI/CD setup and build instructions.

## ✨ Version 1.5.0 - CI/CD & Multi-Platform Builds

- ✅ **GitHub Actions CI/CD** - Automated builds for Android APK, iOS, and Desktop on every push
- ✅ **Multi-Platform Artifacts** - Download pre-built binaries directly from GitHub Actions
- ✅ **Automated Releases** - Tag a version to auto-create a GitHub Release with all platform builds
- ✅ **4-Agent AI Swarm** - Technical, Sentiment, Risk, and Execution agents collaborate on every trade
- ✅ **Supabase Ledger** - Complete `schema.sql` for trade logging, P&L tracking, and bot config
- ✅ **Kill Switch** - Instantly halt the bot from the UI or via Supabase `bot_config`
- ✅ **Functional Deposit Flow** - Deposit money from Chime directly into your trading account
- ✅ **Kraken-Only Trading** - Focused cryptocurrency trading via Kraken API
- ✅ **Real Balance Tracking** - Deposits update your balance, trades deduct from it
- ✅ **Enhanced Logging** - Complete visibility into deposits and trades
- ✅ **Comprehensive Testing** - Step-by-step guide for verifying real trades

## Features

- 📱 **Mobile-First Android App** - Built with Capacitor for Samsung Galaxy S20 and other Android devices
- 🤖 **OpenAI Swarm Council** - 5 specialized AI agents vote on trading decisions (4/5 required)
- 💰 **Kraken Crypto Trading** - Trade Bitcoin, Ethereum, and other cryptocurrencies
- 🏦 **Bank Integration** - Connect your Chime account for deposits and withdrawals
- ⚙️ **Dynamic Configuration** - Update API keys directly in the app settings
- 📊 **Real-Time Dashboard** - Monitor your portfolio, trades, and AI council decisions
- 💵 **Balance Management** - Deposit funds, track spending, automatic overdraft protection

## Technologies

**Frontend:**
- React + TypeScript
- Vite
- Capacitor 8 (Android)
- shadcn-ui + Tailwind CSS

**Backend:**
- FastAPI (Python)
- Supabase (Database & Auth)
- Edge Functions (Deno)

**Integrations:**
- Kraken API (Crypto Trading)
- Plaid API (Bank Linking)
- OpenAI API (AI Council)

## Quick Start

### Prerequisites

- Node.js 22+ (required for Capacitor 8)
- Python 3.11+
- Android SDK (for APK building)
- Java 21+ (for Android builds)

### Installation

```bash
# Clone the repository
git clone https://github.com/lefaverdakota5-art/my-simple-trader.git
cd my-simple-trader

# Install dependencies
npm install
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys
```

### Running Locally

**Web Development:**
```bash
npm run dev
```

**Backend (FastAPI):**
```bash
python main.py
```

The app will be available at `http://localhost:5173` and the backend at `http://localhost:8000`.

## Building the Android APK

### Automatic Build (GitHub Actions)

The easiest way to build an APK is to push your code to GitHub. The workflow automatically:
1. Builds the web app
2. Syncs with Capacitor
3. Compiles the Android APK
4. Uploads the APK as an artifact

Download the APK from the Actions tab after the build completes.

### Local Build

```bash
# Requires Node.js 22+, Android SDK, and Java 21+
./build-apk.sh
```

The debug APK will be available at `./ai-trader-debug.apk`.

### Manual Build Steps

```bash
# Build web app
npm run build

# Sync with Capacitor
npx cap sync android

# Build APK
cd android
BUILD_NUMBER=1 VERSION_NAME=0.0.1 ./gradlew assembleDebug
```

## Configuration

### API Keys Setup

All API keys can be configured dynamically through the app's Settings page:

1. **Alpaca** (Stock Trading)
   - Get keys from https://alpaca.markets
   - Required: API Key + Secret
   - Supports both paper and live trading

2. **Kraken** (Crypto Trading)
   - Get keys from https://www.kraken.com
   - Required: API Key + Secret
   - Enable trading with `KRAKEN_ENABLE_TRADING=true`

3. **Plaid** (Bank Integration)
   - Get keys from https://plaid.com
   - Required: Client ID + Secret
   - Choose environment: sandbox/development/production

4. **OpenAI** (AI Council)
   - Get key from https://platform.openai.com
   - Optional but recommended for intelligent trading
   - Supports GPT-4o-mini (default) and other models
   - **Where to add the key:**
     - **Railway**: Set `OPENAI_API_KEY` in Railway environment variables (for the backend)
     - **Supabase**: Set `OPENAI_API_KEY` as an Edge Function secret (for `bot-tick`)
     - **GitHub Secrets**: Name it `OPENAI_API_KEY` (only needed if a GitHub Actions workflow requires it)
     - **Vercel**: Do **not** add it — the frontend never calls OpenAI directly
   - See [SETUP.md](SETUP.md#35-openai-api-key-github-secrets-vercel--supabase) for full details

5. **Supabase** (Database)
   - Already configured in `.env`
   - Project ID and API keys included

### Backend Configuration

The Python backend can be configured via environment variables or the SQLite database:

```bash
# Trading Mode
TRADING_MODE=paper  # paper|dry_run|live

# Risk Limits
MAX_NOTIONAL_PER_ORDER_USD=1.00
MAX_ORDERS_PER_DAY=20

# Bot Settings
BOT_POLL_INTERVAL_SECONDS=10
BOT_TICK_INTERVAL_SECONDS=30

# Enable/Disable Features
KRAKEN_ENABLE_TRADING=false
KRAKEN_ENABLE_WITHDRAWALS=false
PLAID_ENABLE_TRANSFERS=false
```

## OpenAI Swarm Council

When enabled, the app uses 5 specialized AI agents to vote on each trade:

1. **Momentum Analyst** - Evaluates price momentum
2. **Risk Manager** - Assesses trade risk
3. **Technical Analyst** - Analyzes technical indicators
4. **Market Sentiment Analyst** - Gauges market sentiment
5. **Portfolio Guardian** - Checks risk limits

A trade is approved only if 4 out of 5 agents vote YES.

## Plaid Integration (Chime Account)

1. Navigate to **Banking** in the app
2. Click **Connect Bank Account**
3. Follow the Plaid Link flow
4. Select your Chime account
5. The app can now see balances and (with Transfer enabled) move funds

**Note:** Plaid Transfer requires special approval from Plaid.

## Security Notes

- API keys are stored securely in Supabase (encrypted at rest)
- The backend uses Row Level Security (RLS) for data protection
- Never commit API keys to the repository
- Use paper trading mode for testing
- Start with small amounts when going live

## Deployment

### Web Deployment
Deploy the web app to any hosting service (Vercel, Netlify, Railway, etc.)

### Backend Deployment
Deploy the FastAPI backend to Railway, Render, or any Python hosting service:
```bash
# Railway
railway up

# Or Docker
docker build -t ai-trader .
docker run -p 8000:8000 ai-trader
```

### Supabase
The Supabase project is already set up. Edge functions are deployed automatically.

## Development

### Project Structure
```
├── src/                 # React frontend
│   ├── pages/          # App pages
│   ├── components/     # UI components
│   └── integrations/   # Supabase client
├── android/            # Android/Capacitor project
├── supabase/          # Supabase edge functions
├── main.py            # FastAPI backend
└── requirements.txt   # Python dependencies
```

### Testing
```bash
# Run Python tests
python -m pytest test_main.py

# Lint
npm run lint
```

## Samsung Galaxy S20 Compatibility

The app is fully compatible with Samsung Galaxy S20:
- Minimum SDK: 24 (Android 7.0)
- Target SDK: 36 (Android 14)
- Optimized for 6.2" display
- Hardware acceleration enabled

## Support

For issues, questions, or contributions, please open an issue on GitHub.

## License

This is a personal project. All rights reserved.
