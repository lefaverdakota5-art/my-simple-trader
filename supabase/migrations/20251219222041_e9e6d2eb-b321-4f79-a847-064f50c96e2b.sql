-- Add max position size percentage to user_exchange_keys
ALTER TABLE public.user_exchange_keys 
ADD COLUMN IF NOT EXISTS max_position_percent numeric DEFAULT 10;