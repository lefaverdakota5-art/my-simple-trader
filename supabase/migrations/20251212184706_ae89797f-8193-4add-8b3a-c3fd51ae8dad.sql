-- Create trader_state table to store balance, profit, and swarm status
CREATE TABLE public.trader_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  balance DECIMAL(15,2) NOT NULL DEFAULT 0,
  todays_profit DECIMAL(15,2) NOT NULL DEFAULT 0,
  swarm_active BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Create trades table for trade history
CREATE TABLE public.trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create withdrawal_requests table
CREATE TABLE public.withdrawal_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.trader_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies for trader_state
CREATE POLICY "Users can view their own state" ON public.trader_state FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own state" ON public.trader_state FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own state" ON public.trader_state FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS policies for trades
CREATE POLICY "Users can view their own trades" ON public.trades FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own trades" ON public.trades FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS policies for withdrawal_requests
CREATE POLICY "Users can view their own withdrawals" ON public.withdrawal_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own withdrawals" ON public.withdrawal_requests FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Enable realtime for trader_state and trades
ALTER PUBLICATION supabase_realtime ADD TABLE public.trader_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;

-- Create function to update trader state from webhook (bypasses RLS for external bots)
CREATE OR REPLACE FUNCTION public.update_trader_state_from_webhook(
  p_user_id UUID,
  p_balance DECIMAL,
  p_profit DECIMAL,
  p_trade_message TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Upsert trader state
  INSERT INTO public.trader_state (user_id, balance, todays_profit, updated_at)
  VALUES (p_user_id, p_balance, p_profit, now())
  ON CONFLICT (user_id)
  DO UPDATE SET 
    balance = p_balance,
    todays_profit = p_profit,
    updated_at = now();
  
  -- Insert trade if message provided
  IF p_trade_message IS NOT NULL AND p_trade_message != '' THEN
    INSERT INTO public.trades (user_id, message)
    VALUES (p_user_id, p_trade_message);
  END IF;
END;
$$;