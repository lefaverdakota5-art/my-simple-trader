ALTER TABLE public.user_exchange_keys
ADD COLUMN IF NOT EXISTS openai_api_key text,
ADD COLUMN IF NOT EXISTS openai_model text DEFAULT 'gpt-4o-mini',
ADD COLUMN IF NOT EXISTS openai_enabled boolean DEFAULT false;

