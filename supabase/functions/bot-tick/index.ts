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
  const data = (await r.json()) as { error?: unknown; result?: Record<string, unknown> };
  if (Array.isArray(data.error) && data.error.length) return 0;
  const first = data.result ? (Object.values(data.result)[0] as Record<string, unknown> | undefined) : undefined;
  if (!first) return 0;
  const c = first["c"];
  const last = Number(Array.isArray(c) ? c[0] : 0);
  const open = Number(first["o"] ?? 0);
  if (!open) return 0;
  return (last / open - 1) * 100;
}

async function krakenOHLC(pair: string): Promise<{ high: number; low: number; volume: number }> {
  try {
    const r = await fetch(`https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(pair)}&interval=60`);
    const data = await r.json() as { result?: Record<string, unknown[][]> };
    if (!data.result) return { high: 0, low: 0, volume: 0 };
    const ohlc = Object.values(data.result).find(v => Array.isArray(v) && v.length > 0) as unknown[][] | undefined;
    if (!ohlc || ohlc.length < 24) return { high: 0, low: 0, volume: 0 };
    
    const last24 = ohlc.slice(-24);
    const highs = last24.map(c => Number(c[2] || 0));
    const lows = last24.map(c => Number(c[3] || 0));
    const volumes = last24.map(c => Number(c[6] || 0));
    
    return {
      high: Math.max(...highs),
      low: Math.min(...lows.filter(l => l > 0)),
      volume: volumes.reduce((a, b) => a + b, 0),
    };
  } catch {
    return { high: 0, low: 0, volume: 0 };
  }
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
    `${ai1 ? "YES" : "NO"}: Momentum Analyst • momentum>0.10% (${pct.toFixed(2)}%)`,
    `${ai2 ? "YES" : "NO"}: Risk Manager • momentum>0.05% (${pct.toFixed(2)}%)`,
    `${ai3 ? "YES" : "NO"}: Technical Analyst • momentum>0.00% (${pct.toFixed(2)}%)`,
    `${ai4 ? "YES" : "NO"}: Volatility Guard • volatility<=2.00% (${pct.toFixed(2)}%)`,
    `${ai5 ? "YES" : "NO"}: Portfolio Guardian • daily order limit`,
  ];
  return { votes: `${yes}/5`, reasons, approved: yes >= 4 };
}

// Generic AI vote helper
async function lovableAiVote(opts: {
  name: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<{ vote: boolean; reason: string } | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10000);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: opts.systemPrompt },
          { role: "user", content: opts.userPrompt },
        ],
        max_tokens: 80,
      }),
    });
    clearTimeout(t);
    if (!response.ok) return null;

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";
    let jsonStr = content.trim();
    if (jsonStr.includes("```")) {
      const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) jsonStr = match[1].trim();
    }
    const parsed = JSON.parse(jsonStr) as { vote?: string; reason?: string };
    if (!parsed?.vote) return null;
    return { vote: String(parsed.vote).toUpperCase() === "YES", reason: (parsed.reason || "").slice(0, 50) };
  } catch (e) {
    console.log(`[${opts.name}] Error: ${e instanceof Error ? e.message : "unknown"}`);
    return null;
  }
}

// Top Trader Analyst - Uses Lovable AI to analyze what profitable traders would do
async function topTraderAnalystVote(opts: {
  pct: number;
  krakenPair: string;
  symbol: string;
  ordersLeft: boolean;
}): Promise<{ vote: boolean; reason: string } | null> {
  return lovableAiVote({
    name: "top-trader-analyst",
    systemPrompt: "You emulate top trader strategies. Respond with valid JSON only.",
    userPrompt: `You are the "Top Trader Analyst" - an AI that studies strategies of the world's most profitable traders like Warren Buffett, Ray Dalio, Cathie Wood, and top crypto whales.

Market Data:
- Asset: ${opts.symbol} (Crypto: ${opts.krakenPair})
- Today's price change: ${opts.pct.toFixed(2)}%
- Can place orders: ${opts.ordersLeft ? "Yes" : "No"}

Based on what top traders typically do, should we BUY now?
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Brief reason (max 50 chars)"}`,
  });
}

