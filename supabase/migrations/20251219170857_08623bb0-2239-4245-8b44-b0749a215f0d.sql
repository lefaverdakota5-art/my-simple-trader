-- Create plaid_items table to store connected bank items
CREATE TABLE IF NOT EXISTS public.plaid_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  item_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  institution_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Create plaid_accounts table to store bank accounts
CREATE TABLE IF NOT EXISTS public.plaid_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  item_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  name TEXT,
  mask TEXT,
  type TEXT,
  subtype TEXT,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, account_id)
);

-- Create user_exchange_keys table if not exists (for storing API keys)
CREATE TABLE IF NOT EXISTS public.user_exchange_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  alpaca_api_key TEXT,
  alpaca_secret TEXT,
  alpaca_paper BOOLEAN DEFAULT true,
  kraken_key TEXT,
  kraken_secret TEXT,
  plaid_client_id TEXT,
  plaid_secret TEXT,
  plaid_env TEXT DEFAULT 'production',
  openai_api_key TEXT,
  openai_model TEXT DEFAULT 'gpt-4o-mini',
  openai_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.plaid_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plaid_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_exchange_keys ENABLE ROW LEVEL SECURITY;

-- RLS policies for plaid_items
CREATE POLICY "Users can view their own plaid items" ON public.plaid_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own plaid items" ON public.plaid_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own plaid items" ON public.plaid_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own plaid items" ON public.plaid_items FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for plaid_accounts
CREATE POLICY "Users can view their own plaid accounts" ON public.plaid_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own plaid accounts" ON public.plaid_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own plaid accounts" ON public.plaid_accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own plaid accounts" ON public.plaid_accounts FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for user_exchange_keys (service role only for security - keys accessed via edge functions)
CREATE POLICY "Users can view their own keys" ON public.user_exchange_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own keys" ON public.user_exchange_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own keys" ON public.user_exchange_keys FOR UPDATE USING (auth.uid() = user_id);