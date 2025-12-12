-- Add missing columns to trader_state for full webhook support
ALTER TABLE public.trader_state 
ADD COLUMN IF NOT EXISTS portfolio_value numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS progress_percent numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS win_rate numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS council_votes text DEFAULT '',
ADD COLUMN IF NOT EXISTS council_reasons text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS autonomy_mode boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS withdraw_status text DEFAULT '';

-- Add bank account info to withdrawal_requests for Chime support
ALTER TABLE public.withdrawal_requests 
ADD COLUMN IF NOT EXISTS withdraw_type text DEFAULT 'bank',
ADD COLUMN IF NOT EXISTS bank_name text DEFAULT '';

-- Update the webhook function to handle all fields
CREATE OR REPLACE FUNCTION public.update_trader_state_from_webhook(
  p_user_id uuid, 
  p_balance numeric DEFAULT NULL,
  p_profit numeric DEFAULT NULL,
  p_trade_message text DEFAULT NULL,
  p_portfolio_value numeric DEFAULT NULL,
  p_progress_percent numeric DEFAULT NULL,
  p_win_rate numeric DEFAULT NULL,
  p_council_votes text DEFAULT NULL,
  p_council_reasons text[] DEFAULT NULL,
  p_withdraw_status text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Upsert trader state with all fields
  INSERT INTO public.trader_state (
    user_id, 
    balance, 
    todays_profit, 
    portfolio_value,
    progress_percent,
    win_rate,
    council_votes,
    council_reasons,
    withdraw_status,
    updated_at
  )
  VALUES (
    p_user_id, 
    COALESCE(p_balance, 0), 
    COALESCE(p_profit, 0),
    COALESCE(p_portfolio_value, 0),
    COALESCE(p_progress_percent, 0),
    COALESCE(p_win_rate, 0),
    COALESCE(p_council_votes, ''),
    COALESCE(p_council_reasons, '{}'),
    COALESCE(p_withdraw_status, ''),
    now()
  )
  ON CONFLICT (user_id)
  DO UPDATE SET 
    balance = COALESCE(p_balance, trader_state.balance),
    todays_profit = COALESCE(p_profit, trader_state.todays_profit),
    portfolio_value = COALESCE(p_portfolio_value, trader_state.portfolio_value),
    progress_percent = COALESCE(p_progress_percent, trader_state.progress_percent),
    win_rate = COALESCE(p_win_rate, trader_state.win_rate),
    council_votes = COALESCE(p_council_votes, trader_state.council_votes),
    council_reasons = COALESCE(p_council_reasons, trader_state.council_reasons),
    withdraw_status = COALESCE(p_withdraw_status, trader_state.withdraw_status),
    updated_at = now();
  
  -- Insert trade if message provided
  IF p_trade_message IS NOT NULL AND p_trade_message != '' THEN
    INSERT INTO public.trades (user_id, message)
    VALUES (p_user_id, p_trade_message);
  END IF;
END;
$$;

-- Enable realtime for trader_state updates
ALTER TABLE public.trader_state REPLICA IDENTITY FULL;

-- Add unique constraint on user_id if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'trader_state_user_id_key'
  ) THEN
    ALTER TABLE public.trader_state ADD CONSTRAINT trader_state_user_id_key UNIQUE (user_id);
  END IF;
END $$;