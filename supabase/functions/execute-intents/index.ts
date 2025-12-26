import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-service-key",
};

interface TradeIntent {
  id: string;
  user_id: string;
  symbol: string;
  side: "buy" | "sell";
  order_type: string;
  quantity: number | null;
  notional_usd: number | null;
  limit_price: number | null;
  status: string;
  metadata: Record<string, unknown>;
}

interface BotConfig {
  dry_run: boolean;
  max_notional_per_order_usd: number;
  max_open_orders: number;
  voting_enabled: boolean;
  auto_approve_enabled: boolean;
}

interface UserExchangeKeys {
  kraken_key: string | null;
  kraken_secret: string | null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function krakenRequest(
  endpoint: string,
  params: Record<string, string>,
  apiKey: string,
  apiSecret: string
): Promise<{ result?: unknown; error?: string[] }> {
  const nonce = String(Date.now() * 1000);
  const postData = { nonce, ...params };
  
  const urlPath = `/0/private/${endpoint}`;
  const postDataString = new URLSearchParams(postData).toString();
  
  // Create signature
  const encoder = new TextEncoder();
  const message = encoder.encode(nonce + postDataString);
  const pathBytes = encoder.encode(urlPath);
  
  // SHA256 of nonce + post data
  const sha256Hash = await crypto.subtle.digest("SHA-256", message);
  const sha256Bytes = new Uint8Array(sha256Hash);
  
  // Combine path + sha256
  const combined = new Uint8Array(pathBytes.length + sha256Bytes.length);
  combined.set(pathBytes);
  combined.set(sha256Bytes, pathBytes.length);
  
  // Decode base64 secret
  const secretBytes = Uint8Array.from(atob(apiSecret), c => c.charCodeAt(0));
  
  // HMAC-SHA512
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, combined.buffer as ArrayBuffer);
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  const response = await fetch(`https://api.kraken.com${urlPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "API-Key": apiKey,
      "API-Sign": signatureBase64,
    },
    body: postDataString,
  });
  
  return await response.json();
}

async function executeIntent(
  supabaseAdmin: any,
  intent: TradeIntent,
  config: BotConfig,
  keys: UserExchangeKeys,
  isDryRun: boolean
): Promise<{ success: boolean; error?: string; txid?: string }> {
  console.log(`[execute] Processing intent ${intent.id} for ${intent.symbol} ${intent.side}`);
  
  // Safety check: max notional
  const notional = intent.notional_usd || 0;
  if (notional > config.max_notional_per_order_usd) {
    return {
      success: false,
      error: `Order notional $${notional} exceeds max $${config.max_notional_per_order_usd}`,
    };
  }
  
  // Check open orders limit
  const { count } = await supabaseAdmin
    .from("trading_orders")
    .select("*", { count: "exact", head: true })
    .eq("user_id", intent.user_id)
    .in("status", ["pending", "open"]);
  
  if ((count || 0) >= config.max_open_orders) {
    return {
      success: false,
      error: `Already have ${count} open orders (max: ${config.max_open_orders})`,
    };
  }
  
  // DRY RUN mode - simulate execution
  if (isDryRun || config.dry_run) {
    console.log(`[execute] DRY RUN: Would execute ${intent.side} ${intent.symbol} $${notional}`);
    return {
      success: true,
      txid: `DRY_RUN_${Date.now()}`,
    };
  }
  
  // LIVE MODE - execute on Kraken
  if (!keys.kraken_key || !keys.kraken_secret) {
    return {
      success: false,
      error: "Kraken API keys not configured",
    };
  }
  
  try {
    // Map symbol to Kraken pair
    const krakenPair = intent.symbol.replace("/", "");
    
    const orderParams: Record<string, string> = {
      pair: krakenPair,
      type: intent.side,
      ordertype: intent.order_type || "market",
    };
    
    // Set volume or value based on what's provided
    if (intent.quantity) {
      orderParams.volume = String(intent.quantity);
    } else if (intent.notional_usd) {
      // For market orders with notional, use oflags=viqc (volume in quote currency)
      orderParams.volume = String(intent.notional_usd);
      orderParams.oflags = "viqc";
    }
    
    if (intent.limit_price && intent.order_type === "limit") {
      orderParams.price = String(intent.limit_price);
    }
    
    console.log(`[execute] Placing Kraken order:`, orderParams);
    
    const result = await krakenRequest(
      "AddOrder",
      orderParams,
      keys.kraken_key,
      keys.kraken_secret
    );
    
    if (result.error && result.error.length > 0) {
      console.error(`[execute] Kraken error:`, result.error);
      return {
        success: false,
        error: result.error.join(", "),
      };
    }
    
    const txid = (result.result as { txid?: string[] })?.txid?.[0] || "unknown";
    console.log(`[execute] Order placed successfully: ${txid}`);
    
    return {
      success: true,
      txid,
    };
  } catch (e) {
    console.error(`[execute] Exception:`, e);
    return {
      success: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const tradingMode = Deno.env.get("TRADING_MODE") || "paper";
  const isDryRun = tradingMode !== "live";
  
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  
  try {
    const body = await req.json().catch(() => ({}));
    const { user_id, intent_id } = body;
    
    // If specific intent_id provided, execute just that one
    if (intent_id) {
      const { data: intent, error: intentError } = await supabaseAdmin
        .from("trade_intents")
        .select("*")
        .eq("id", intent_id)
        .single();
      
      if (intentError || !intent) {
        // Try trading schema
        const { data: tradingIntent, error: tradingError } = await supabaseAdmin
          .schema("trading")
          .from("trade_intents")
          .select("*")
          .eq("id", intent_id)
          .single();
        
        if (tradingError || !tradingIntent) {
          return jsonResponse({ error: "Intent not found" }, 404);
        }
        
        // Process the trading schema intent
        const { data: config } = await supabaseAdmin
          .from("bot_config")
          .select("*")
          .eq("user_id", tradingIntent.user_id)
          .single();
        
        const { data: keys } = await supabaseAdmin
          .from("user_exchange_keys")
          .select("kraken_key, kraken_secret")
          .eq("user_id", tradingIntent.user_id)
          .single();
        
        const result = await executeIntent(
          supabaseAdmin,
          tradingIntent as TradeIntent,
          config || { dry_run: true, max_notional_per_order_usd: 100, max_open_orders: 5 } as BotConfig,
          keys || { kraken_key: null, kraken_secret: null },
          isDryRun
        );
        
        // Update intent status
        await supabaseAdmin
          .schema("trading")
          .from("trade_intents")
          .update({
            status: result.success ? "executed" : "failed",
            executed_at: result.success ? new Date().toISOString() : null,
            metadata: {
              ...tradingIntent.metadata,
              execution_result: result,
              executed_at: new Date().toISOString(),
            },
          })
          .eq("id", intent_id);
        
        return jsonResponse({ success: result.success, result });
      }
    }
    
    // Poll mode: find all approved intents and execute them
    console.log("[execute-intents] Polling for approved intents...");
    
    // Query trading schema for approved intents
    const { data: approvedIntents, error: queryError } = await supabaseAdmin
      .schema("trading")
      .from("trade_intents")
      .select("*")
      .eq("status", "approved")
      .order("created_at", { ascending: true })
      .limit(10);
    
    if (queryError) {
      console.error("[execute-intents] Query error:", queryError);
      return jsonResponse({ error: queryError.message }, 500);
    }
    
    if (!approvedIntents || approvedIntents.length === 0) {
      return jsonResponse({ message: "No approved intents to execute", count: 0 });
    }
    
    console.log(`[execute-intents] Found ${approvedIntents.length} approved intents`);
    
    const results: Array<{ intent_id: string; success: boolean; error?: string }> = [];
    
    for (const intent of approvedIntents) {
      // Mark as executing first (idempotency)
      await supabaseAdmin
        .schema("trading")
        .from("trade_intents")
        .update({ status: "executing" })
        .eq("id", intent.id)
        .eq("status", "approved"); // Only update if still approved
      
      // Get user's config and keys
      const { data: config } = await supabaseAdmin
        .from("bot_config")
        .select("*")
        .eq("user_id", intent.user_id)
        .single();
      
      const { data: keys } = await supabaseAdmin
        .from("user_exchange_keys")
        .select("kraken_key, kraken_secret")
        .eq("user_id", intent.user_id)
        .single();
      
      const result = await executeIntent(
        supabaseAdmin,
        intent as TradeIntent,
        config || { dry_run: true, max_notional_per_order_usd: 100, max_open_orders: 5 } as BotConfig,
        keys || { kraken_key: null, kraken_secret: null },
        isDryRun
      );
      
      // Update intent with result
      await supabaseAdmin
        .schema("trading")
        .from("trade_intents")
        .update({
          status: result.success ? "executed" : "failed",
          executed_at: result.success ? new Date().toISOString() : null,
          metadata: {
            ...intent.metadata,
            execution_result: result,
            executed_at: new Date().toISOString(),
          },
        })
        .eq("id", intent.id);
      
      results.push({
        intent_id: intent.id,
        success: result.success,
        error: result.error,
      });
    }
    
    return jsonResponse({
      message: `Processed ${results.length} intents`,
      results,
      dry_run: isDryRun,
    });
    
  } catch (e) {
    console.error("[execute-intents] Error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
