-- Per-user daily order limiter for scheduled bot ticks.
-- RLS enabled with NO user policies (service role only).

CREATE TABLE IF NOT EXISTS public.user_bot_daily_stats (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  day date NOT NULL,
  orders_count integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

ALTER TABLE public.user_bot_daily_stats ENABLE ROW LEVEL SECURITY;

