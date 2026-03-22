export interface TradeIntentRow {
  id: string;
  user_id: string;
  symbol: string;
  side: "buy" | "sell";
  order_type: "market" | "limit";
  quantity: number | null;
  notional_usd: number | null;
  limit_price: number | null;
  status: string;
  metadata: Record<string, unknown> | null;
  created_by: string;
  approve_threshold: number;
  approve_votes: number;
  deny_votes: number;
  created_at: string;
  updated_at: string;
  executed_at: string | null;
}

export interface BotConfigRow {
  user_id: string;
  kill_switch: boolean;
  mode: string;
  trade_size_pct: number;
  max_orders_per_tick: number;
  take_profit_pct: number;
  stop_loss_pct: number;
  cooldown_seconds: number;
  max_daily_loss_pct: number;
  max_exposure_per_asset_pct: number;
  keep_usd_reserve: number;
  sell_target_usd: number;
  pairs: string[];
  voting_enabled: boolean;
  auto_approve_enabled: boolean;
  dry_run: boolean;
  max_notional_per_order_usd: number;
  max_open_orders: number;
}

export interface UserExchangeKeysRow {
  user_id: string;
  kraken_key: string | null;
  kraken_secret: string | null;
}

export interface ExecutionResult {
  success: boolean;
  mode: "dry_run" | "live";
  order_id?: string;
  txid?: string;
  error?: string;
  requested_symbol: string;
  requested_side: string;
  requested_notional_usd: number | null;
  requested_quantity: number | null;
  executed_price?: number | null;
  executed_quantity?: number | null;
  raw?: unknown;
}

export const DEFAULT_BOT_CONFIG: BotConfigRow = {
  user_id: "",
  kill_switch: true,
  mode: "paused",
  trade_size_pct: 2,
  max_orders_per_tick: 2,
  take_profit_pct: 0.5,
  stop_loss_pct: 1,
  cooldown_seconds: 60,
  max_daily_loss_pct: 10,
  max_exposure_per_asset_pct: 25,
  keep_usd_reserve: 0.01,
  sell_target_usd: 0,
  pairs: ["XBT/USD", "ETH/USD"],
  voting_enabled: true,
  auto_approve_enabled: false,
  dry_run: true,
  max_notional_per_order_usd: 100,
  max_open_orders: 5,
};

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function decodeBase64(input: string): Uint8Array {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function normalizeKrakenPair(symbol: string): string {
  const cleaned = symbol.trim().toUpperCase().replace(/\s+/g, "");
  const withSlash = cleaned.includes("/") ? cleaned : cleaned.replace(/([A-Z]{3,5})(USD|USDT|USDC)$/, "$1/$2");
  return withSlash.replace("BTC/", "XBT/").replace(/\//g, "");
}

export async function fetchTicker(symbol: string): Promise<{ last: number; ask: number; bid: number }> {
  const pair = normalizeKrakenPair(symbol);
  const response = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${encodeURIComponent(pair)}`);
  const data = await response.json();
  if (!response.ok || data.error?.length) {
    throw new Error(data.error?.join(", ") || `Ticker lookup failed for ${symbol}`);
  }
  const result = Object.values(data.result || {})[0] as Record<string, string[]> | undefined;
  if (!result) throw new Error(`No market data for ${symbol}`);
  return {
    last: Number(result.c?.[0] || 0),
    ask: Number(result.a?.[0] || 0),
    bid: Number(result.b?.[0] || 0),
  };
}

export async function krakenPrivateRequest(endpoint: string, params: Record<string, string>, apiKey: string, apiSecret: string) {
  const nonce = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const body = new URLSearchParams({ nonce, ...params }).toString();
  const path = `/0/private/${endpoint}`;
  const encoder = new TextEncoder();
  const bodyHash = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(nonce + body)));
  const pathBytes = encoder.encode(path);
  const payload = new Uint8Array(pathBytes.length + bodyHash.length);
  payload.set(pathBytes, 0);
  payload.set(bodyHash, pathBytes.length);

  const cryptoKey = await crypto.subtle.importKey("raw", decodeBase64(apiSecret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, payload);
  const apiSign = encodeBase64(new Uint8Array(signature));

  const response = await fetch(`https://api.kraken.com${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "API-Key": apiKey,
      "API-Sign": apiSign,
    },
    body,
  });

  const data = await response.json();
  if (!response.ok || data.error?.length) {
    throw new Error(data.error?.join(", ") || `Kraken ${endpoint} failed`);
  }
  return data.result;
}

export async function getOrCreateBotConfig(supabaseAdmin: any, userId: string): Promise<BotConfigRow> {
  const { data, error } = await supabaseAdmin.from("bot_config").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (data) return data as BotConfigRow;
  const payload = { ...DEFAULT_BOT_CONFIG, user_id: userId };
  const inserted = await supabaseAdmin.from("bot_config").insert(payload).select("*").single();
  if (inserted.error) throw inserted.error;
  return inserted.data as BotConfigRow;
}

export async function countOpenOrders(supabaseAdmin: any, userId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("trading_orders")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["pending", "open", "executing"]);
  if (error) throw error;
  return count || 0;
}

export async function loadUserExchangeKeys(supabaseAdmin: any, userId: string): Promise<UserExchangeKeysRow> {
  const { data, error } = await supabaseAdmin
    .from("user_exchange_keys")
    .select("user_id, kraken_key, kraken_secret")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data || { user_id: userId, kraken_key: null, kraken_secret: null }) as UserExchangeKeysRow;
}

