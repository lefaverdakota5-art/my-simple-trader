# Real Money Trading Verification Guide

## Overview
This guide explains how to verify that actual trades with real money go through the system correctly.

## Complete Flow Architecture

```
1. USER DEPOSITS FUNDS
   ↓
   Frontend (Withdraw.tsx) → POST /deposit/from_chime
   ↓
   Backend (main.py) processes deposit:
   - Validates authentication
   - Fetches current trader_state.balance
   - Adds deposit amount to balance
   - Updates trader_state table in Supabase
   - Creates deposit record in withdrawal_requests table
   ↓
   trader_state.balance INCREASED ✓

2. BOT MONITORS MARKET
   ↓
   UserBot.run() loop (every 30s by default):
   - Gets price change from Kraken
   - AI Council votes (4/5 YES required)
   ↓
   IF APPROVED:

3. EXECUTE TRADE
   ↓
   _kraken_trade_one_pair() is called:
   - Checks trader_state.balance >= trade_amount
   - If insufficient: SKIP with warning
   - If sufficient:
     * Gets pair info from Kraken
     * Gets current price
     * Calculates volume to buy
     * Submits BUY order to Kraken API
     * Kraken processes REAL order
   ↓
   ORDER PLACED ON KRAKEN ✓
   ↓
   - Deducts trade_amount from trader_state.balance
   - Updates balance in Supabase
   - Creates trade record in trades table
   - Sends notification
   ↓
   trader_state.balance DECREASED ✓
```

## Prerequisites for Real Trading

### 1. Environment Variables
```bash
# Required
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export KRAKEN_KEY="your-kraken-api-key"
export KRAKEN_SECRET="your-kraken-api-secret"

# Trading configuration
export KRAKEN_ENABLE_TRADING=true  # MUST be true for real trades
export TRADING_MODE=paper  # Use 'paper' for Kraken paper trading
                           # Use 'live' for REAL MONEY trading

# Trading limits (start small!)
export MAX_NOTIONAL_PER_ORDER_USD=1.00  # Trade $1 per order
export MAX_ORDERS_PER_DAY=20            # Max 20 trades per day

# Kraken trading pairs
export KRAKEN_PAIRS=XBTUSD,ETHUSD  # Bitcoin and Ethereum
```

### 2. Kraken API Setup
1. Log into Kraken.com
2. Go to Settings → API
3. Create new API key with permissions:
   - ✓ Query Funds
   - ✓ Query Open Orders & Trades
   - ✓ Query Closed Orders & Trades
   - ✓ Create & Modify Orders (for live trading)
4. Copy API Key and Private Key
5. Set as KRAKEN_KEY and KRAKEN_SECRET

### 3. Supabase Setup
1. Project must have tables: trader_state, trades, withdrawal_requests
2. Get service role key from Project Settings → API
3. Enable Realtime for trader_state and trades tables

## Step-by-Step Testing Procedure

### STEP 1: Setup Environment
```bash
# In terminal where you'll run backend
cd /path/to/my-simple-trader
export SUPABASE_URL="your-url"
export SUPABASE_SERVICE_ROLE_KEY="your-key"
export KRAKEN_KEY="your-kraken-key"
export KRAKEN_SECRET="your-kraken-secret"
export KRAKEN_ENABLE_TRADING=true
export TRADING_MODE=paper  # Start with paper trading!
export MAX_NOTIONAL_PER_ORDER_USD=1.00
```

### STEP 2: Start Backend
```bash
python main.py
```

