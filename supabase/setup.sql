-- ============================================================================
-- AI TRADER - COMPLETE SUPABASE DATABASE SETUP
-- ============================================================================
-- Run this SQL in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- This creates all tables, functions, policies, and triggers needed for the app.
--
-- Prerequisites:
--   1. Create a Supabase project at https://supabase.com
--   2. Enable Email auth in Authentication → Providers
--   3. Create your user account via the app login page
--   4. Run this SQL script in the SQL Editor
--
-- After running this script:
--   1. Deploy edge functions (see supabase/functions/)
--   2. Set environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
--   3. Configure your Kraken API keys in the app Settings page
-- ============================================================================

-- ============================================================================
-- 1. CORE TABLES
-- ============================================================================

-- Trader state (balance, profit, AI council status)
CREATE TABLE IF NOT EXISTS public.trader_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  balance DECIMAL(15,2) NOT NULL DEFAULT 0,
  todays_profit DECIMAL(15,2) NOT NULL DEFAULT 0,
  swarm_active BOOLEAN NOT NULL DEFAULT false,
  portfolio_value NUMERIC DEFAULT 0,
  progress_percent NUMERIC DEFAULT 0,
  win_rate NUMERIC DEFAULT 0,
  council_votes TEXT DEFAULT '',
  council_reasons TEXT[] DEFAULT '{}',
  autonomy_mode BOOLEAN DEFAULT false,
  withdraw_status TEXT DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Trade history log
CREATE TABLE IF NOT EXISTS public.trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Withdrawal/deposit requests
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  withdraw_type TEXT DEFAULT 'bank',
  bank_name TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. USER ROLES & AUTH
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- ============================================================================
-- 3. EXCHANGE KEYS & SETTINGS (service-role only access)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_exchange_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  -- Kraken
  kraken_key TEXT,
  kraken_secret TEXT,
  kraken_withdraw_key TEXT,
  -- Alpaca
  alpaca_api_key TEXT,
  alpaca_secret TEXT,
  alpaca_paper BOOLEAN DEFAULT true,
  -- Plaid
  plaid_client_id TEXT,
  plaid_secret TEXT,
  plaid_env TEXT DEFAULT 'production',
  -- OpenAI
  openai_api_key TEXT,
  openai_model TEXT DEFAULT 'gpt-4o-mini',
  openai_enabled BOOLEAN DEFAULT false,
  -- Risk management defaults
  default_take_profit_percent NUMERIC DEFAULT 10,
  default_stop_loss_percent NUMERIC DEFAULT 5,
  trailing_stop_percent NUMERIC,
  max_position_percent NUMERIC DEFAULT 10,
  -- Bank info
  chime_routing_number TEXT,
  chime_account_number TEXT,
  chime_account_name TEXT DEFAULT 'Chime Spending',
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================================================
-- 4. PLAID INTEGRATION (Bank linking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.plaid_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  item_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  institution_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plaid_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  item_id TEXT NOT NULL,
  account_id TEXT NOT NULL UNIQUE,
  name TEXT,
  mask TEXT,
  type TEXT,
  subtype TEXT,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================================================
-- 5. POSITIONS TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  symbol TEXT NOT NULL,
  pair TEXT NOT NULL,
  side TEXT NOT NULL DEFAULT 'long',
  quantity NUMERIC NOT NULL,
  entry_price NUMERIC NOT NULL,
  current_price NUMERIC,
  exit_price NUMERIC,
  entry_txid TEXT,
  exit_txid TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  realized_pnl NUMERIC,
  unrealized_pnl NUMERIC,
  unrealized_pnl_percent NUMERIC,
  take_profit_percent NUMERIC DEFAULT 10,
  stop_loss_percent NUMERIC DEFAULT 5,
  trailing_stop_enabled BOOLEAN DEFAULT false,
  trailing_stop_price NUMERIC,
  high_water_mark NUMERIC,
  closed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================================================
-- 6. BOT CONFIGURATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.bot_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  kill_switch BOOLEAN DEFAULT false,
  mode TEXT DEFAULT 'paused' CHECK (mode IN ('aggressive_a', 'paused', 'sell_to_target_usd')),
  trade_size_pct NUMERIC DEFAULT 2 CHECK (trade_size_pct >= 0.1 AND trade_size_pct <= 100),
  max_orders_per_tick INTEGER DEFAULT 2 CHECK (max_orders_per_tick >= 1 AND max_orders_per_tick <= 10),
  take_profit_pct NUMERIC DEFAULT 0.5 CHECK (take_profit_pct >= 0.1 AND take_profit_pct <= 100),
  stop_loss_pct NUMERIC DEFAULT 1 CHECK (stop_loss_pct >= 0.1 AND stop_loss_pct <= 100),
  cooldown_seconds INTEGER DEFAULT 60 CHECK (cooldown_seconds >= 10 AND cooldown_seconds <= 3600),
  max_daily_loss_pct NUMERIC DEFAULT 10 CHECK (max_daily_loss_pct >= 1 AND max_daily_loss_pct <= 100),
  max_exposure_per_asset_pct NUMERIC DEFAULT 25 CHECK (max_exposure_per_asset_pct >= 1 AND max_exposure_per_asset_pct <= 100),
  keep_usd_reserve NUMERIC DEFAULT 0.01,
  sell_target_usd NUMERIC DEFAULT 0,
  pairs TEXT[] DEFAULT ARRAY['XBT/USD', 'ETH/USD', 'DOGE/USD'],
  voting_enabled BOOLEAN DEFAULT true,
  auto_approve_enabled BOOLEAN DEFAULT false,
  dry_run BOOLEAN DEFAULT true,
  max_notional_per_order_usd NUMERIC DEFAULT 100,
  max_open_orders INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 7. BALANCE SNAPSHOTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.balances_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  total_usd NUMERIC DEFAULT 0,
  available_usd NUMERIC DEFAULT 0,
  reserved_usd NUMERIC DEFAULT 0,
  holdings JSONB DEFAULT '{}',
  open_orders_count INTEGER DEFAULT 0,
  snapshot_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_balances_snapshot_user_time ON public.balances_snapshot(user_id, snapshot_at DESC);

-- ============================================================================
-- 8. TRADING ORDERS & FILLS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trading_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  kraken_txid TEXT,
  intent_id TEXT,
  pair TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  order_type TEXT DEFAULT 'market' CHECK (order_type IN ('market', 'limit')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'open', 'filled', 'cancelled', 'rejected')),
  volume NUMERIC NOT NULL,
  price NUMERIC,
  cost_usd NUMERIC,
  fee_usd NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ,
  reject_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_trading_orders_user ON public.trading_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trading_orders_intent ON public.trading_orders(intent_id);