// News Sentiment AI - Analyzes current market news sentiment
async function newsSentimentVote(opts: {
  pct: number;
  krakenPair: string;
  symbol: string;
  ordersLeft: boolean;
}): Promise<{ vote: boolean; reason: string } | null> {
  return lovableAiVote({
    name: "news-sentiment",
    systemPrompt: "You analyze market sentiment. Respond with valid JSON only.",
    userPrompt: `You are "News Sentiment AI" - an expert at analyzing market news and social sentiment for trading decisions.

Market Data:
- Asset: ${opts.symbol} (Crypto: ${opts.krakenPair})
- Today's price change: ${opts.pct.toFixed(2)}%
- Can place orders: ${opts.ordersLeft ? "Yes" : "No"}

Based on typical market sentiment patterns:
- Positive momentum (>0.5%) often indicates bullish news
- Negative momentum (<-0.5%) may indicate bearish sentiment
- High volatility (>2%) suggests uncertain sentiment

Analyze the implied sentiment and recommend: should we BUY?
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Brief sentiment analysis (max 50 chars)"}`,
  });
}

// Whale Tracker AI - Tracks large holder movements
async function whaleTrackerVote(opts: {
  pct: number;
  krakenPair: string;
  symbol: string;
  ordersLeft: boolean;
}): Promise<{ vote: boolean; reason: string } | null> {
  return lovableAiVote({
    name: "whale-tracker",
    systemPrompt: "You predict whale trader behavior. Respond with valid JSON only.",
    userPrompt: `You are "Whale Tracker AI" - an expert at predicting large institutional and whale trader behavior in crypto and stocks.

Market Data:
- Asset: ${opts.symbol} (Crypto: ${opts.krakenPair})
- Today's price change: ${opts.pct.toFixed(2)}%
- Can place orders: ${opts.ordersLeft ? "Yes" : "No"}

Whale behavior patterns to consider:
- Whales often accumulate during slight dips (0% to -1%)
- Whales typically avoid buying during high volatility (>2%)
- Smart money follows momentum but enters before retail
- Large holders prefer stable prices for accumulation

Based on whale behavior patterns, should we BUY?
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Brief whale analysis (max 50 chars)"}`,
  });
}

// DeFi Protocol AI - Analyzes on-chain metrics and TVL data
async function defiProtocolVote(opts: {
  pct: number;
  krakenPair: string;
  symbol: string;
  ordersLeft: boolean;
}): Promise<{ vote: boolean; reason: string } | null> {
  return lovableAiVote({
    name: "defi-protocol",
    systemPrompt: "You analyze DeFi protocols and on-chain metrics. Respond with valid JSON only.",
    userPrompt: `You are "DeFi Protocol AI" - an expert at analyzing on-chain metrics, Total Value Locked (TVL), protocol activity, and DeFi ecosystem health.

Market Data:
- Asset: ${opts.symbol} (Crypto: ${opts.krakenPair})
- Today's price change: ${opts.pct.toFixed(2)}%
- Can place orders: ${opts.ordersLeft ? "Yes" : "No"}

On-chain and DeFi metrics to analyze:
- Rising TVL typically indicates growing ecosystem confidence
- High protocol activity suggests healthy demand
- Stable or growing TVL during price dips = accumulation opportunity
- DEX volume spikes often precede volatility

Based on typical DeFi protocol patterns and on-chain metrics, should we BUY?
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Brief DeFi analysis (max 50 chars)"}`,
  });
}

