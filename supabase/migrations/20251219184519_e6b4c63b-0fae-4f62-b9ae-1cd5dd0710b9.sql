-- Create positions table to track open crypto positions
CREATE TABLE public.positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  pair TEXT NOT NULL,
  side TEXT NOT NULL DEFAULT 'long',
  quantity NUMERIC NOT NULL,
  entry_price NUMERIC NOT NULL,
  current_price NUMERIC,
  unrealized_pnl NUMERIC DEFAULT 0,
  unrealized_pnl_percent NUMERIC DEFAULT 0,
  take_profit_percent NUMERIC DEFAULT 10,
  stop_loss_percent NUMERIC DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'open',
  entry_txid TEXT,
  exit_txid TEXT,
  exit_price NUMERIC,
  realized_pnl NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  closed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own positions" 
ON public.positions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own positions" 
ON public.positions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own positions" 
ON public.positions 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX idx_positions_user_status ON public.positions(user_id, status);
CREATE INDEX idx_positions_symbol ON public.positions(symbol);

-- Add realtime support
ALTER PUBLICATION supabase_realtime ADD TABLE public.positions;