import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64, decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

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

// Generate Kraken API signature
async function getKrakenSignature(
  urlPath: string,
  data: Record<string, string>,
  secret: string
): Promise<string> {
  const nonce = data.nonce;
  const postData = new URLSearchParams(data).toString();
  
  // Create SHA256 hash of nonce + postData
  const msgBuffer = new TextEncoder().encode(nonce + postData);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  
  // Create HMAC-SHA512 of path + hash using secret
  const pathBuffer = new TextEncoder().encode(urlPath);
  const message = new Uint8Array(pathBuffer.length + hashArray.length);
  message.set(pathBuffer);
  message.set(hashArray, pathBuffer.length);
  
  const secretBytes = decodeBase64(secret);
  const keyBuffer = new ArrayBuffer(secretBytes.length);
  const keyView = new Uint8Array(keyBuffer);
  keyView.set(secretBytes);
  
  const key = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", key, message);
  return encodeBase64(new Uint8Array(signature));
}

// Make Kraken API request
async function krakenRequest(
  endpoint: string,
  apiKey: string,
  apiSecret: string,
  params: Record<string, string> = {}
): Promise<{ result?: unknown; error?: string[] }> {
  const nonce = (Date.now() * 1000).toString();
  const data = { nonce, ...params };
  
  const signature = await getKrakenSignature(endpoint, data, apiSecret);
  
  const response = await fetch(`https://api.kraken.com${endpoint}`, {
    method: "POST",
    headers: {
      "API-Key": apiKey,
      "API-Sign": signature,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(data).toString(),
  });
  
  return await response.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    // Get user's Kraken API keys and withdrawal settings
    const { data: keysData, error: keysError } = await supabaseAdmin
      .from("user_exchange_keys")
      .select("kraken_key, kraken_secret, chime_account_name, kraken_withdraw_key")
      .eq("user_id", userId)
      .maybeSingle();

    if (keysError || !keysData?.kraken_key || !keysData?.kraken_secret) {
      return jsonResponse({ error: "Kraken API keys not configured. Please add them in Settings." }, 400);
    }

    const krakenKey = keysData.kraken_key;
    const krakenSecret = keysData.kraken_secret;
    const savedWithdrawKey = keysData.kraken_withdraw_key;

    if (action === "get_balance") {
      // Get Kraken account balance
      const result = await krakenRequest("/0/private/Balance", krakenKey, krakenSecret);
      
      if (result.error && result.error.length > 0) {
        console.error("Kraken balance error:", result.error);
        return jsonResponse({ error: result.error.join(", ") }, 400);
      }

      const balances = result.result as Record<string, string> || {};
      const usdBalance = parseFloat(balances["ZUSD"] || balances["USD"] || "0");
      
      return jsonResponse({ 
        success: true, 
        balance: usdBalance,
        allBalances: balances 
      });
    }

    if (action === "withdraw_to_chime") {
      const amount = parseFloat(body?.amount);
      // Use withdraw_key from request body, fall back to saved key in database
      const withdrawKey = String(body?.withdraw_key || savedWithdrawKey || "").trim();
      const asset = String(body?.asset || "USD");

      if (isNaN(amount) || amount <= 0) {
        return jsonResponse({ error: "Invalid withdrawal amount" }, 400);
      }

      if (!withdrawKey) {
        return jsonResponse({ 
          error: "Missing Kraken withdrawal key. Please add your Chime bank as a withdrawal address in Kraken, then enter the key name in Settings." 
        }, 400);
      }

      console.log(`Initiating withdrawal: $${amount} to key "${withdrawKey}", asset: ${asset}`);

      // First check if we have sufficient balance
      const balanceResult = await krakenRequest("/0/private/Balance", krakenKey, krakenSecret);
      if (balanceResult.error && balanceResult.error.length > 0) {
        return jsonResponse({ error: "Failed to check balance: " + balanceResult.error.join(", ") }, 400);
      }

      const balances = balanceResult.result as Record<string, string> || {};
      const usdBalance = parseFloat(balances["ZUSD"] || balances["USD"] || "0");

      if (usdBalance < amount) {
        return jsonResponse({ 
          error: `Insufficient Kraken balance. Available: $${usdBalance.toFixed(2)}, Requested: $${amount.toFixed(2)}` 
        }, 400);
      }

      // Execute the withdrawal
      const withdrawResult = await krakenRequest("/0/private/Withdraw", krakenKey, krakenSecret, {
        asset: asset,
        key: withdrawKey,
        amount: amount.toString(),
      });

      if (withdrawResult.error && withdrawResult.error.length > 0) {
        console.error("Kraken withdrawal error:", withdrawResult.error);
        return jsonResponse({ error: withdrawResult.error.join(", ") }, 400);
      }

      const refid = (withdrawResult.result as { refid?: string })?.refid || "unknown";

      // Record the withdrawal in the database
      const { error: insertError } = await supabaseAdmin
        .from("withdrawal_requests")
        .insert({
          user_id: userId,
          amount: amount,
          status: "processing",
          withdraw_type: "kraken_to_chime",
          bank_name: keysData.chime_account_name || "Chime",
        });

      if (insertError) {
        console.error("Failed to record withdrawal:", insertError);
      }

      // Also deduct from trader_state balance
      const { data: traderState } = await supabaseAdmin
        .from("trader_state")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle();
      
      if (traderState) {
        const newBalance = Math.max(0, (traderState.balance || 0) - amount);
        await supabaseAdmin
          .from("trader_state")
          .update({ balance: newBalance, updated_at: new Date().toISOString() })
          .eq("user_id", userId);
      }

      console.log(`Withdrawal initiated: $${amount} to ${withdrawKey}, refid: ${refid}`);

      return jsonResponse({ 
        success: true, 
        message: `Withdrawal of $${amount.toFixed(2)} initiated successfully. Funds will arrive in your Chime account in 1-3 business days.`,
        refid: refid,
        remainingBalance: usdBalance - amount
      });
    }

    if (action === "get_withdraw_info") {
      const asset = String(body?.asset || "ZUSD");
      const withdrawKey = String(body?.withdraw_key || "").trim();
      const amountStr = String(body?.amount || "1");

      const params: Record<string, string> = { asset, amount: amountStr };
      if (withdrawKey) params.key = withdrawKey;

      const result = await krakenRequest("/0/private/WithdrawInfo", krakenKey, krakenSecret, params);
      
      if (result.error && result.error.length > 0) {
        return jsonResponse({ error: result.error.join(", ") }, 400);
      }

      return jsonResponse({ success: true, info: result.result });
    }

    // Get available withdrawal methods for an asset
    if (action === "get_withdraw_methods") {
      const asset = String(body?.asset || "USD");
      
      const result = await krakenRequest("/0/private/WithdrawMethods", krakenKey, krakenSecret, { asset });
      
      console.log("WithdrawMethods result:", JSON.stringify(result));
      
      if (result.error && result.error.length > 0) {
        return jsonResponse({ error: result.error.join(", ") }, 400);
      }

      return jsonResponse({ success: true, methods: result.result });
    }

    // Get saved withdrawal addresses
    if (action === "get_withdraw_addresses") {
      const asset = String(body?.asset || "USD");
      const method = String(body?.method || "");
      
      const params: Record<string, string> = { asset };
      if (method) params.method = method;
      
      const result = await krakenRequest("/0/private/WithdrawAddresses", krakenKey, krakenSecret, params);
      
      console.log("WithdrawAddresses result:", JSON.stringify(result));
      
      if (result.error && result.error.length > 0) {
        return jsonResponse({ error: result.error.join(", ") }, 400);
      }

      return jsonResponse({ success: true, addresses: result.result });
    }

    // Get withdrawal status
    if (action === "get_withdraw_status") {
      const asset = String(body?.asset || "USD");
      
      const result = await krakenRequest("/0/private/WithdrawStatus", krakenKey, krakenSecret, { asset });
      
      if (result.error && result.error.length > 0) {
        return jsonResponse({ error: result.error.join(", ") }, 400);
      }

      return jsonResponse({ success: true, withdrawals: result.result });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("Kraken withdraw error:", e);
    return jsonResponse({ error: msg }, 500);
  }
});
