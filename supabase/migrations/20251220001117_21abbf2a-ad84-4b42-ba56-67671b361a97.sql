-- Add Chime Direct bank details columns to user_exchange_keys
ALTER TABLE public.user_exchange_keys 
ADD COLUMN IF NOT EXISTS chime_routing_number text,
ADD COLUMN IF NOT EXISTS chime_account_number text,
ADD COLUMN IF NOT EXISTS chime_account_name text DEFAULT 'Chime Spending';

COMMENT ON COLUMN public.user_exchange_keys.chime_routing_number IS 'Chime bank routing number for direct ACH transfers';
COMMENT ON COLUMN public.user_exchange_keys.chime_account_number IS 'Chime account number for direct ACH transfers';
COMMENT ON COLUMN public.user_exchange_keys.chime_account_name IS 'Display name for the Chime account';