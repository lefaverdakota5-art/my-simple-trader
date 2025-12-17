import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }

    const jwt = getBearerToken(req);
    if (!jwt) return jsonResponse({ error: "Missing Authorization Bearer token" }, 401);

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userData?.user) return jsonResponse({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    if (action === "set_keys") {
      const row = {
        user_id: userId,
        alpaca_api_key: body?.alpaca_api_key ?? null,
        alpaca_secret: body?.alpaca_secret ?? null,
        alpaca_paper: body?.alpaca_paper ?? true,
        kraken_key: body?.kraken_key ?? null,
        kraken_secret: body?.kraken_secret ?? null,
        plaid_client_id: body?.plaid_client_id ?? null,
        plaid_secret: body?.plaid_secret ?? null,
        plaid_env: body?.plaid_env ?? "production",
        openai_api_key: body?.openai_api_key ?? null,
        openai_model: body?.openai_model ?? "gpt-4o-mini",
        openai_enabled: body?.openai_enabled ?? false,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabaseAdmin.from("user_exchange_keys").upsert(row, { onConflict: "user_id" });
      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ success: true });
    }

    if (action === "status") {
      const { data, error } = await supabaseAdmin
        .from("user_exchange_keys")
        .select("alpaca_api_key,alpaca_secret,kraken_key,kraken_secret,plaid_client_id,plaid_secret,plaid_env,openai_enabled,openai_model,openai_api_key")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) return jsonResponse({ error: error.message }, 500);
      const alpacaOk = Boolean(data?.alpaca_api_key && data?.alpaca_secret);
      const krakenOk = Boolean(data?.kraken_key && data?.kraken_secret);
      const plaidOk = Boolean(data?.plaid_client_id && data?.plaid_secret);
      const openaiOk = Boolean(data?.openai_enabled && data?.openai_api_key);
      return jsonResponse({
        success: true,
        alpacaOk,
        krakenOk,
        plaidOk,
        openaiOk,
        plaidEnv: data?.plaid_env ?? null,
        openaiModel: data?.openai_model ?? null,
      });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});

