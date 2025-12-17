-- Store per-user exchange credentials for Edge Functions (service role only).
-- NOTE: This is sensitive. RLS is enabled with NO user policies. Only service role can read/write.

CREATE TABLE IF NOT EXISTS public.user_exchange_keys (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  alpaca_api_key text,
  alpaca_secret text,
  alpaca_paper boolean DEFAULT true,
  kraken_key text,
  kraken_secret text,
  plaid_client_id text,
  plaid_secret text,
  plaid_env text DEFAULT 'production',
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.user_exchange_keys ENABLE ROW LEVEL SECURITY;

-- No RLS policies on purpose; Edge Functions use SUPABASE_SERVICE_ROLE_KEY.

