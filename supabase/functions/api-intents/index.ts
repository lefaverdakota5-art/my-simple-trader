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
      const url = new URL(req.url);
      const status = url.searchParams.get("status");
      const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);

      let query = supabaseAdmin
        .schema("trading")
        .from("trade_intents")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return jsonResponse({ intents: data || [] });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const symbol = String(body.symbol || "").trim().toUpperCase();
      const side = String(body.side || "").trim().toLowerCase();
      const orderType = String(body.order_type || "market").trim().toLowerCase();
      const quantity = body.quantity == null ? null : Number(body.quantity);
      const notionalUsd = body.notional_usd == null ? null : Number(body.notional_usd);
      const limitPrice = body.limit_price == null ? null : Number(body.limit_price);

      if (!symbol) return jsonResponse({ error: "symbol is required" }, 400);
      if (!["buy", "sell"].includes(side)) return jsonResponse({ error: "side must be buy or sell" }, 400);
      if (!["market", "limit"].includes(orderType)) return jsonResponse({ error: "order_type must be market or limit" }, 400);
      if ((quantity == null || quantity <= 0) && (notionalUsd == null || notionalUsd <= 0)) {
        return jsonResponse({ error: "quantity or notional_usd must be greater than zero" }, 400);
      }

      const config = await getOrCreateBotConfig(supabaseAdmin, user.id);
      const votingRequired = config.voting_enabled && !config.auto_approve_enabled;

      const { data, error } = await supabaseAdmin
        .schema("trading")
        .from("trade_intents")
        .insert({
          user_id: user.id,
          symbol,
          side,
          order_type: orderType,
          quantity,
          notional_usd: notionalUsd,
          limit_price: limitPrice,
          status: votingRequired ? "pending" : "approved",
          approve_threshold: votingRequired ? 1 : 0,
          approve_votes: votingRequired ? 0 : 1,
          deny_votes: 0,
          created_by: "user",
          metadata: {
            source: "api-intents",
            requested_at: new Date().toISOString(),
          },
        })
        .select("*")
        .single();

      if (error) throw error;
      return jsonResponse({ intent: data }, 201);
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message === "Unauthorized" || message.includes("Authorization") ? 401 : 500;
    return jsonResponse({ error: message }, status);
  }
});
