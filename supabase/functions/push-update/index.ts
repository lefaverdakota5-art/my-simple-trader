import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

// Input validation helpers
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number | null = null): number | null {
  if (value === null || value === undefined) return fallback;
  const num = Number(value);
  if (isNaN(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function sanitizeString(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  return String(value).slice(0, maxLength);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
    const providedSecret = req.headers.get('x-webhook-secret');
    
    // Validate webhook secret if configured
    if (webhookSecret && webhookSecret !== providedSecret) {
      console.error('Invalid webhook secret');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    console.log('Received webhook data:', { user_id: body.user_id, timestamp: new Date().toISOString() });

    const { user_id } = body;

    // Validate user_id is present and is a valid UUID
    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'user_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isValidUUID(user_id)) {
      console.error('Invalid user_id format:', user_id);
      return new Response(
        JSON.stringify({ error: 'Invalid user_id format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user exists in auth.users before processing
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(user_id);
    if (authError || !authUser?.user) {
      console.error('User not found or auth error:', user_id, authError?.message);
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate and sanitize all numeric inputs with reasonable bounds
    const balance = clampNumber(body.balance, -1e12, 1e12);
    const today_pl = clampNumber(body.today_pl, -1e12, 1e12);
    const portfolio_value = clampNumber(body.portfolio_value, 0, 1e12);
    const progress_percent = clampNumber(body.progress_percent, 0, 100);
    const win_rate = clampNumber(body.win_rate, 0, 100);
    
    // Validate and sanitize string inputs
    const new_trade = sanitizeString(body.new_trade, 500);
    const council_votes = sanitizeString(body.council_votes, 50);
    const withdraw_status = sanitizeString(body.withdraw_status, 50);
    
    // Validate council_reasons array
    let council_reasons: string[] | null = null;
    if (Array.isArray(body.council_reasons)) {
      council_reasons = body.council_reasons
        .slice(0, 10) // Max 10 reasons
        .map((r: unknown) => String(r).slice(0, 200)); // Max 200 chars each
    }

    // Log sanitized values for audit trail
    console.log('Processing webhook for user:', user_id, {
      balance,
      today_pl,
      portfolio_value,
      progress_percent,
      win_rate,
      has_trade: !!new_trade,
      timestamp: new Date().toISOString()
    });

    // Call the database function to update state with validated inputs
    const { error } = await supabase.rpc('update_trader_state_from_webhook', {
      p_user_id: user_id,
      p_balance: balance,
      p_profit: today_pl,
      p_trade_message: new_trade,
      p_portfolio_value: portfolio_value,
      p_progress_percent: progress_percent,
      p_win_rate: win_rate,
      p_council_votes: council_votes,
      p_council_reasons: council_reasons,
      p_withdraw_status: withdraw_status
    });

    if (error) {
      console.error('Database error:', error);
      return new Response(
        JSON.stringify({ error: 'Database update failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Successfully updated trader state for user:', user_id);
    return new Response(
      JSON.stringify({ success: true, message: 'State updated' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});