Expected output:
```
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

### STEP 3: Connect Chime Account (Frontend)
1. Open app in browser
2. Go to Settings page
3. Enter Chime details:
   - Routing Number: (your routing number)
   - Account Number: (your account number)
   - Account Name: (e.g., "Main Checking")
4. Click Save
5. Verify success message

### STEP 4: Deposit Funds
1. Go to Banking page
2. Make sure "Deposit to Trading" tab is selected
3. Enter amount: **10.00** (start with $10)
4. Click "Deposit to Trading Account"
5. **VERIFY** success message shows new balance

**Expected Backend Logs:**
```
[deposit] User abc123: Depositing $10.00
[deposit] Current balance: $0.00
[deposit] New balance: $10.00
[deposit] Updated trader_state balance in database
[deposit] Created deposit record in withdrawal_requests
[deposit] ✅ SUCCESS: Deposited $10.00, new balance $10.00
```

**Verify in Supabase:**
1. Open Supabase Table Editor
2. Check `trader_state` table:
   - Find your user_id row
   - Verify `balance` = 10.00
3. Check `withdrawal_requests` table:
   - Should have 1 row with:
     - amount = 10.00
     - status = "completed"
     - withdraw_type = "deposit"

### STEP 5: Activate Trading Bot
In Supabase Table Editor:
1. Open `trader_state` table
2. Find your user row
3. Set `swarm_active` = `true`
4. Click Save

**Expected Backend Logs:**
```
[bot-manager] Starting bot for user abc123
Swarm started
```

### STEP 6: Wait for Trade Execution
The bot will:
1. Monitor Kraken price changes (every 30 seconds)
2. Get AI Council votes
3. When 4/5 vote YES, attempt to trade

**Expected Backend Logs (when trade happens):**
```
[kraken-trade] User abc123: Balance=$10.00, Trade amount=$1.00
[kraken-trade] XBTUSD current price: $43250.00
[kraken-trade] Placing order: BUY 0.00002313 XBTUSD (~$1.00)
[kraken-trade] Updating balance: $10.00 -> $9.00
[kraken-trade] SUCCESS: ✅ Placed Kraken BUY XBTUSD 0.00002313 (~$1.00) txid:ABC-XYZ-123 (New balance: $9.00)
```

### STEP 7: Verify Trade Execution

#### A. Check Backend Logs
Look for `[kraken-trade] SUCCESS` messages showing:
- Amount traded
- Transaction ID from Kraken
- Updated balance

#### B. Check Supabase Tables

**trader_state table:**
- balance should decrease by $1.00
- Before: 10.00 → After: 9.00

**trades table:**
- New row with message like:
  "✅ Placed Kraken BUY XBTUSD 0.00002313 (~$1.00) txid:ABC-XYZ-123 (New balance: $9.00)"

#### C. Check Kraken Account
1. Log into Kraken.com
2. Go to History → Trade History
3. Look for recent BUY order
4. Verify:
   - Type: BUY
   - Pair: XBTUSD (or ETHUSD)
   - Volume: matches logs
   - Status: Filled

### STEP 8: Verify Balance Deduction
After each trade:
1. Check `trader_state.balance` in Supabase
2. Should be reduced by MAX_NOTIONAL_PER_ORDER_USD
3. Trade 1: $10.00 → $9.00
4. Trade 2: $9.00 → $8.00
5. ...continues until balance < $1.00

When balance is insufficient:
```
[kraken-trade] Insufficient balance for trade: $0.50 < $1.00
```

### STEP 9: Verify No More Trades When Balance Low
1. Wait for balance to drop below $1.00
2. Bot should stop trading
3. Logs should show: "Insufficient balance"
4. No new orders on Kraken
5. No new rows in trades table

## Verification Checklist

- [ ] Deposit increases trader_state.balance ✓
- [ ] Deposit creates record in withdrawal_requests ✓
- [ ] Bot activates when swarm_active = true ✓
- [ ] AI Council evaluates every ~30 seconds ✓
- [ ] When approved, Kraken order is placed ✓
- [ ] Order appears in Kraken account ✓
- [ ] Order is REAL (check Kraken balance) ✓
- [ ] Balance is deducted after trade ✓
- [ ] Trade record created in trades table ✓
- [ ] When balance < trade amount, no trade ✓

## Troubleshooting

### No trades happening
Check:
- [ ] KRAKEN_ENABLE_TRADING=true
- [ ] TRADING_MODE is "paper" or "live"
- [ ] swarm_active = true in trader_state
- [ ] balance >= MAX_NOTIONAL_PER_ORDER_USD
- [ ] Kraken API keys are correct
- [ ] Backend is running

### Trades not appearing in Kraken
Check:
- [ ] Kraken API key has "Create & Modify Orders" permission
- [ ] Backend logs show successful order submission
- [ ] Check Kraken Orders page, not just Trades
- [ ] Order might be pending (check Open Orders)

### Balance not updating
Check:
- [ ] Supabase connection working (check logs)
- [ ] No errors in deposit/trade logs
- [ ] Refresh Supabase table view
- [ ] Check updated_at timestamp

## Safety Notes

🚨 **IMPORTANT SAFETY MEASURES:**

1. **START SMALL**: Use $1 trades initially
2. **USE PAPER TRADING FIRST**: Set TRADING_MODE=paper
3. **LIMIT DAILY TRADES**: Keep MAX_ORDERS_PER_DAY low (e.g., 5-20)
4. **MONITOR CLOSELY**: Watch logs and Kraken account
5. **TEST DEPOSIT/WITHDRAW**: Verify you can get money out
6. **CHECK KRAKEN FEES**: Each trade incurs Kraken fees

## Expected Results Summary

✅ **DEPOSIT**: Money appears in trader_state.balance immediately  
✅ **TRADING**: Bot places real orders on Kraken when approved  
✅ **DEDUCTION**: Balance decreases by exact trade amount  
✅ **TRACKING**: All transactions recorded in database  
✅ **PROTECTION**: Trading stops when balance insufficient  

## Code Locations for Reference

- **Deposit API**: `main.py` lines 1833-1915
- **Trading Logic**: `main.py` lines 777-892 (_kraken_trade_one_pair)
- **Balance Check**: `main.py` lines 683-698 (_get_trader_state_balance)
- **Balance Update**: `main.py` lines 700-724 (_update_trader_state_balance)
- **Bot Loop**: `main.py` lines 894-938 (UserBot.run)
- **Frontend Deposit**: `src/pages/Withdraw.tsx` lines 85-156

## Support

If you encounter issues:
1. Check backend logs for error messages
2. Verify all environment variables are set
3. Check Supabase table structure matches schema
4. Ensure Kraken API keys have correct permissions
5. Review this guide's troubleshooting section
