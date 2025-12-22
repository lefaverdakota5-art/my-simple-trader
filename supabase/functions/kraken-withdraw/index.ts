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
      .select("kraken_key, kraken_secret, kraken_withdraw_key")
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

    if (action === "withdraw_to_chime" || action === "withdraw_to_bank") {
      const amount = parseFloat(body?.amount);
      // Use withdraw_key from request body, fall back to saved key in database
      const withdrawKey = String(body?.withdraw_key || savedWithdrawKey || "").trim();
      const asset = String(body?.asset || "USD");

      if (isNaN(amount) || amount <= 0) {
        return jsonResponse({ error: "Invalid withdrawal amount" }, 400);
      }

      if (!withdrawKey) {
        return jsonResponse({ 
          error: "Missing Kraken withdrawal key. Please add your bank as a withdrawal address in Kraken, then enter the key name in Settings." 
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
          withdraw_type: "kraken_to_bank",
          bank_name: withdrawKey,
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
        message: `Withdrawal of $${amount.toFixed(2)} initiated successfully. Funds will arrive in your bank account in 1-3 business days.`,
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

    // Test API key permissions
    if (action === "test_permissions") {
      console.log("Testing Kraken API key permissions...");
      
      const permissions = {
        balance: false,
        withdraw_info: false,
        withdraw_addresses: false,
        withdraw_methods: false,
      };
      const errors: string[] = [];
      
      // Test balance (requires "Query Funds" permission)
      const balanceResult = await krakenRequest("/0/private/Balance", krakenKey, krakenSecret);
      if (balanceResult.error && balanceResult.error.length > 0) {
        errors.push(`Balance: ${balanceResult.error.join(", ")}`);
      } else {
        permissions.balance = true;
      }
      
      // Test withdraw info (requires "Withdraw Funds" permission)
      const withdrawInfoResult = await krakenRequest("/0/private/WithdrawInfo", krakenKey, krakenSecret, {
        asset: "USD",
        amount: "1",
      });
      if (withdrawInfoResult.error && withdrawInfoResult.error.length > 0) {
        const errMsg = withdrawInfoResult.error.join(", ");
        // "EFunding:Unknown withdraw key" means permission is OK, just no key set
        if (errMsg.includes("Unknown withdraw key") || errMsg.includes("Invalid key")) {
          permissions.withdraw_info = true; // Permission granted, just no address
        } else {
          errors.push(`Withdraw Info: ${errMsg}`);
        }
      } else {
        permissions.withdraw_info = true;
      }
      
      // Test withdraw addresses (requires "Withdraw Funds" permission)
      const addressesResult = await krakenRequest("/0/private/WithdrawAddresses", krakenKey, krakenSecret, {
        asset: "USD",
      });
      if (addressesResult.error && addressesResult.error.length > 0) {
        errors.push(`Withdraw Addresses: ${addressesResult.error.join(", ")}`);
      } else {
        permissions.withdraw_addresses = true;
      }
      
      // Test withdraw methods (requires "Withdraw Funds" permission)
      const methodsResult = await krakenRequest("/0/private/WithdrawMethods", krakenKey, krakenSecret, {
        asset: "USD",
      });
      if (methodsResult.error && methodsResult.error.length > 0) {
        errors.push(`Withdraw Methods: ${methodsResult.error.join(", ")}`);
      } else {
        permissions.withdraw_methods = true;
      }
      
      const hasWithdrawPermission = permissions.withdraw_info || permissions.withdraw_addresses || permissions.withdraw_methods;
      
      // Get saved addresses for display
      let savedAddresses: unknown[] = [];
      if (permissions.withdraw_addresses && addressesResult.result) {
        savedAddresses = addressesResult.result as unknown[];
      }
      
      console.log("Permission test results:", { permissions, errors, savedAddresses });
      
      return jsonResponse({
        success: true,
        permissions,
        hasWithdrawPermission,
        savedAddresses,
        errors: errors.length > 0 ? errors : undefined,
        message: hasWithdrawPermission 
          ? "Your API key has withdrawal permissions enabled." 
          : "Your API key does NOT have withdrawal permissions. Please create a new API key with 'Withdraw Funds' permission enabled."
      });
    }

    // Execute a real trade (buy crypto)
    if (action === "buy_crypto") {
      const pair = String(body?.pair || "XDGUSD"); // Default to DOGE/USD
      const amountUsd = parseFloat(body?.amount_usd);

      if (isNaN(amountUsd) || amountUsd <= 0) {
        return jsonResponse({ error: "Invalid trade amount" }, 400);
      }

      console.log(`[buy_crypto] Executing BUY: $${amountUsd} of ${pair}`);

      // Get current price to calculate volume
      const tickerRes = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${pair}`);
      const tickerData = await tickerRes.json() as { result?: Record<string, { c?: string[] }> };
      const ticker = tickerData.result ? Object.values(tickerData.result)[0] : null;
      const currentPrice = ticker?.c?.[0] ? Number(ticker.c[0]) : 0;

      if (!currentPrice) {
        return jsonResponse({ error: `Could not fetch current price for ${pair}` }, 400);
      }

      console.log(`[buy_crypto] ${pair} current price: $${currentPrice}`);

      // Get pair info for minimum order size
      const pairInfoRes = await fetch(`https://api.kraken.com/0/public/AssetPairs?pair=${pair}`);
      const pairInfoData = await pairInfoRes.json() as { result?: Record<string, { ordermin?: string; lot_decimals?: number }> };
      const pairInfo = pairInfoData.result ? Object.values(pairInfoData.result)[0] : null;
      const orderMin = parseFloat(pairInfo?.ordermin || "0");
      const lotDecimals = pairInfo?.lot_decimals || 8;

      // Calculate volume based on USD amount
      const volume = amountUsd / currentPrice;
      const volumeStr = volume.toFixed(lotDecimals);

      console.log(`[buy_crypto] Calculated volume: ${volumeStr} (min: ${orderMin})`);

      if (volume < orderMin) {
        return jsonResponse({ 
          error: `Volume ${volumeStr} below minimum ${orderMin} for ${pair}. Need at least $${(orderMin * currentPrice).toFixed(2)} to trade.` 
        }, 400);
      }

      // Check Kraken USD balance first
      const balanceResult = await krakenRequest("/0/private/Balance", krakenKey, krakenSecret);
      if (balanceResult.error && balanceResult.error.length > 0) {
        return jsonResponse({ error: "Failed to check balance: " + balanceResult.error.join(", ") }, 400);
      }

      const balances = balanceResult.result as Record<string, string> || {};
      const usdBalance = parseFloat(balances["ZUSD"] || balances["USD"] || "0");

      console.log(`[buy_crypto] Kraken USD balance: $${usdBalance}`);

      if (usdBalance < amountUsd) {
        return jsonResponse({ 
          error: `Insufficient Kraken USD balance. Available: $${usdBalance.toFixed(2)}, Requested: $${amountUsd.toFixed(2)}` 
        }, 400);
      }

      // Place market BUY order
      const orderResult = await krakenRequest("/0/private/AddOrder", krakenKey, krakenSecret, {
        ordertype: "market",
        type: "buy",
        volume: volumeStr,
        pair: pair,
      });

      console.log(`[buy_crypto] Order result:`, JSON.stringify(orderResult));

      if (orderResult.error && orderResult.error.length > 0) {
        return jsonResponse({ error: "Trade failed: " + orderResult.error.join(", ") }, 400);
      }

      const txid = (orderResult.result as { txid?: string[] })?.txid || [];
      const descr = (orderResult.result as { descr?: { order?: string } })?.descr?.order || "";

      console.log(`[buy_crypto] Trade executed! TXID: ${txid.join(", ")}, Description: ${descr}`);

      // Record position in database
      const { error: positionError } = await supabaseAdmin
        .from("positions")
        .insert({
          user_id: userId,
          symbol: pair.replace("USD", ""),
          pair: pair,
          side: "long",
          quantity: volume,
          entry_price: currentPrice,
          entry_txid: txid[0] || null,
          status: "open",
          take_profit_percent: 10,
          stop_loss_percent: 5,
        });

      if (positionError) {
        console.error("Failed to record position:", positionError);
      }

      // Record trade message
      await supabaseAdmin.from("trades").insert({
        user_id: userId,
        message: `REAL TRADE: Bought ${volumeStr} ${pair} @ $${currentPrice.toFixed(6)} for $${amountUsd.toFixed(2)}`,
      });

      return jsonResponse({
        success: true,
        message: `Successfully bought ${volumeStr} ${pair.replace("USD", "")} at $${currentPrice.toFixed(6)}`,
        txid: txid,
        description: descr,
        volume: volume,
        price: currentPrice,
        totalCost: amountUsd,
        remainingBalance: usdBalance - amountUsd,
      });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("Kraken withdraw error:", e);
    return jsonResponse({ error: msg }, 500);
  }
});