CREATE TABLE IF NOT EXISTS public.trading_fills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  order_id UUID REFERENCES public.trading_orders(id),
  kraken_txid TEXT,
  pair TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  volume NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  cost_usd NUMERIC NOT NULL,
  fee_usd NUMERIC DEFAULT 0,
  realized_pnl NUMERIC,
  filled_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trading_fills_user ON public.trading_fills(user_id, filled_at DESC);

-- ============================================================================
-- 9. PAIR RULES (Kraken trading pair metadata)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pair_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair TEXT NOT NULL UNIQUE,
  kraken_pair TEXT NOT NULL,
  base_asset TEXT NOT NULL,
  quote_asset TEXT DEFAULT 'USD',
  ordermin NUMERIC DEFAULT 0,
  costmin NUMERIC DEFAULT 0,
  lot_decimals INTEGER DEFAULT 8,
  pair_decimals INTEGER DEFAULT 2,
  tick_size NUMERIC DEFAULT 0.01,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.pair_rules (pair, kraken_pair, base_asset, ordermin, costmin, lot_decimals, pair_decimals) VALUES
  ('XBT/USD', 'XXBTZUSD', 'XBT', 0.0001, 5, 8, 1),
  ('ETH/USD', 'XETHZUSD', 'ETH', 0.001, 5, 8, 2),
  ('DOGE/USD', 'XDGUSD', 'DOGE', 10, 5, 0, 5),
  ('SOL/USD', 'SOLUSD', 'SOL', 0.02, 5, 8, 2),
  ('ADA/USD', 'ADAUSD', 'ADA', 5, 5, 8, 6),
  ('XRP/USD', 'XXRPZUSD', 'XRP', 5, 5, 8, 5),
  ('DOT/USD', 'DOTUSD', 'DOT', 0.5, 5, 8, 4),
  ('AVAX/USD', 'AVAXUSD', 'AVAX', 0.1, 5, 8, 4),
  ('MATIC/USD', 'MATICUSD', 'MATIC', 5, 5, 8, 5),
  ('LINK/USD', 'LINKUSD', 'LINK', 0.3, 5, 8, 4)
