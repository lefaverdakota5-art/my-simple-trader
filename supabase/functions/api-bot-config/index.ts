import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { getOrCreateBotConfig } from "../_shared/trading.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user, supabaseAdmin } = await requireUser(req);

    if (req.method === "GET") {
      const config = await getOrCreateBotConfig(supabaseAdmin, user.id);
      return jsonResponse({ config });
    }

    if (req.method === "PUT") {
      const body = await req.json();
      const existing = await getOrCreateBotConfig(supabaseAdmin, user.id);
      const next = {
        ...existing,
        voting_enabled: body.voting_enabled ?? existing.voting_enabled,
        auto_approve_enabled: body.auto_approve_enabled ?? existing.auto_approve_enabled,
        dry_run: body.dry_run ?? existing.dry_run,
        max_notional_per_order_usd: body.max_notional_per_order_usd ?? existing.max_notional_per_order_usd,
        max_open_orders: body.max_open_orders ?? existing.max_open_orders,
        kill_switch: body.kill_switch ?? existing.kill_switch,
        mode: body.mode ?? existing.mode,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabaseAdmin
        .from("bot_config")
        .update(next)
        .eq("user_id", user.id)
        .select("*")
        .single();
      if (error) throw error;
      return jsonResponse({ config: data });
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Unauthorized" || message.includes("Authorization") ? 401 : 500;
    return jsonResponse({ error: message }, status);
  }
});
