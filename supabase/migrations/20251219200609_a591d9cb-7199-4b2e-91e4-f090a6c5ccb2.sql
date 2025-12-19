-- Add take-profit and stop-loss percentage settings to user_exchange_keys
ALTER TABLE public.user_exchange_keys
ADD COLUMN IF NOT EXISTS default_take_profit_percent numeric DEFAULT 10,
ADD COLUMN IF NOT EXISTS default_stop_loss_percent numeric DEFAULT 5;