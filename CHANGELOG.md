# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2025-12-22

### Added
- **Deposit Flow**: Fully functional deposit system from Chime to trading account
  - Frontend now calls backend `/deposit/from_chime` API endpoint
  - Backend updates `trader_state.balance` in Supabase database
  - Creates deposit records in `withdrawal_requests` table
  - Real-time balance updates shown in UI
  
- **Kraken Trading Integration**: Switched from Alpaca to Kraken-only trading
  - Implemented `_kraken_trade_one_pair()` for executing Kraken buy orders
  - Added `_kraken_get_portfolio_value()` to calculate total portfolio value
  - Kraken API integration for real market orders
  - Support for XBTUSD, ETHUSD and other Kraken pairs
  
- **Balance Management System**:
  - `_get_trader_state_balance()`: Fetches deposited balance from database
  - `_update_trader_state_balance()`: Deducts funds after trade execution
  - Balance validation before every trade
  - Automatic trade blocking when balance insufficient
  
- **Comprehensive Logging**:
  - Enhanced deposit endpoint logging with step-by-step traces
  - Detailed Kraken trading logs showing prices, volumes, and transaction IDs
  - Balance updates logged at every step
  - Error tracking and debugging information
  
- **Testing & Verification**:
  - `test_deposit_trade_flow.py`: Automated verification script
  - `TESTING_REAL_TRADES.md`: Complete step-by-step testing guide
  - Manual testing instructions for real money verification
  - Troubleshooting guidelines and safety notes

### Changed
- **Trading Mode**: Changed from Alpaca stocks to Kraken cryptocurrency trading
- **Balance Source**: Bot now uses `trader_state.balance` from Supabase instead of broker account balance
- **Version**: Updated package version from 0.0.5 to 1.3.0
- **Android APK**: Version naming changed to 1.3.{build_number} format
- **Bot Loop**: Modified to use Kraken portfolio value instead of Alpaca equity

### Fixed
- **Deposit Flow**: Fixed frontend deposit not updating backend balance
  - Previously only created pending record without updating balance
  - Now properly calls backend API to update trader_state
  
- **Trading Execution**: Fixed trading to use actual deposited funds
  - Previously used Alpaca account balance (disconnected from deposits)
  - Now checks and deducts from trader_state balance
  
- **Balance Tracking**: Fixed balance deduction after trades
  - Added proper balance update after each successful trade
  - Prevents overdrafts and tracks spending accurately

### Security
- Added balance validation before trades to prevent overdrafts
- Implemented KRAKEN_ENABLE_TRADING guard to prevent accidental live trading
- Added TRADING_MODE configuration (paper/live) for safe testing
- Balance checks protect against insufficient funds

### Technical Details
- Backend: Python FastAPI with Kraken and Supabase integration
- Frontend: React/TypeScript with real-time balance updates
- Database: Supabase PostgreSQL with trader_state and trades tables
- Trading: Kraken API for cryptocurrency market orders
- Environment: Configurable trading mode and limits

### Breaking Changes
- Removed Alpaca trading functionality (replaced with Kraken)
- Balance now stored in trader_state table instead of using broker balance
- KRAKEN_ENABLE_TRADING must be set to true for trading to work

### Migration Guide
If upgrading from previous version:
1. Set new environment variables:
   - `KRAKEN_ENABLE_TRADING=true`
   - `TRADING_MODE=paper` (or `live`)
   - `KRAKEN_KEY` and `KRAKEN_SECRET`
2. Remove Alpaca-specific environment variables (optional)
3. Deposit funds via Banking page to initialize trader_state balance
4. Monitor first few trades to verify balance deduction works

## [0.0.5] - Previous Version
- Basic Alpaca trading integration
- Deposit UI (frontend only, not functional)
- Trading bot with AI council
- Supabase database integration

[1.3.0]: https://github.com/lefaverdakota5-art/my-simple-trader/compare/v0.0.5...v1.3.0
[0.0.5]: https://github.com/lefaverdakota5-art/my-simple-trader/releases/tag/v0.0.5