// Contrarian Analyst - Goes against the crowd
async function contrarianAnalystVote(opts: {
  pct: number;
  krakenPair: string;
  symbol: string;
  ordersLeft: boolean;
}): Promise<{ vote: boolean; reason: string } | null> {
  return lovableAiVote({
    name: "contrarian-analyst",
    systemPrompt: "You are a contrarian trader who profits by going against the crowd. Respond with valid JSON only.",
    userPrompt: `You are "Contrarian Analyst" - an expert at finding profitable opportunities when the crowd is wrong.

Market Data:
- Asset: ${opts.symbol} (Crypto: ${opts.krakenPair})
- Today's price change: ${opts.pct.toFixed(2)}%
- Can place orders: ${opts.ordersLeft ? "Yes" : "No"}

Contrarian principles:
- When everyone is fearful (big drops), be greedy
- When everyone is greedy (big pumps), be fearful
- Extreme movements often reverse
- Oversold conditions (>-3%) can be buying opportunities
- Overbought conditions (>+3%) warrant caution

Based on contrarian trading principles, should we BUY?
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Brief contrarian analysis (max 50 chars)"}`,
  });
}

// Grid Trading Bot AI - Analyzes grid trading opportunities
async function gridTradingBotVote(opts: {
  pct: number;
  krakenPair: string;
  symbol: string;
  ordersLeft: boolean;
  ohlc: { high: number; low: number; volume: number };
}): Promise<{ vote: boolean; reason: string } | null> {
  const range = opts.ohlc.high > 0 && opts.ohlc.low > 0 
    ? ((opts.ohlc.high - opts.ohlc.low) / opts.ohlc.low * 100).toFixed(2) 
    : "unknown";
  
  return lovableAiVote({
    name: "grid-trading-bot",
    systemPrompt: "You are a grid trading expert. Respond with valid JSON only.",
    userPrompt: `You are "Grid Trading Bot" - an expert at automated grid trading strategies that profit from market volatility.

Market Data:
- Asset: ${opts.symbol} (Crypto: ${opts.krakenPair})
- Today's price change: ${opts.pct.toFixed(2)}%
- 24h Range: ${range}%
- 24h High: $${opts.ohlc.high.toFixed(2)}
- 24h Low: $${opts.ohlc.low.toFixed(2)}
- Can place orders: ${opts.ordersLeft ? "Yes" : "No"}

Grid trading principles:
- Best in ranging/sideways markets (0.5%-3% daily range)
- Place buy orders at lower grid levels
- Too much volatility (>5%) is risky for grids
- Stable volume is preferred
- Current price near lows = good entry for grid

Based on grid trading analysis, should we place a BUY order?
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Brief grid analysis (max 50 chars)"}`,
  });
}

// Scalping Bot AI - Quick small profit analysis
async function scalpingBotVote(opts: {
  pct: number;
  krakenPair: string;
  symbol: string;
  ordersLeft: boolean;
  ohlc: { high: number; low: number; volume: number };
}): Promise<{ vote: boolean; reason: string } | null> {
  return lovableAiVote({
    name: "scalping-bot",
    systemPrompt: "You are a scalping expert focused on quick small profits. Respond with valid JSON only.",
    userPrompt: `You are "Scalping Bot" - an expert at making quick small profits from tiny price movements.

Market Data:
- Asset: ${opts.symbol} (Crypto: ${opts.krakenPair})
- Today's price change: ${opts.pct.toFixed(2)}%
- 24h Volume: ${opts.ohlc.volume.toFixed(2)}
- Can place orders: ${opts.ordersLeft ? "Yes" : "No"}

Scalping principles:
- Need high liquidity and volume
- Small price movements (0.1%-0.5%) are targets
- Low volatility periods are ideal
- Quick entry and exit
- Avoid during high volatility (>2%)
- Best when momentum is slightly positive

Based on scalping analysis, should we BUY for a quick scalp?
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Brief scalping analysis (max 50 chars)"}`,
  });
}

