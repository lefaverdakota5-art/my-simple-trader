-- Add kraken withdrawal key column
ALTER TABLE public.user_exchange_keys 
ADD COLUMN IF NOT EXISTS kraken_withdraw_key text DEFAULT NULL;