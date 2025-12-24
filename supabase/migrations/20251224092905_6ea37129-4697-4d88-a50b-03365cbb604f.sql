-- ============================================================================
-- PRODUCTION TRADING SCHEMA
-- Creates tables for bot_config, balances_snapshot, orders, fills, pair_rules,
-- fee_cache, cashout_plans, and system_health
-- ============================================================================

-- Bot Configuration Table
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
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bot_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies for bot_config
CREATE POLICY "Users can view their own bot config" ON public.bot_config
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own bot config" ON public.bot_config
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own bot config" ON public.bot_config
  FOR UPDATE USING (auth.uid() = user_id);

-- Balances Snapshot Table (stores Kraken portfolio snapshots)
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

CREATE INDEX idx_balances_snapshot_user_time ON public.balances_snapshot(user_id, snapshot_at DESC);

-- Enable RLS
ALTER TABLE public.balances_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own balance snapshots" ON public.balances_snapshot
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own balance snapshots" ON public.balances_snapshot
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Trading Orders Table
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

CREATE INDEX idx_trading_orders_user ON public.trading_orders(user_id, created_at DESC);
CREATE INDEX idx_trading_orders_intent ON public.trading_orders(intent_id);
CREATE UNIQUE INDEX idx_trading_orders_kraken_txid ON public.trading_orders(kraken_txid) WHERE kraken_txid IS NOT NULL;

-- Enable RLS
ALTER TABLE public.trading_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own orders" ON public.trading_orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own orders" ON public.trading_orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own orders" ON public.trading_orders
  FOR UPDATE USING (auth.uid() = user_id);

-- Trading Fills Table (executed trades)
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

CREATE INDEX idx_trading_fills_user ON public.trading_fills(user_id, filled_at DESC);

-- Enable RLS and realtime
ALTER TABLE public.trading_fills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_fills REPLICA IDENTITY FULL;

CREATE POLICY "Users can view their own fills" ON public.trading_fills
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own fills" ON public.trading_fills
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Enable realtime for trading_fills
ALTER PUBLICATION supabase_realtime ADD TABLE public.trading_fills;

-- Pair Rules Table (min order size, decimals, etc from Kraken)
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

CREATE INDEX idx_pair_rules_pair ON public.pair_rules(pair);

-- Fee Cache Table
CREATE TABLE IF NOT EXISTS public.fee_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  maker_fee NUMERIC DEFAULT 0.16,
  taker_fee NUMERIC DEFAULT 0.26,
  volume_30d NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.fee_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own fee cache" ON public.fee_cache
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own fee cache" ON public.fee_cache
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own fee cache" ON public.fee_cache
  FOR UPDATE USING (auth.uid() = user_id);

-- Cashout Plans Table
CREATE TABLE IF NOT EXISTS public.cashout_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  pull_amount_usd NUMERIC NOT NULL,
  keep_for_bots_usd NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'selling', 'ready', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.cashout_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own cashout plans" ON public.cashout_plans
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own cashout plans" ON public.cashout_plans
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cashout plans" ON public.cashout_plans
  FOR UPDATE USING (auth.uid() = user_id);

-- System Health Table (tracks executor status, errors, etc)
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

-- Enable RLS
ALTER TABLE public.system_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own system health" ON public.system_health
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own system health" ON public.system_health
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own system health" ON public.system_health
  FOR UPDATE USING (auth.uid() = user_id);

-- Insert common pair rules
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

-- Function to get portfolio snapshot
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
  -- Get latest balance snapshot
  SELECT * INTO v_balance FROM balances_snapshot 
  WHERE user_id = p_user_id 
  ORDER BY snapshot_at DESC 
  LIMIT 1;

  -- Get bot config
  SELECT * INTO v_config FROM bot_config WHERE user_id = p_user_id;

  -- Get system health
  SELECT * INTO v_health FROM system_health WHERE user_id = p_user_id;

  -- Get open orders
  SELECT COALESCE(json_agg(row_to_json(o)), '[]'::json) INTO v_orders
  FROM (
    SELECT id, pair, side, order_type, status, volume, price, cost_usd, created_at
    FROM trading_orders
    WHERE user_id = p_user_id AND status IN ('pending', 'open')
    ORDER BY created_at DESC
    LIMIT 20
  ) o;

  -- Get recent fills
  SELECT COALESCE(json_agg(row_to_json(f)), '[]'::json) INTO v_fills
  FROM (
    SELECT id, pair, side, volume, price, cost_usd, fee_usd, realized_pnl, filled_at
    FROM trading_fills
    WHERE user_id = p_user_id
    ORDER BY filled_at DESC
    LIMIT 25
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