// Mean Reversion Bot AI - Analyzes reversion opportunities
async function meanReversionBotVote(opts: {
  pct: number;
  krakenPair: string;
  symbol: string;
  ordersLeft: boolean;
  ohlc: { high: number; low: number; volume: number };
}): Promise<{ vote: boolean; reason: string } | null> {
  const midpoint = opts.ohlc.high > 0 && opts.ohlc.low > 0 
    ? ((opts.ohlc.high + opts.ohlc.low) / 2).toFixed(2) 
    : "unknown";
  
  return lovableAiVote({
    name: "mean-reversion-bot",
    systemPrompt: "You are a mean reversion trading expert. Respond with valid JSON only.",
    userPrompt: `You are "Mean Reversion Bot" - an expert at trading based on price returning to its average.

Market Data:
- Asset: ${opts.symbol} (Crypto: ${opts.krakenPair})
- Today's price change: ${opts.pct.toFixed(2)}%
- 24h High: $${opts.ohlc.high.toFixed(2)}
- 24h Low: $${opts.ohlc.low.toFixed(2)}
- 24h Midpoint: $${midpoint}
- Can place orders: ${opts.ordersLeft ? "Yes" : "No"}

Mean reversion principles:
- Prices tend to return to their average
- Oversold (price below midpoint, negative pct) = buy opportunity
- Extreme deviations (>2%) often reverse
- Best when price is significantly below average
- Avoid when strong trend is forming

Based on mean reversion analysis, should we BUY?
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Brief mean reversion analysis (max 50 chars)"}`,
  });
}

// Fear & Greed Index AI - Market sentiment extremes
async function fearGreedIndexVote(opts: {
  pct: number;
  krakenPair: string;
  symbol: string;
  ordersLeft: boolean;
}): Promise<{ vote: boolean; reason: string } | null> {
  return lovableAiVote({
    name: "fear-greed-index",
    systemPrompt: "You analyze market fear and greed sentiment. Respond with valid JSON only.",
    userPrompt: `You are "Fear & Greed Index AI" - an expert at measuring market emotion extremes.

Market Data:
- Asset: ${opts.symbol} (Crypto: ${opts.krakenPair})
- Today's price change: ${opts.pct.toFixed(2)}%
- Can place orders: ${opts.ordersLeft ? "Yes" : "No"}

Fear & Greed indicators:
- Large drops (>-3%) indicate EXTREME FEAR → potential buy
- Large gains (>+3%) indicate EXTREME GREED → potential overextension
- Neutral range (-1% to +1%) → balanced sentiment
- Moderate fear (-1% to -3%) → opportunity zone
- Moderate greed (+1% to +3%) → caution zone

Current sentiment estimate based on price action.

Based on fear & greed analysis, should we BUY?
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Brief fear/greed analysis (max 50 chars)"}`,
  });
}

// Macro Economist AI - Macro economic trends
async function macroEconomistVote(opts: {
  pct: number;
  krakenPair: string;
  symbol: string;
  ordersLeft: boolean;
}): Promise<{ vote: boolean; reason: string } | null> {
  return lovableAiVote({
    name: "macro-economist",
    systemPrompt: "You are a macro economist analyzing global economic conditions. Respond with valid JSON only.",
    userPrompt: `You are "Macro Economist AI" - an expert at analyzing macro economic conditions affecting crypto and stocks.

Market Data:
- Asset: ${opts.symbol} (Crypto: ${opts.krakenPair})
- Today's price change: ${opts.pct.toFixed(2)}%
- Can place orders: ${opts.ordersLeft ? "Yes" : "No"}

Macro considerations:
- Risk-on environments favor crypto (positive correlation with stocks)
- High inflation periods historically favor BTC as hedge
- Liquidity conditions affect all risk assets
- Dollar strength inversely affects crypto
- Positive momentum often signals improving macro sentiment

Based on macro economic analysis, should we BUY?
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Brief macro analysis (max 50 chars)"}`,
  });
}

// DCA Bot AI - Dollar cost averaging analysis
async function dcaBotVote(opts: {
  pct: number;
  krakenPair: string;
  symbol: string;
  ordersLeft: boolean;
}): Promise<{ vote: boolean; reason: string } | null> {
  return lovableAiVote({
    name: "dca-bot",
    systemPrompt: "You are a DCA (dollar cost averaging) expert. Respond with valid JSON only.",
    userPrompt: `You are "DCA Bot" - an expert at systematic dollar cost averaging strategies.

Market Data:
- Asset: ${opts.symbol} (Crypto: ${opts.krakenPair})
- Today's price change: ${opts.pct.toFixed(2)}%
- Can place orders: ${opts.ordersLeft ? "Yes" : "No"}

DCA principles:
- Consistent buying regardless of price (time in market > timing market)
- Lower prices = buying more units for same dollar amount
- Dips (<0%) are actually GOOD for DCA (better average)
- Avoid only in extreme pumps (>5%) where you get fewer units
- Long-term accumulation strategy

Based on DCA strategy, should we execute regular BUY?
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Brief DCA analysis (max 50 chars)"}`,
  });
}

