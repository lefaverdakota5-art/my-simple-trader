import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin, requireServiceKey } from "../_shared/auth.ts";
import { executeIntent, getOrCreateBotConfig, loadUserExchangeKeys, persistExecution } from "../_shared/trading.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    requireServiceKey(req);
    const supabaseAdmin = createSupabaseAdmin();
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || 10), 50);

    const { data: intents, error } = await supabaseAdmin
      .schema("trading")
      .from("trade_intents")
      .select("*")
      .eq("status", "approved")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) throw error;
    if (!intents || intents.length === 0) {
      return jsonResponse({ processed: 0, results: [] });
    }

    const results: Array<Record<string, unknown>> = [];

    for (const intent of intents) {
      const mark = await supabaseAdmin
        .schema("trading")
        .from("trade_intents")
        .update({ status: "executing", updated_at: new Date().toISOString() })
        .eq("id", intent.id)
        .eq("status", "approved")
        .select("id")
        .maybeSingle();

      if (mark.error) throw mark.error;
      if (!mark.data) {
        continue;
      }

      try {
        const config = await getOrCreateBotConfig(supabaseAdmin, intent.user_id);
        const keys = await loadUserExchangeKeys(supabaseAdmin, intent.user_id);
        const result = await executeIntent(supabaseAdmin, intent, config, keys);
        await persistExecution(supabaseAdmin, intent, result);
        results.push({ intent_id: intent.id, success: result.success, mode: result.mode, error: result.error || null });
      } catch (innerError) {
        const message = innerError instanceof Error ? innerError.message : "Unknown error";
        await supabaseAdmin
          .schema("trading")
          .from("trade_intents")
          .update({
            status: "failed",
            metadata: {
              ...(intent.metadata || {}),
              execution_result: { success: false, error: message },
              failed_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", intent.id);
        results.push({ intent_id: intent.id, success: false, error: message });
      }
    }

    return jsonResponse({ processed: results.length, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Forbidden" ? 403 : 500;
    return jsonResponse({ error: message }, status);
  }
});
