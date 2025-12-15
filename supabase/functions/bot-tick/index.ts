import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bot-secret",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function envBool(name: string, fallback: boolean) {
  const v = Deno.env.get(name);
  if (v == null) return fallback;
  return ["1", "true", "t", "yes", "y", "on"].includes(v.trim().toLowerCase());
}

async function krakenPctChange(pair: string): Promise<number> {
  const r = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(pair)}`);
  const data = (await r.json()) as { error?: unknown; result?: Record<string, any> };
  if (Array.isArray(data.error) && data.error.length) return 0;
  const first = data.result ? Object.values(data.result)[0] : null;
  if (!first) return 0;
  const last = Number(first.c?.[0] ?? 0);
  const open = Number(first.o ?? 0);
  if (!open) return 0;
  return (last / open - 1) * 100;
}

function council(pct: number, ordersLeft: boolean) {
  const ai1 = pct > 0.1;
  const ai2 = pct > 0.05;
  const ai3 = pct > 0.0;
  const ai4 = Math.abs(pct) <= 2.0;
  const ai5 = ordersLeft;
  const votes = [ai1, ai2, ai3, ai4, ai5];
  const yes = votes.filter(Boolean).length;
  const reasons = [
    `${ai1 ? "YES" : "NO"}: momentum>0.10% (${pct.toFixed(2)}%)`,
    `${ai2 ? "YES" : "NO"}: momentum>0.05% (${pct.toFixed(2)}%)`,
    `${ai3 ? "YES" : "NO"}: momentum>0.00% (${pct.toFixed(2)}%)`,
    `${ai4 ? "YES" : "NO"}: volatility<=2.00% (${pct.toFixed(2)}%)`,
    `${ai5 ? "YES" : "NO"}: daily order limit`,
  ];
  return { votes: `${yes}/5`, reasons, approved: yes >= 4 };
}

async function alpacaPlaceOrder(opts: {
  alpacaKey: string;
  alpacaSecret: string;
  paper: boolean;
  symbol: string;
  notionalUsd: number;
}) {
  const base = opts.paper ? "https://paper-api.alpaca.markets" : "https://api.alpaca.markets";
  const r = await fetch(`${base}/v2/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "APCA-API-KEY-ID": opts.alpacaKey,
      "APCA-API-SECRET-KEY": opts.alpacaSecret,
    },
    body: JSON.stringify({
      symbol: opts.symbol,
      notional: opts.notionalUsd.toFixed(2),
      side: "buy",
      type: "market",
      time_in_force: "day",
    }),
  });
  const text = await r.text();
  const data = (() => {
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { raw: text };
    }
  })();
  if (!r.ok) throw new Error((data as any)?.message || `Alpaca order failed (${r.status})`);
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Protection: require secret header unless Supabase scheduler header exists.
  const scheduled = req.headers.get("x-supabase-scheduled") === "true";
  const requiredSecret = Deno.env.get("BOT_TICK_SECRET") || "";
  const providedSecret = req.headers.get("x-bot-secret") || "";
  if (!scheduled && requiredSecret && providedSecret !== requiredSecret) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);
    const allowLive = envBool("BOT_ALLOW_LIVE", false);
    const defaultSymbol = (Deno.env.get("BOT_DEFAULT_SYMBOL") || "AAPL").toUpperCase();
    const notionalUsd = Number(Deno.env.get("BOT_MAX_NOTIONAL_USD") || "1");
    const maxOrdersPerDay = Number(Deno.env.get("BOT_MAX_ORDERS_PER_DAY") || "20");
    const krakenPair = (Deno.env.get("BOT_KRAKEN_PAIR") || "XBTUSD").toUpperCase();

    // Find all active users
    const { data: active, error: activeErr } = await supabaseAdmin
      .from("trader_state")
      .select("user_id,swarm_active")
      .eq("swarm_active", true);
    if (activeErr) return jsonResponse({ error: activeErr.message }, 500);

    const users = (active || []).map((r) => r.user_id).filter(Boolean);
    if (!users.length) return jsonResponse({ success: true, processed: 0 });

    const today = new Date().toISOString().slice(0, 10);
    const pct = await krakenPctChange(krakenPair);

    const results: Array<{ user_id: string; status: string; detail?: string }> = [];

    for (const userId of users) {
      // pull keys
      const { data: keys, error: keysErr } = await supabaseAdmin
        .from("user_exchange_keys")
        .select("alpaca_api_key,alpaca_secret,alpaca_paper")
        .eq("user_id", userId)
        .maybeSingle();
      if (keysErr) {
        results.push({ user_id: userId, status: "error", detail: keysErr.message });
        continue;
      }
      if (!keys?.alpaca_api_key || !keys?.alpaca_secret) {
        // still update council so UI shows activity
        const c = council(pct, false);
        await supabaseAdmin.rpc("update_trader_state_from_webhook", {
          p_user_id: userId,
          p_council_votes: c.votes,
          p_council_reasons: c.reasons,
          p_trade_message: `Bot tick: missing Alpaca keys`,
        });
        results.push({ user_id: userId, status: "skipped", detail: "missing Alpaca keys" });
        continue;
      }

      // daily limit
      const { data: stat } = await supabaseAdmin
        .from("user_bot_daily_stats")
        .select("orders_count")
        .eq("user_id", userId)
        .eq("day", today)
        .maybeSingle();
      const ordersCount = Number(stat?.orders_count || 0);
      const ordersLeft = ordersCount < maxOrdersPerDay;

      const c = council(pct, ordersLeft);

      // always publish council
      await supabaseAdmin.rpc("update_trader_state_from_webhook", {
        p_user_id: userId,
        p_council_votes: c.votes,
        p_council_reasons: c.reasons,
        p_trade_message: `Bot tick: ${krakenPair} ${pct.toFixed(2)}% • ${c.votes}`,
      });

      if (!c.approved || !ordersLeft) {
        results.push({ user_id: userId, status: "no_trade" });
        continue;
      }

      // place tiny order (paper by default; live requires BOT_ALLOW_LIVE=true)
      const paper = Boolean(keys.alpaca_paper);
      if (!paper && !allowLive) {
        results.push({ user_id: userId, status: "blocked", detail: "live disabled (set BOT_ALLOW_LIVE=true)" });
        continue;
      }

      try {
        await alpacaPlaceOrder({
          alpacaKey: keys.alpaca_api_key,
          alpacaSecret: keys.alpaca_secret,
          paper,
          symbol: defaultSymbol,
          notionalUsd,
        });

        await supabaseAdmin.from("user_bot_daily_stats").upsert(
          {
            user_id: userId,
            day: today,
            orders_count: ordersCount + 1,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,day" },
        );

        await supabaseAdmin.rpc("update_trader_state_from_webhook", {
          p_user_id: userId,
          p_trade_message: `Placed Alpaca BUY ${defaultSymbol} $${notionalUsd.toFixed(2)} (${paper ? "paper" : "live"})`,
        });

        results.push({ user_id: userId, status: "traded" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "order failed";
        results.push({ user_id: userId, status: "error", detail: msg });
        await supabaseAdmin.rpc("update_trader_state_from_webhook", {
          p_user_id: userId,
          p_trade_message: `Order error: ${msg}`,
        });
      }
    }

    return jsonResponse({ success: true, processed: users.length, pct, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});