ON CONFLICT (pair) DO NOTHING;

-- ============================================================================
-- 10. FEE CACHE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fee_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  maker_fee NUMERIC DEFAULT 0.16,
  taker_fee NUMERIC DEFAULT 0.26,
  volume_30d NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 11. CASHOUT PLANS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.cashout_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  pull_amount_usd NUMERIC NOT NULL,
  keep_for_bots_usd NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'selling', 'ready', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- ============================================================================
-- 12. SYSTEM HEALTH MONITORING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.system_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  executor_online BOOLEAN DEFAULT false,
  last_tick_at TIMESTAMPTZ,
  last_exec_at TIMESTAMPTZ,
  last_balance_sync_at TIMESTAMPTZ,
  kraken_error_count_15m INTEGER DEFAULT 0,
  last_error TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 13. DAILY BOT STATS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_bot_daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  orders_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, day)
);

-- ============================================================================
-- 14. TRADING SCHEMA (Intent-based trading with voting)
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS trading;

CREATE TABLE IF NOT EXISTS trading.trade_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  order_type TEXT NOT NULL DEFAULT 'market' CHECK (order_type IN ('market', 'limit')),
  quantity NUMERIC,
  notional_usd NUMERIC,
  limit_price NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'executing', 'executed', 'failed', 'cancelled')),
  approve_threshold INTEGER NOT NULL DEFAULT 1,
  approve_votes INTEGER NOT NULL DEFAULT 0,
  deny_votes INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT 'user' CHECK (created_by IN ('user', 'bot', 'system')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS trading.trade_intent_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id UUID NOT NULL REFERENCES trading.trade_intents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('approve', 'deny')),
  confidence NUMERIC,
  rationale TEXT,
  voter_type TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(intent_id, user_id)
);

-- ============================================================================
-- 15. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.trader_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balances_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_fills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pair_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashout_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_bot_daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading.trade_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading.trade_intent_votes ENABLE ROW LEVEL SECURITY;

-- trader_state policies
CREATE POLICY "Users can view their own state" ON public.trader_state FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own state" ON public.trader_state FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own state" ON public.trader_state FOR INSERT WITH CHECK (auth.uid() = user_id);

-- trades policies
CREATE POLICY "Users can view their own trades" ON public.trades FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own trades" ON public.trades FOR INSERT WITH CHECK (auth.uid() = user_id);

-- withdrawal_requests policies
CREATE POLICY "Users can view their own withdrawals" ON public.withdrawal_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own withdrawals" ON public.withdrawal_requests FOR INSERT WITH CHECK (auth.uid() = user_id);

-- user_roles policies
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert roles" ON public.user_roles FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- positions policies
CREATE POLICY "Users can view their own positions" ON public.positions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own positions" ON public.positions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own positions" ON public.positions FOR UPDATE USING (auth.uid() = user_id);

-- bot_config policies
CREATE POLICY "Users can view their own bot config" ON public.bot_config FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own bot config" ON public.bot_config FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own bot config" ON public.bot_config FOR UPDATE USING (auth.uid() = user_id);

-- balances_snapshot policies
CREATE POLICY "Users can view their own balance snapshots" ON public.balances_snapshot FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own balance snapshots" ON public.balances_snapshot FOR INSERT WITH CHECK (auth.uid() = user_id);

-- trading_orders policies
CREATE POLICY "Users can view their own orders" ON public.trading_orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own orders" ON public.trading_orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own orders" ON public.trading_orders FOR UPDATE USING (auth.uid() = user_id);

-- trading_fills policies
CREATE POLICY "Users can view their own fills" ON public.trading_fills FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own fills" ON public.trading_fills FOR INSERT WITH CHECK (auth.uid() = user_id);

-- pair_rules policies (public read)
CREATE POLICY "Anyone can read pair rules" ON public.pair_rules FOR SELECT USING (true);

-- fee_cache policies
CREATE POLICY "Users can view their own fee cache" ON public.fee_cache FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own fee cache" ON public.fee_cache FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own fee cache" ON public.fee_cache FOR UPDATE USING (auth.uid() = user_id);

-- cashout_plans policies
CREATE POLICY "Users can view their own cashout plans" ON public.cashout_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own cashout plans" ON public.cashout_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own cashout plans" ON public.cashout_plans FOR UPDATE USING (auth.uid() = user_id);