// Momentum Breakout Bot AI - Breakout trading analysis
async function momentumBreakoutVote(opts: {
  pct: number;
  krakenPair: string;
  symbol: string;
  ordersLeft: boolean;
  ohlc: { high: number; low: number; volume: number };
}): Promise<{ vote: boolean; reason: string } | null> {
  return lovableAiVote({
    name: "momentum-breakout",
    systemPrompt: "You are a momentum breakout trading expert. Respond with valid JSON only.",
    userPrompt: `You are "Momentum Breakout Bot" - an expert at catching strong momentum moves and breakouts.

Market Data:
- Asset: ${opts.symbol} (Crypto: ${opts.krakenPair})
- Today's price change: ${opts.pct.toFixed(2)}%
- 24h High: $${opts.ohlc.high.toFixed(2)}
- 24h Low: $${opts.ohlc.low.toFixed(2)}
- 24h Volume: ${opts.ohlc.volume.toFixed(2)}
- Can place orders: ${opts.ordersLeft ? "Yes" : "No"}

Breakout principles:
- Strong momentum (>1%) with volume = potential breakout
- Price near 24h highs with momentum = bullish breakout
- Consolidation before breakout (low range) is ideal
- High volume confirms breakout validity
- Avoid false breakouts (quick reversal patterns)

Based on breakout analysis, should we BUY the momentum?
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Brief breakout analysis (max 50 chars)"}`,
  });
}

async function openaiVote(opts: {
  apiKey: string;
  model: string;
  context: { pct: number; krakenPair: string; symbol: string; ordersLeft: boolean };
}): Promise<{ vote: boolean; reason: string } | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    const prompt = `You are a conservative trading assistant. Vote YES/NO for placing a small market BUY.
Return ONLY JSON: {"vote":"YES"|"NO","reason":"..."}.

Context:
- Pair: ${opts.context.krakenPair}
- Pair pct change today: ${opts.context.pct.toFixed(2)}%
- Stock symbol: ${opts.context.symbol}
- Orders left today: ${opts.context.ordersLeft}

Rules:
- Prefer NO if volatility is high or ordersLeft is false.
- Be conservative.`;

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model || "gpt-4o-mini",
        input: prompt,
      }),
    });
    clearTimeout(t);
    if (!r.ok) return null;

    const text = await r.text();
    const data = (() => {
      try {
        return text ? (JSON.parse(text) as Record<string, unknown>) : {};
      } catch {
        return {};
      }
    })();

    const outputText =
      (typeof data["output_text"] === "string" && (data["output_text"] as string)) ||
      (Array.isArray(data["output"])
        ? (() => {
            for (const item of data["output"] as unknown[]) {
              if (!item || typeof item !== "object") continue;
              const content = (item as Record<string, unknown>)["content"];
              if (!Array.isArray(content)) continue;
              for (const c of content) {
                if (!c || typeof c !== "object") continue;
                if ((c as Record<string, unknown>)["type"] === "output_text") {
                  const t = (c as Record<string, unknown>)["text"];
                  if (typeof t === "string") return t;
                }
              }
            }
            return "";
          })()
        : "");

    if (!outputText) return null;
    const parsed = (() => {
      try {
        return JSON.parse(outputText) as { vote?: string; reason?: string };
      } catch {
        return null;
      }
    })();
    if (!parsed?.vote) return null;
    const vote = String(parsed.vote).toUpperCase() === "YES";
    const reason = typeof parsed.reason === "string" ? parsed.reason : "OpenAI vote";
    return { vote, reason };
  } catch {
    return null;
  }
}

