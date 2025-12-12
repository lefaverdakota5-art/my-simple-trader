import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

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
    console.log('Received webhook data:', body);

    const {
      user_id,
      balance,
      today_pl,
      portfolio_value,
      progress_percent,
      win_rate,
      new_trade,
      council_votes,
      council_reasons,
      withdraw_status
    } = body;

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'user_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Call the database function to update state
    const { error } = await supabase.rpc('update_trader_state_from_webhook', {
      p_user_id: user_id,
      p_balance: balance ?? null,
      p_profit: today_pl ?? null,
      p_trade_message: new_trade ?? null,
      p_portfolio_value: portfolio_value ?? null,
      p_progress_percent: progress_percent ?? null,
      p_win_rate: win_rate ?? null,
      p_council_votes: council_votes ?? null,
      p_council_reasons: council_reasons ?? null,
      p_withdraw_status: withdraw_status ?? null
    });

    if (error) {
      console.error('Database error:', error);
      return new Response(
        JSON.stringify({ error: 'Database update failed', details: error.message }),
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
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});