export async function persistExecution(supabaseAdmin: any, intent: TradeIntentRow, result: ExecutionResult) {
  const now = new Date().toISOString();
  const { error: orderError } = await supabaseAdmin.from("trading_orders").insert({
    user_id: intent.user_id,
    intent_id: intent.id,
    pair: intent.symbol,
    side: intent.side,
    order_type: intent.order_type,
    status: result.success ? (result.mode === "dry_run" ? "filled" : "open") : "rejected",
    volume: result.executed_quantity || intent.quantity || 0,
    price: result.executed_price || intent.limit_price || null,
    cost_usd: result.requested_notional_usd || null,
    fee_usd: 0,
    kraken_txid: result.txid || null,
    reject_reason: result.error || null,
    updated_at: now,
  });
  if (orderError) throw orderError;

  if (result.success && result.executed_quantity && result.executed_price) {
    const { error: fillError } = await supabaseAdmin.from("trading_fills").insert({
      user_id: intent.user_id,
      kraken_txid: result.txid || null,
      pair: intent.symbol,
      side: intent.side,
      volume: result.executed_quantity,
      price: result.executed_price,
      cost_usd: result.requested_notional_usd || result.executed_price * result.executed_quantity,
      fee_usd: 0,
      filled_at: now,
    });
    if (fillError) throw fillError;
  }

  const metadata = {
    ...(intent.metadata || {}),
    execution_result: result,
    executed_at: now,
  };

  const { error: intentError } = await supabaseAdmin
    .schema("trading")
    .from("trade_intents")
    .update({
      status: result.success ? "executed" : "failed",
      executed_at: result.success ? now : null,
      metadata,
      updated_at: now,
    })
    .eq("id", intent.id);
  if (intentError) throw intentError;
}

export async function executeIntent(supabaseAdmin: any, intent: TradeIntentRow, config: BotConfigRow, keys: UserExchangeKeysRow): Promise<ExecutionResult> {
  const openOrders = await countOpenOrders(supabaseAdmin, intent.user_id);
  if (config.kill_switch) {
    return { success: false, mode: "dry_run", error: "Kill switch enabled", requested_symbol: intent.symbol, requested_side: intent.side, requested_notional_usd: intent.notional_usd, requested_quantity: intent.quantity };
  }
  if (openOrders >= config.max_open_orders) {
    return { success: false, mode: "dry_run", error: `Open order cap reached (${openOrders}/${config.max_open_orders})`, requested_symbol: intent.symbol, requested_side: intent.side, requested_notional_usd: intent.notional_usd, requested_quantity: intent.quantity };
  }
  if ((intent.notional_usd || 0) > config.max_notional_per_order_usd) {
    return { success: false, mode: "dry_run", error: `Notional exceeds limit (${intent.notional_usd} > ${config.max_notional_per_order_usd})`, requested_symbol: intent.symbol, requested_side: intent.side, requested_notional_usd: intent.notional_usd, requested_quantity: intent.quantity };
  }

  const tradingMode = (Deno.env.get("TRADING_MODE") || "paper").toLowerCase();
  const liveEnabled = Deno.env.get("KRAKEN_EXECUTION_ENABLED") === "true" && tradingMode === "live" && !config.dry_run;
  const ticker = await fetchTicker(intent.symbol);
  const executedPrice = intent.side === "buy" ? ticker.ask || ticker.last : ticker.bid || ticker.last;
  const executedQuantity = intent.quantity || ((intent.notional_usd || 0) > 0 && executedPrice > 0 ? (intent.notional_usd || 0) / executedPrice : 0);

  if (!liveEnabled) {
    return {
      success: true,
      mode: "dry_run",
      order_id: `dryrun_${intent.id}`,
      txid: `DRYRUN_${Date.now()}`,
      requested_symbol: intent.symbol,
      requested_side: intent.side,
      requested_notional_usd: intent.notional_usd,
      requested_quantity: intent.quantity,
      executed_price: executedPrice,
      executed_quantity: executedQuantity,
      raw: { note: "Simulated execution", ticker },
    };
  }

  if (!keys.kraken_key || !keys.kraken_secret) {
    return { success: false, mode: "live", error: "Kraken keys are missing", requested_symbol: intent.symbol, requested_side: intent.side, requested_notional_usd: intent.notional_usd, requested_quantity: intent.quantity };
  }

  const params: Record<string, string> = {
    pair: normalizeKrakenPair(intent.symbol),
    type: intent.side,
    ordertype: intent.order_type || "market",
  };
  if (intent.quantity) {
    params.volume = String(intent.quantity);
  } else if (intent.notional_usd) {
    params.volume = String(intent.notional_usd);
    params.oflags = "viqc";
  }
  if (intent.limit_price && intent.order_type === "limit") {
    params.price = String(intent.limit_price);
  }

  const raw = await krakenPrivateRequest("AddOrder", params, keys.kraken_key, keys.kraken_secret);
  const txid = Array.isArray((raw as Record<string, unknown>).txid) ? String((raw as Record<string, unknown>).txid?.[0]) : undefined;

  return {
    success: true,
    mode: "live",
    order_id: txid,
    txid,
    requested_symbol: intent.symbol,
    requested_side: intent.side,
    requested_notional_usd: intent.notional_usd,
    requested_quantity: intent.quantity,
    executed_price: executedPrice,
    executed_quantity: executedQuantity,
    raw,
  };
}
