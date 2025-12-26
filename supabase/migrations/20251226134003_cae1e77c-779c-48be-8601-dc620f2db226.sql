-- Create trading schema if not exists
CREATE SCHEMA IF NOT EXISTS trading;

-- Create trade_intents table for intent-based trading
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

-- Create trade_intent_votes table
CREATE TABLE IF NOT EXISTS trading.trade_intent_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id UUID NOT NULL REFERENCES trading.trade_intents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('approve', 'deny')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(intent_id, user_id)
);

-- Add new columns to bot_config if they don't exist
ALTER TABLE public.bot_config 
  ADD COLUMN IF NOT EXISTS voting_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_approve_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS dry_run BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_notional_per_order_usd NUMERIC DEFAULT 100,
  ADD COLUMN IF NOT EXISTS max_open_orders INTEGER DEFAULT 5;

-- Enable RLS on trading tables
ALTER TABLE trading.trade_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading.trade_intent_votes ENABLE ROW LEVEL SECURITY;

-- RLS policies for trade_intents
CREATE POLICY "Users can view their own intents"
  ON trading.trade_intents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own intents"
  ON trading.trade_intents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own intents"
  ON trading.trade_intents FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS policies for trade_intent_votes
CREATE POLICY "Users can view votes on their intents"
  ON trading.trade_intent_votes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trading.trade_intents 
      WHERE id = intent_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can vote on their own intents"
  ON trading.trade_intent_votes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM trading.trade_intents 
      WHERE id = intent_id AND trading.trade_intents.user_id = auth.uid()
    )
  );

-- Function to update vote counts and auto-approve
CREATE OR REPLACE FUNCTION trading.update_intent_votes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = trading, public
AS $$
BEGIN
  -- Update vote counts on the intent
  UPDATE trading.trade_intents
  SET 
    approve_votes = (
      SELECT COUNT(*) FROM trading.trade_intent_votes 
      WHERE intent_id = NEW.intent_id AND vote = 'approve'
    ),
    deny_votes = (
      SELECT COUNT(*) FROM trading.trade_intent_votes 
      WHERE intent_id = NEW.intent_id AND vote = 'deny'
    ),
    updated_at = now()
  WHERE id = NEW.intent_id;
  
  -- Auto-approve if threshold met
  UPDATE trading.trade_intents
  SET status = 'approved', updated_at = now()
  WHERE id = NEW.intent_id 
    AND status = 'pending'
    AND approve_votes >= approve_threshold;
  
  -- Auto-deny if deny votes exceed approve threshold
  UPDATE trading.trade_intents
  SET status = 'denied', updated_at = now()
  WHERE id = NEW.intent_id 
    AND status = 'pending'
    AND deny_votes > approve_threshold;
  
  RETURN NEW;
END;
$$;

-- Trigger for vote updates
DROP TRIGGER IF EXISTS trigger_update_intent_votes ON trading.trade_intent_votes;
CREATE TRIGGER trigger_update_intent_votes
  AFTER INSERT OR UPDATE ON trading.trade_intent_votes
  FOR EACH ROW
  EXECUTE FUNCTION trading.update_intent_votes();

-- Function to update updated_at timestamp
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

-- Trigger for updated_at on trade_intents
DROP TRIGGER IF EXISTS trigger_intents_updated_at ON trading.trade_intents;
CREATE TRIGGER trigger_intents_updated_at
  BEFORE UPDATE ON trading.trade_intents
  FOR EACH ROW
  EXECUTE FUNCTION trading.update_updated_at();

-- Enable realtime for intents
ALTER PUBLICATION supabase_realtime ADD TABLE trading.trade_intents;

-- Create balances_snapshot in trading schema (mirror of public if needed)
CREATE TABLE IF NOT EXISTS trading.balances_snapshot (
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

ALTER TABLE trading.balances_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own balance snapshots"
  ON trading.balances_snapshot FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own balance snapshots"
  ON trading.balances_snapshot FOR INSERT
  WITH CHECK (auth.uid() = user_id);