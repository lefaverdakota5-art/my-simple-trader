-- Create user_bot_daily_stats table for tracking daily order limits
CREATE TABLE IF NOT EXISTS public.user_bot_daily_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  orders_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, day)
);

-- Enable RLS
ALTER TABLE public.user_bot_daily_stats ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own stats" ON public.user_bot_daily_stats FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own stats" ON public.user_bot_daily_stats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own stats" ON public.user_bot_daily_stats FOR UPDATE USING (auth.uid() = user_id);