# How to Download the Pre-Built APK

Since building the APK requires Android SDK and specific Node.js versions, I've set up automated builds using GitHub Actions.

## Quick Download Instructions

### Option 1: Download from GitHub Releases (Recommended)

1. **Go to Releases**: Navigate to https://github.com/lefaverdakota5-art/my-simple-trader/releases
2. **Download APK**: Look for the latest release and download `app-debug.apk`
3. **Transfer to Phone**: Send the APK file to your Samsung Galaxy S20
4. **Install**: Open the APK file on your phone and follow installation prompts

### Option 2: Download from GitHub Actions Artifacts

1. **Go to Actions**: Navigate to https://github.com/lefaverdakota5-art/my-simple-trader/actions
2. **Select Workflow**: Click on "Build Android APK" workflow
3. **Select Latest Run**: Click on the most recent successful run
4. **Download Artifact**: Scroll down to "Artifacts" section and download `app-debug`
5. **Extract ZIP**: The artifact is a ZIP file containing `app-debug.apk`
6. **Transfer to Phone**: Send the APK to your Samsung Galaxy S20
7. **Install**: Open the APK on your phone

## Installation on Samsung Galaxy S20

1. **Enable Unknown Sources**:
   - Go to Settings → Apps → Special access → Install unknown apps
   - Select your file manager or browser
   - Toggle "Allow from this source"

2. **Install APK**:
   - Open the APK file using your file manager
   - Tap "Install"
   - Wait for installation to complete
   - Tap "Open" or find "AI Trader" in your app drawer

## First Time Setup

### ⚠️ IMPORTANT: The APK Starts in Paper Trading Mode for Safety

1. **Create Account**:
   - Open the app
   - Sign up with email and password
   - Verify your email

2. **Add API Keys** (Settings Page):
   - **Kraken**: API Key + Secret (for crypto trading)
   - **Alpaca**: API Key + Secret (for stock trading)
   - **OpenAI**: API Key (for AI council)
   - **Plaid**: Client ID + Secret (optional, for bank linking)

3. **Configure Backend**:
   - The app needs a backend server to function
   - See `DEPLOYMENT.md` for deployment options
   - In Settings, set "Bot Backend URL" to your deployed backend

4. **Test in Paper Mode**:
   - Enable the SWARM toggle in Dashboard
   - Monitor AI council decisions
   - Watch paper trades execute
   - **Test for at least 1 week before considering live trading**

## Enable Live Trading (Only After Thorough Testing!)

### ⚠️ WARNING: Live Trading Involves Real Money - Potential for Significant Loss

**Prerequisites**:
- [ ] Tested in paper mode for 1+ week
- [ ] Verified all API connections work
- [ ] Confirmed AI council makes reasonable decisions
- [ ] Reviewed and adjusted order limits
- [ ] Set up proper monitoring
- [ ] Have tested emergency stop (SWARM OFF)

**Backend Configuration** (in `.env` file on your server):

```bash
# Switch from paper to live trading
TRADING_MODE=live

# Enable Kraken live trading
KRAKEN_ENABLE_TRADING=true

# Switch Alpaca to live mode
ALPACA_PAPER=false

# Keep safety limits
MAX_NOTIONAL_PER_ORDER_USD=10.00  # Start small!
MAX_ORDERS_PER_DAY=20

# Enable OpenAI (optional but recommended)
OPENAI_ENABLED=true
SWARM_STRATEGY_MODE=hybrid
```

**Steps**:
1. Deploy backend with live trading configuration
2. Restart backend to apply changes
3. In app Settings, verify backend URL is correct
4. Start with very small orders (e.g., $1-10)
5. Monitor closely for first 24-48 hours
6. Gradually increase limits if comfortable

## Updating the App

When new versions are released:
1. Download the new APK
2. Install over the existing app (data will be preserved)
3. Your API keys and settings will remain

## Troubleshooting

### App Won't Install
- **Solution**: Enable "Install from Unknown Sources" for your file manager
- **Alternative**: Use ADB: `adb install app-debug.apk`

### App Crashes on Launch
- **Check**: Android version (requires Android 5.0+)
- **Try**: Clear app data and reinstall
- **Check Logs**: `adb logcat | grep Capacitor`

### "Cannot Connect to Backend"
- **Verify**: Backend is running and accessible
- **Check**: Backend URL in Settings is correct
- **Test**: Open backend URL in phone browser (should show health endpoint)
- **Firewall**: Ensure backend port is open if self-hosted

### API Keys Not Working
- **Verify**: Keys are correctly copied (no extra spaces)
- **Check**: Keys have correct permissions on exchange
- **Kraken**: Ensure keys have "Query Funds" and "Create Orders" permissions
- **Alpaca**: Use paper trading keys for testing
- **OpenAI**: Ensure billing is set up and key is active

### Trades Not Executing
- **Check**: SWARM is ON in Dashboard
- **Verify**: Backend is in correct trading mode
- **Review**: AI council votes in Council page
- **Check Limits**: Daily order limit not reached

## Security Reminders

- 🔒 **Never share your API keys**
- 🔒 **Use strong passwords for your trading accounts**
- 🔒 **Enable 2FA on all exchanges**
- 🔒 **Start with small amounts**
- 🔒 **Monitor regularly**
- 🔒 **Keep order limits reasonable**
- 🔒 **Only use on trusted networks**

## Automated Build Status

You can check if a new APK is being built:
- Visit: https://github.com/lefaverdakota5-art/my-simple-trader/actions
- Look for "Build Android APK" workflow
- Green checkmark = build successful, APK available

## Support

For issues:
1. Check `README_SETUP.md` for setup help
2. Check `APK_BUILD_GUIDE.md` for build details
3. Check `DEPLOYMENT.md` for backend deployment
4. Review logs in Android Logcat for errors

---

**Remember**: This app enables autonomous trading with real money. Always test thoroughly in paper mode first, start with small amounts, and never invest more than you can afford to lose.

---

Built for Samsung Galaxy S20 | Android 10+
Version: 0.0.4 | Debug Build