-- system_health policies
CREATE POLICY "Users can view their own system health" ON public.system_health FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own system health" ON public.system_health FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own system health" ON public.system_health FOR UPDATE USING (auth.uid() = user_id);

-- trade_intents policies
CREATE POLICY "Users can view their own intents" ON trading.trade_intents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own intents" ON trading.trade_intents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own intents" ON trading.trade_intents FOR UPDATE USING (auth.uid() = user_id);

-- trade_intent_votes policies
CREATE POLICY "Users can view votes on their intents" ON trading.trade_intent_votes FOR SELECT
  USING (EXISTS (SELECT 1 FROM trading.trade_intents WHERE id = intent_id AND user_id = auth.uid()));
CREATE POLICY "Users can vote on their own intents" ON trading.trade_intent_votes FOR INSERT
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM trading.trade_intents WHERE id = intent_id AND trading.trade_intents.user_id = auth.uid()));

-- ============================================================================
-- 16. REALTIME SUBSCRIPTIONS
-- ============================================================================

ALTER TABLE public.trader_state REPLICA IDENTITY FULL;
ALTER TABLE public.trading_fills REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.trader_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trading_fills;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trading_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE trading.trade_intents;

-- ============================================================================
-- 17. FUNCTIONS
-- ============================================================================

-- Webhook function for updating trader state from bots
CREATE OR REPLACE FUNCTION public.update_trader_state_from_webhook(
  p_user_id UUID,
  p_balance NUMERIC DEFAULT NULL,
  p_profit NUMERIC DEFAULT NULL,
  p_trade_message TEXT DEFAULT NULL,
  p_portfolio_value NUMERIC DEFAULT NULL,
  p_progress_percent NUMERIC DEFAULT NULL,
  p_win_rate NUMERIC DEFAULT NULL,
  p_council_votes TEXT DEFAULT NULL,
  p_council_reasons TEXT[] DEFAULT NULL,
  p_withdraw_status TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.trader_state (
    user_id, balance, todays_profit, portfolio_value, progress_percent,
    win_rate, council_votes, council_reasons, withdraw_status, updated_at
  )
  VALUES (
    p_user_id, COALESCE(p_balance, 0), COALESCE(p_profit, 0),
    COALESCE(p_portfolio_value, 0), COALESCE(p_progress_percent, 0),
    COALESCE(p_win_rate, 0), COALESCE(p_council_votes, ''),
    COALESCE(p_council_reasons, '{}'), COALESCE(p_withdraw_status, ''), now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    balance = COALESCE(p_balance, trader_state.balance),
    todays_profit = COALESCE(p_profit, trader_state.todays_profit),
    portfolio_value = COALESCE(p_portfolio_value, trader_state.portfolio_value),
    progress_percent = COALESCE(p_progress_percent, trader_state.progress_percent),
    win_rate = COALESCE(p_win_rate, trader_state.win_rate),
    council_votes = COALESCE(p_council_votes, trader_state.council_votes),
    council_reasons = COALESCE(p_council_reasons, trader_state.council_reasons),
    withdraw_status = COALESCE(p_withdraw_status, trader_state.withdraw_status),
    updated_at = now();

  IF p_trade_message IS NOT NULL AND p_trade_message != '' THEN
    INSERT INTO public.trades (user_id, message)
    VALUES (p_user_id, p_trade_message);
  END IF;
END;
$$;

-- Portfolio snapshot function
CREATE OR REPLACE FUNCTION public.get_portfolio_snapshot(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  v_balance RECORD;
  v_config RECORD;
  v_health RECORD;
  v_orders JSON;
  v_fills JSON;
BEGIN
  SELECT * INTO v_balance FROM balances_snapshot
  WHERE user_id = p_user_id ORDER BY snapshot_at DESC LIMIT 1;

  SELECT * INTO v_config FROM bot_config WHERE user_id = p_user_id;

  SELECT * INTO v_health FROM system_health WHERE user_id = p_user_id;

  SELECT COALESCE(json_agg(row_to_json(o)), '[]'::json) INTO v_orders
  FROM (
    SELECT id, pair, side, order_type, status, volume, price, cost_usd, created_at
    FROM trading_orders
    WHERE user_id = p_user_id AND status IN ('pending', 'open')
    ORDER BY created_at DESC LIMIT 20
  ) o;

  SELECT COALESCE(json_agg(row_to_json(f)), '[]'::json) INTO v_fills
  FROM (
    SELECT id, pair, side, volume, price, cost_usd, fee_usd, realized_pnl, filled_at
    FROM trading_fills
    WHERE user_id = p_user_id
    ORDER BY filled_at DESC LIMIT 25
  ) f;

  result := json_build_object(
    'balance', json_build_object(
      'total_usd', COALESCE(v_balance.total_usd, 0),
      'available_usd', COALESCE(v_balance.available_usd, 0),
      'reserved_usd', COALESCE(v_balance.reserved_usd, 0),
      'holdings', COALESCE(v_balance.holdings, '{}'::jsonb),
      'open_orders_count', COALESCE(v_balance.open_orders_count, 0),
      'snapshot_at', v_balance.snapshot_at
    ),
    'bot', json_build_object(
      'kill_switch', COALESCE(v_config.kill_switch, true),
      'mode', COALESCE(v_config.mode, 'paused'),
      'trade_size_pct', COALESCE(v_config.trade_size_pct, 2),
      'max_orders_per_tick', COALESCE(v_config.max_orders_per_tick, 2),
      'take_profit_pct', COALESCE(v_config.take_profit_pct, 0.5),
      'stop_loss_pct', COALESCE(v_config.stop_loss_pct, 1),
      'keep_usd_reserve', COALESCE(v_config.keep_usd_reserve, 0.01),
      'sell_target_usd', COALESCE(v_config.sell_target_usd, 0),
      'pairs', COALESCE(v_config.pairs, ARRAY['XBT/USD', 'ETH/USD']),
      'updated_at', v_config.updated_at
    ),
    'health', json_build_object(
      'executor_online', COALESCE(v_health.executor_online, false),
      'last_tick_at', v_health.last_tick_at,
      'last_exec_at', v_health.last_exec_at,
      'last_balance_sync_at', v_health.last_balance_sync_at,
      'kraken_error_count_15m', COALESCE(v_health.kraken_error_count_15m, 0),
      'last_error', v_health.last_error
    ),
    'open_orders', v_orders,
    'recent_fills', v_fills
  );

  RETURN result;
END;
$$;

-- ============================================================================
-- 18. TRIGGERS (Intent voting auto-approval)
-- ============================================================================

CREATE OR REPLACE FUNCTION trading.update_intent_votes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = trading, public
AS $$
BEGIN
  UPDATE trading.trade_intents SET
    approve_votes = (SELECT COUNT(*) FROM trading.trade_intent_votes WHERE intent_id = NEW.intent_id AND vote = 'approve'),
    deny_votes = (SELECT COUNT(*) FROM trading.trade_intent_votes WHERE intent_id = NEW.intent_id AND vote = 'deny'),
    updated_at = now()
  WHERE id = NEW.intent_id;

  UPDATE trading.trade_intents
  SET status = 'approved', updated_at = now()
  WHERE id = NEW.intent_id AND status = 'pending' AND approve_votes >= approve_threshold;

  UPDATE trading.trade_intents
  SET status = 'denied', updated_at = now()
  WHERE id = NEW.intent_id AND status = 'pending' AND deny_votes > approve_threshold;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_intent_votes ON trading.trade_intent_votes;
CREATE TRIGGER trigger_update_intent_votes
  AFTER INSERT OR UPDATE ON trading.trade_intent_votes
  FOR EACH ROW EXECUTE FUNCTION trading.update_intent_votes();

CREATE OR REPLACE FUNCTION trading.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = trading, public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_intents_updated_at ON trading.trade_intents;
CREATE TRIGGER trigger_intents_updated_at
  BEFORE UPDATE ON trading.trade_intents
  FOR EACH ROW EXECUTE FUNCTION trading.update_updated_at();

-- ============================================================================
-- SETUP COMPLETE!
-- ============================================================================
-- Next steps:
--   1. Deploy Supabase Edge Functions:
--      supabase functions deploy bot-actions
--      supabase functions deploy bot-tick
--      supabase functions deploy kraken-withdraw
--      supabase functions deploy execute-intents
--      supabase functions deploy push-update
--      supabase functions deploy plaid
--
--   2. Set edge function secrets:
--      supabase secrets set SUPABASE_URL=your_url
--      supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_key
--
--   3. Configure the app:
--      - Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env
--      - Login to the app and add your Kraken API keys in Settings
--      - Add your Kraken withdrawal key name in Settings
--      - Configure bot settings (pairs, risk parameters)
--
--   4. Build the APK:
--      npm run build && npx cap sync android
--      cd android && ./gradlew assembleDebug
-- ============================================================================
