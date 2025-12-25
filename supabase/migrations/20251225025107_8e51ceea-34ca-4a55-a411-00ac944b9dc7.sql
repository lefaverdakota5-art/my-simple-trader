-- Allow public read access to pair_rules (reference data)
CREATE POLICY "Anyone can view pair rules" 
ON public.pair_rules 
FOR SELECT 
USING (true);

-- Enable realtime for trading_orders
ALTER PUBLICATION supabase_realtime ADD TABLE public.trading_orders;