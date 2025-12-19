-- Add trailing stop-loss columns to positions table
ALTER TABLE public.positions 
ADD COLUMN IF NOT EXISTS trailing_stop_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS high_water_mark numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS trailing_stop_price numeric DEFAULT NULL;

-- Add trailing stop setting to user_exchange_keys
ALTER TABLE public.user_exchange_keys 
ADD COLUMN IF NOT EXISTS trailing_stop_percent numeric DEFAULT 3;

-- Add comment for documentation
COMMENT ON COLUMN public.positions.high_water_mark IS 'Highest price reached since position opened';
COMMENT ON COLUMN public.positions.trailing_stop_price IS 'Dynamic stop-loss price that trails behind high_water_mark';
COMMENT ON COLUMN public.user_exchange_keys.trailing_stop_percent IS 'Percentage below high water mark to set trailing stop';