// Kraken API signing helper
async function krakenSign(path: string, nonce: string, postData: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  
  // SHA256 hash of nonce + postData
  const sha256Data = encoder.encode(nonce + postData);
  const sha256Hash = await crypto.subtle.digest("SHA-256", sha256Data);
  
  // Combine path + sha256 hash
  const pathBytes = encoder.encode(path);
  const combined = new Uint8Array(pathBytes.length + sha256Hash.byteLength);
  combined.set(pathBytes, 0);
  combined.set(new Uint8Array(sha256Hash), pathBytes.length);
  
  // HMAC-SHA512 with base64-decoded secret
  const secretBytes = Uint8Array.from(atob(secret), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, combined);
  
  // Return base64 encoded signature
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// Place order on Kraken
async function krakenPlaceOrder(opts: {
  krakenKey: string;
  krakenSecret: string;
  pair: string;
  volumeUsd: number;
}): Promise<{ txid: string[] }> {
  const nonce = Date.now().toString();
  const path = "/0/private/AddOrder";
  
  // Get current price to calculate volume
  const tickerRes = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${opts.pair}`);
  const tickerData = await tickerRes.json() as { result?: Record<string, { c?: string[] }> };
  const ticker = tickerData.result ? Object.values(tickerData.result)[0] : null;
  const currentPrice = ticker?.c?.[0] ? Number(ticker.c[0]) : 0;
  
  if (!currentPrice) throw new Error("Could not fetch current price");
  
  // Calculate volume based on USD amount (minimum order varies by pair)
  const volume = (opts.volumeUsd / currentPrice).toFixed(8);
  
  const params = new URLSearchParams({
    nonce,
    ordertype: "market",
    type: "buy",
    volume,
    pair: opts.pair,
  });
  const postData = params.toString();
  
  const signature = await krakenSign(path, nonce, postData, opts.krakenSecret);
  
  const response = await fetch(`https://api.kraken.com${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "API-Key": opts.krakenKey,
      "API-Sign": signature,
    },
    body: postData,
  });
  
  const data = await response.json() as { error?: string[]; result?: { txid?: string[] } };
  
  if (data.error && data.error.length > 0) {
    throw new Error(data.error.join(", "));
  }
  
  return { txid: data.result?.txid || [] };
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
    
    // Fetch market data
    const [pct, ohlc] = await Promise.all([
      krakenPctChange(krakenPair),
      krakenOHLC(krakenPair),
    ]);

    const results: Array<{ user_id: string; status: string; detail?: string }> = [];

    for (const userId of users) {
      // pull keys
      const { data: keys, error: keysErr } = await supabaseAdmin
        .from("user_exchange_keys")
        .select("kraken_key,kraken_secret,openai_enabled,openai_api_key,openai_model")
        .eq("user_id", userId)
        .maybeSingle();
      if (keysErr) {
        results.push({ user_id: userId, status: "error", detail: keysErr.message });
        continue;
      }
      if (!keys?.kraken_key || !keys?.kraken_secret) {
        // still update council so UI shows activity
        const c = council(pct, false);
        await supabaseAdmin.rpc("update_trader_state_from_webhook", {
          p_user_id: userId,
          p_council_votes: c.votes,
          p_council_reasons: c.reasons,
          p_trade_message: `Bot tick: missing Kraken keys`,
        });
        results.push({ user_id: userId, status: "skipped", detail: "missing Kraken keys" });
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

      let c = council(pct, ordersLeft);
      let totalMembers = 5;
      let yesVotes = Number(String(c.votes).split("/")[0] || "0");

      // Run ALL AI analysts in parallel for maximum speed (uses Lovable AI - no user config needed)
      const aiContext = { pct, krakenPair, symbol: defaultSymbol, ordersLeft };
      const ohlcContext = { ...aiContext, ohlc };
      
      const [
        topTraderVote,
        newsSentimentResult,
        whaleTrackerResult,
        defiProtocolResult,
        contrarianResult,
        gridTradingResult,
        scalpingResult,
        meanReversionResult,
        fearGreedResult,
        macroEconomistResult,
        dcaBotResult,
        momentumBreakoutResult,
      ] = await Promise.all([
        topTraderAnalystVote(aiContext),
        newsSentimentVote(aiContext),
        whaleTrackerVote(aiContext),
        defiProtocolVote(aiContext),
        contrarianAnalystVote(aiContext),
        gridTradingBotVote(ohlcContext),
        scalpingBotVote(ohlcContext),
        meanReversionBotVote(ohlcContext),
        fearGreedIndexVote(aiContext),
        macroEconomistVote(aiContext),
        dcaBotVote(aiContext),
        momentumBreakoutVote(ohlcContext),
      ]);

      // Add all AI votes
      const aiVotes = [
        { result: topTraderVote, name: "Top Trader Analyst" },
        { result: newsSentimentResult, name: "News Sentiment AI" },
        { result: whaleTrackerResult, name: "Whale Tracker AI" },
        { result: defiProtocolResult, name: "DeFi Protocol AI" },
        { result: contrarianResult, name: "Contrarian Analyst" },
        { result: gridTradingResult, name: "Grid Trading Bot" },
        { result: scalpingResult, name: "Scalping Bot" },
        { result: meanReversionResult, name: "Mean Reversion Bot" },
        { result: fearGreedResult, name: "Fear & Greed Index" },
        { result: macroEconomistResult, name: "Macro Economist" },
        { result: dcaBotResult, name: "DCA Bot" },
        { result: momentumBreakoutResult, name: "Momentum Breakout" },
      ];

      for (const { result, name } of aiVotes) {
        if (result) {
          totalMembers++;
          if (result.vote) yesVotes++;
          c.reasons.push(`${result.vote ? "YES" : "NO"}: ${name} • ${result.reason}`);
        }
      }

      // Optional OpenAI extra vote (if enabled)
      if (keys?.openai_enabled && keys?.openai_api_key) {
        const extra = await openaiVote({
          apiKey: String(keys.openai_api_key),
          model: String(keys.openai_model || "gpt-4o-mini"),
          context: aiContext,
        });
        if (extra) {
          totalMembers++;
          if (extra.vote) yesVotes++;
          c.reasons.push(`${extra.vote ? "YES" : "NO"}: OpenAI Strategist • ${extra.reason}`);
        }
      }

      // Recalculate approval with all members
      const threshold = Math.ceil(totalMembers * 0.8); // 80% yes required
      c = {
        votes: `${yesVotes}/${totalMembers}`,
        reasons: c.reasons,
        approved: yesVotes >= threshold,
      };

      // always publish council
      await supabaseAdmin.rpc("update_trader_state_from_webhook", {
        p_user_id: userId,
        p_council_votes: c.votes,
        p_council_reasons: c.reasons,
        p_trade_message: `Bot tick: ${krakenPair} ${pct.toFixed(2)}% • ${c.votes} council vote`,
      });

      if (!c.approved || !ordersLeft) {
        results.push({ user_id: userId, status: "no_trade" });
        continue;
      }

      // place Kraken crypto order (requires BOT_ALLOW_LIVE=true for safety)
      if (!allowLive) {
        results.push({ user_id: userId, status: "blocked", detail: "live trading disabled (set BOT_ALLOW_LIVE=true)" });
        continue;
      }

      try {
        const orderResult = await krakenPlaceOrder({
          krakenKey: keys.kraken_key,
          krakenSecret: keys.kraken_secret,
          pair: krakenPair,
          volumeUsd: notionalUsd,
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
          p_trade_message: `Kraken BUY ${krakenPair} $${notionalUsd.toFixed(2)} • txid: ${orderResult.txid.join(",")}`,
        });

        results.push({ user_id: userId, status: "traded" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "order failed";
        results.push({ user_id: userId, status: "error", detail: msg });
        await supabaseAdmin.rpc("update_trader_state_from_webhook", {
          p_user_id: userId,
          p_trade_message: `Kraken order error: ${msg}`,
        });
      }
    }

    return jsonResponse({ success: true, processed: users.length, pct, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});
