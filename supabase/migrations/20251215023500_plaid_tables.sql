-- Plaid tables (store access tokens server-side only)
-- NOTE: RLS is enabled with no user policies. Access should be via service role (edge function).

CREATE TABLE IF NOT EXISTS public.plaid_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  item_id text NOT NULL,
  access_token text NOT NULL,
  institution_name text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id),
  UNIQUE (item_id)
);

CREATE TABLE IF NOT EXISTS public.plaid_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  item_id text NOT NULL,
  account_id text NOT NULL,
  name text DEFAULT '',
  mask text DEFAULT '',
  type text DEFAULT '',
  subtype text DEFAULT '',
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, account_id)
);

ALTER TABLE public.plaid_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plaid_accounts ENABLE ROW LEVEL SECURITY;

-- No RLS policies on purpose.
-- Edge functions should use SUPABASE_SERVICE_ROLE_KEY to read/write.

