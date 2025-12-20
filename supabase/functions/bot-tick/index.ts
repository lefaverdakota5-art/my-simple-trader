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

// =============================================================================
// INPUT VALIDATION HELPERS - Bounds checking for all numeric parameters
// =============================================================================

/**
 * Clamps a number within specified bounds
 * Returns fallback if value is null/undefined/NaN
 */
function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (value === null || value === undefined) return fallback;
  const num = Number(value);
  if (isNaN(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

/**
 * Validates and clamps trading configuration parameters
 */
interface TradingConfig {
  takeProfitPercent: number;
  stopLossPercent: number;
  trailingStopPercent: number | null;
  maxPositionPercent: number;
}

function validateTradingConfig(keys: Record<string, unknown> | null): TradingConfig {
  // Safe bounds for trading parameters
  // Take profit: 0.1% to 1000% (allow very tight to very wide)
  const takeProfitPercent = clampNumber(keys?.default_take_profit_percent, 0.1, 1000, 10);
  
  // Stop loss: 0.1% to 100% (never more than 100% as that makes no sense)
  const stopLossPercent = clampNumber(keys?.default_stop_loss_percent, 0.1, 100, 5);
  
  // Trailing stop: 0.1% to 50% (if enabled)
  let trailingStopPercent: number | null = null;
  if (keys?.trailing_stop_percent !== null && keys?.trailing_stop_percent !== undefined) {
    const rawTrailing = Number(keys.trailing_stop_percent);
    if (!isNaN(rawTrailing) && rawTrailing > 0) {
      trailingStopPercent = Math.max(0.1, Math.min(50, rawTrailing));
    }
  }
  
  // Max position: 0.1% to 100% of portfolio
  const maxPositionPercent = clampNumber(keys?.max_position_percent, 0.1, 100, 10);
  
  return {
    takeProfitPercent,
    stopLossPercent,
    trailingStopPercent,
    maxPositionPercent,
  };
}

/**
 * Validates order size is within reasonable bounds
 * Min: $1, Max: $1,000,000 per order
 */
function validateOrderSize(amount: number, portfolioValue: number, maxPositionPercent: number): number {
  const MIN_ORDER = 1;
  const MAX_ORDER = 1_000_000;
  const MAX_PERCENT_OF_PORTFOLIO = 100;
  
  // Ensure order doesn't exceed portfolio percentage
  const maxByPercent = portfolioValue > 0 
    ? portfolioValue * (Math.min(maxPositionPercent, MAX_PERCENT_OF_PORTFOLIO) / 100)
    : MAX_ORDER;
  
  const clampedAmount = Math.max(MIN_ORDER, Math.min(MAX_ORDER, amount, maxByPercent));
  
  // Log if clamping occurred
  if (clampedAmount !== amount) {
    console.log(`[validation] Order size clamped: $${amount.toFixed(2)} -> $${clampedAmount.toFixed(2)}`);
  }
  
  return clampedAmount;
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

// Generic AI vote helper - uses Lovable AI (no API key needed)
async function lovableAiVote(opts: {
  name: string;
  systemPrompt: string;
  userPrompt: string;
  model?: string; // Optional: use "google/gemini-2.5-pro" for deeper analysis
}): Promise<{ vote: boolean; reason: string } | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12000);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: opts.model || "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: opts.systemPrompt },
          { role: "user", content: opts.userPrompt },
        ],
      }),
    });
    clearTimeout(t);
    if (!response.ok) {
      console.log(`[${opts.name}] API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";
    let jsonStr = content.trim();
    if (jsonStr.includes("```")) {
      const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) jsonStr = match[1].trim();
    }
    const parsed = JSON.parse(jsonStr) as { vote?: string; reason?: string };
    if (!parsed?.vote) return null;
    const vote = String(parsed.vote).toUpperCase() === "YES";
    const reason = (parsed.reason || `${opts.name} vote`).slice(0, 50);
    console.log(`[${opts.name}] Vote: ${vote ? "YES" : "NO"}, Reason: ${reason}`);
    return { vote, reason };
  } catch (e) {
    console.log(`[${opts.name}] Error: ${e instanceof Error ? e.message : "unknown"}`);
    return null;
  }
}

// Pro-level Master Strategist - uses advanced Gemini 2.5 Pro for deeper analysis
async function masterStrategistVote(opts: {
  pct: number;
  krakenPair: string;
  symbol: string;
  ordersLeft: boolean;
  ohlc: { high: number; low: number; volume: number };
  assetType?: string;
}): Promise<{ vote: boolean; reason: string } | null> {
  const range = opts.ohlc.high > 0 && opts.ohlc.low > 0 
    ? ((opts.ohlc.high - opts.ohlc.low) / opts.ohlc.low * 100).toFixed(2) 
    : "unknown";
  const assetLabel = opts.assetType === "stock" ? "Stock" : "Crypto";

  return lovableAiVote({
    name: "master-strategist",
    model: "google/gemini-2.5-pro", // Use Pro model for complex reasoning
    systemPrompt: "You are an elite trading strategist combining technical, fundamental, and sentiment analysis for both stocks and crypto. Respond with valid JSON only.",
    userPrompt: `You are "Master Strategist" - an elite AI that synthesizes all trading methodologies.

Market Data:
- Asset: ${opts.symbol} (${assetLabel}: ${opts.krakenPair})
- Asset Type: ${assetLabel}
- Today's change: ${opts.pct.toFixed(2)}%
- 24h Range: ${range}%
- 24h High: $${opts.ohlc.high.toFixed(2)}
- 24h Low: $${opts.ohlc.low.toFixed(2)}
- Volume: ${opts.ohlc.volume.toFixed(2)}
- Can place orders: ${opts.ordersLeft ? "Yes" : "No"}

Consider ALL factors:
- Technical: Support/resistance, momentum, volume
- Sentiment: Fear/greed based on price action
- Risk: Position sizing, volatility-adjusted entries
- Timing: Is this an optimal entry point?
${opts.assetType === "stock" ? "- Fundamentals: Earnings, P/E ratio, market conditions for stocks" : "- On-chain: Network activity, whale movements for crypto"}

Synthesize all factors. Should we BUY?
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Brief synthesis (max 50 chars)"}`,
  });
}

// AI Risk Assessor - Pro model for comprehensive risk analysis
async function aiRiskAssessorVote(opts: {
  pct: number;
  krakenPair: string;
  symbol: string;
  ordersLeft: boolean;
  ohlc: { high: number; low: number; volume: number };
}): Promise<{ vote: boolean; reason: string } | null> {
  const volatility = opts.ohlc.high > 0 && opts.ohlc.low > 0 
    ? ((opts.ohlc.high - opts.ohlc.low) / opts.ohlc.low * 100).toFixed(2) 
    : "unknown";

  return lovableAiVote({
    name: "ai-risk-assessor",
    model: "google/gemini-2.5-pro",
    systemPrompt: "You are a quantitative risk analyst. Respond with valid JSON only.",
    userPrompt: `You are "AI Risk Assessor" - a quantitative analyst focused on risk-adjusted returns.

Market Data:
- Asset: ${opts.symbol} (Crypto: ${opts.krakenPair})
- Today's change: ${opts.pct.toFixed(2)}%
- 24h Volatility: ${volatility}%
- Volume: ${opts.ohlc.volume.toFixed(2)}
- Orders left today: ${opts.ordersLeft ? "Yes" : "No"}

Risk factors to evaluate:
- Volatility risk: High volatility (>3%) = higher risk
- Drawdown potential based on current price vs range
- Liquidity risk from volume levels
- Overtrading risk if many orders already placed

Only vote YES if risk/reward is favorable.
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Risk assessment (max 50 chars)"}`,
  });
}

// Pattern Recognition AI - uses vision-capable model concept
async function patternRecognitionVote(opts: {
  pct: number;
  krakenPair: string;
  symbol: string;
  ordersLeft: boolean;
  ohlc: { high: number; low: number; volume: number };
}): Promise<{ vote: boolean; reason: string } | null> {
  return lovableAiVote({
    name: "pattern-recognition",
    model: "google/gemini-2.5-flash",
    systemPrompt: "You are a chart pattern recognition expert. Respond with valid JSON only.",
    userPrompt: `You are "Pattern Recognition AI" - an expert at identifying chart patterns from price data.

Price Action Data:
- Asset: ${opts.symbol} (${opts.krakenPair})
- Today's movement: ${opts.pct.toFixed(2)}%
- 24h High: $${opts.ohlc.high.toFixed(2)}
- 24h Low: $${opts.ohlc.low.toFixed(2)}
- Volume: ${opts.ohlc.volume.toFixed(2)}

Pattern indicators:
- Strong up day (>2%) near highs = bullish continuation
- Down day (-2% to -4%) near lows = potential reversal
- Low volatility + low volume = consolidation (wait)
- High volume + breakout = confirmation

Identify the likely pattern and recommend: should we BUY?
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Pattern identified (max 50 chars)"}`,
  });
}

// ============ STOCK-SPECIFIC AI ANALYSTS ============

// Stock Fundamental Analyst - Analyzes P/E ratios, earnings, and valuation metrics
async function stockFundamentalAnalystVote(opts: {
  pct: number;
  krakenPair: string;
  symbol: string;
  ordersLeft: boolean;
  assetType?: string;
}): Promise<{ vote: boolean; reason: string } | null> {
  // Only run for stocks
  if (opts.assetType !== "stock") return null;
  
  return lovableAiVote({
    name: "stock-fundamental-analyst",
    model: "google/gemini-2.5-pro",
    systemPrompt: "You are a fundamental stock analyst expert in valuation metrics. Respond with valid JSON only.",
    userPrompt: `You are "Stock Fundamental Analyst" - an expert at analyzing company fundamentals, P/E ratios, and earnings.

Stock Data:
- Symbol: ${opts.symbol} (${opts.krakenPair})
- Today's price change: ${opts.pct.toFixed(2)}%
- Can place orders: ${opts.ordersLeft ? "Yes" : "No"}

Fundamental analysis framework:
- Consider typical P/E ranges for the sector (Tech: 20-40, Value: 10-20)
- Earnings growth expectations and recent reports
- Revenue trends and profit margins
- Price dips during good fundamentals = buying opportunity
- Overextended rallies on weak fundamentals = avoid

Based on fundamental analysis principles for ${opts.symbol}, should we BUY?
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Brief fundamental analysis (max 50 chars)"}`,
  });
}

// Stock Earnings Analyst - Focuses on earnings growth and surprises
async function stockEarningsAnalystVote(opts: {
  pct: number;
  krakenPair: string;
  symbol: string;
  ordersLeft: boolean;
  assetType?: string;
}): Promise<{ vote: boolean; reason: string } | null> {
  if (opts.assetType !== "stock") return null;
  
  return lovableAiVote({
    name: "stock-earnings-analyst",
    model: "google/gemini-2.5-flash",
    systemPrompt: "You are an earnings and growth analyst. Respond with valid JSON only.",
    userPrompt: `You are "Stock Earnings Analyst" - an expert at analyzing earnings growth, EPS trends, and earnings surprises.

Stock Data:
- Symbol: ${opts.symbol} (${opts.krakenPair})
- Today's price change: ${opts.pct.toFixed(2)}%
- Can place orders: ${opts.ordersLeft ? "Yes" : "No"}

Earnings analysis framework:
- Positive earnings surprises often lead to continued momentum
- Pre-earnings dips can be buying opportunities for strong companies
- Post-earnings selloffs on beats may indicate profit-taking
- YoY revenue and EPS growth trends matter
- Guidance raises are bullish signals

Based on typical earnings patterns for ${opts.symbol}, should we BUY?
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Brief earnings analysis (max 50 chars)"}`,
  });
}

// Stock Sector Rotation Analyst - Analyzes sector trends and rotation
async function stockSectorRotationVote(opts: {
  pct: number;
  krakenPair: string;
  symbol: string;
  ordersLeft: boolean;
  assetType?: string;
}): Promise<{ vote: boolean; reason: string } | null> {
  if (opts.assetType !== "stock") return null;
  
  return lovableAiVote({
    name: "stock-sector-rotation",
    model: "google/gemini-2.5-flash",
    systemPrompt: "You are a sector rotation and market cycle expert. Respond with valid JSON only.",
    userPrompt: `You are "Sector Rotation Analyst" - an expert at identifying sector trends and optimal rotation timing.

Stock Data:
- Symbol: ${opts.symbol} (${opts.krakenPair})
- Today's price change: ${opts.pct.toFixed(2)}%
- Can place orders: ${opts.ordersLeft ? "Yes" : "No"}

Sector rotation principles:
- Tech outperforms in low-rate environments
- Financials benefit from rising rates
- Defensive sectors (utilities, healthcare) during uncertainty
- Cyclicals (industrials, materials) in recovery phases
- Current macro environment favors certain sectors

Based on sector rotation analysis for ${opts.symbol}, should we BUY?
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Brief sector analysis (max 50 chars)"}`,
  });
}

// Institutional Flow Analyst - Tracks institutional buying/selling patterns
async function stockInstitutionalFlowVote(opts: {
  pct: number;
  krakenPair: string;
  symbol: string;
  ordersLeft: boolean;
  assetType?: string;
}): Promise<{ vote: boolean; reason: string } | null> {
  if (opts.assetType !== "stock") return null;
  
  return lovableAiVote({
    name: "stock-institutional-flow",
    model: "google/gemini-2.5-flash",
    systemPrompt: "You are an institutional flow and smart money expert. Respond with valid JSON only.",
    userPrompt: `You are "Institutional Flow Analyst" - an expert at tracking hedge fund, mutual fund, and insider activity.

Stock Data:
- Symbol: ${opts.symbol} (${opts.krakenPair})
- Today's price change: ${opts.pct.toFixed(2)}%
- Can place orders: ${opts.ordersLeft ? "Yes" : "No"}

Institutional flow analysis:
- Insider buying is a strong bullish signal
- 13F filings show institutional positioning
- Dark pool activity can indicate accumulation
- Options flow (unusual call buying) is bullish
- High short interest with positive momentum = potential squeeze

Based on typical institutional flow patterns for ${opts.symbol}, should we BUY?
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Brief institutional analysis (max 50 chars)"}`,
  });
}

// Options Flow AI - Monitors unusual options activity for trade signals
async function optionsFlowAnalystVote(opts: {
  pct: number;
  krakenPair: string;
  symbol: string;
  ordersLeft: boolean;
  assetType?: string;
}): Promise<{ vote: boolean; reason: string } | null> {
  // Options flow mainly relevant for stocks, but can inform crypto sentiment
  return lovableAiVote({
    name: "options-flow-analyst",
    model: "google/gemini-2.5-pro",
    systemPrompt: "You are an options flow expert specializing in unusual activity detection. Respond with valid JSON only.",
    userPrompt: `You are "Options Flow Analyst" - an expert at detecting unusual options activity that signals smart money moves.

Market Data:
- Symbol: ${opts.symbol} (${opts.krakenPair})
- Asset Type: ${opts.assetType || "crypto"}
- Today's price change: ${opts.pct.toFixed(2)}%
- Can place orders: ${opts.ordersLeft ? "Yes" : "No"}

Options flow signals to analyze:
- Unusual call volume = bullish institutional bets
- Large block trades = smart money positioning
- Call/Put ratio spikes indicate sentiment shifts
- Sweep orders (aggressive buying) = urgent positioning
- Near-expiry high volume = imminent move expected
- Dark pool prints can precede large moves

${opts.assetType === "stock" 
  ? "For stocks: Watch for earnings-related options positioning, sector ETF flows"
  : "For crypto: Watch for related stock options (MSTR, COIN, miners) as leading indicators"}

Based on typical options flow patterns, should we BUY?
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Brief options flow analysis (max 50 chars)"}`,
  });
}

// ============ HIGH-FREQUENCY MICRO-TRADING ALGORITHMS ============

// Micro-Scalper AI - Optimized for tiny consistent gains (0.1%-0.5%)
async function microScalperVote(opts: {
  pct: number;
  krakenPair: string;
  symbol: string;
  ordersLeft: boolean;
  ohlc: { high: number; low: number; volume: number };
  assetType?: string;
}): Promise<{ vote: boolean; reason: string } | null> {
  const spread = opts.ohlc.high > 0 && opts.ohlc.low > 0 
    ? ((opts.ohlc.high - opts.ohlc.low) / opts.ohlc.low * 100).toFixed(3) 
    : "0";

  return lovableAiVote({
    name: "micro-scalper",
    model: "google/gemini-2.5-flash",
    systemPrompt: "You are a high-frequency micro-scalping expert. Focus on tiny, consistent gains. Respond with valid JSON only.",
    userPrompt: `You are "Micro-Scalper AI" - optimized for tiny consistent gains (0.1%-0.5%) to compound toward $10M.

Market Data:
- Asset: ${opts.symbol} (${opts.krakenPair})
- Type: ${opts.assetType || "crypto"}
- Today's change: ${opts.pct.toFixed(3)}%
- 24h Spread: ${spread}%
- Volume: ${opts.ohlc.volume.toFixed(2)}
- Can trade: ${opts.ordersLeft ? "Yes" : "No"}

MICRO-SCALPING RULES (0.1%-0.5% targets):
- HIGH liquidity required (volume > average)
- TIGHT spreads only (< 0.3% spread optimal)
- Quick in-and-out: 1-5 minute holds
- Any micro-dip (-0.05% to -0.2%) = BUY opportunity
- Momentum continuation (+0.1% to +0.3%) = ride the wave
- AVOID: High volatility (>2%), low volume, wide spreads

Goal: Compound small gains. 0.2% per trade x 50 trades/day = 10%/day = $10M in months.

Is this a good MICRO-SCALP entry?
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Brief micro-scalp analysis (max 50 chars)"}`,
  });
}

// Penny Stock Hunter AI - Specialized for low-priced volatile assets
async function pennyStockHunterVote(opts: {
  pct: number;
  krakenPair: string;
  symbol: string;
  ordersLeft: boolean;
  ohlc: { high: number; low: number; volume: number };
  assetType?: string;
}): Promise<{ vote: boolean; reason: string } | null> {
  const volatility = opts.ohlc.high > 0 && opts.ohlc.low > 0 
    ? ((opts.ohlc.high - opts.ohlc.low) / opts.ohlc.low * 100).toFixed(2) 
    : "0";

  return lovableAiVote({
    name: "penny-stock-hunter",
    model: "google/gemini-2.5-flash",
    systemPrompt: "You are a penny stock and micro-cap specialist. Respond with valid JSON only.",
    userPrompt: `You are "Penny Stock Hunter AI" - specialist in low-priced, high-volatility assets for quick gains.

Market Data:
- Asset: ${opts.symbol} (${opts.krakenPair})
- Type: ${opts.assetType || "crypto"}
- Today's change: ${opts.pct.toFixed(2)}%
- 24h Volatility: ${volatility}%
- Volume: ${opts.ohlc.volume.toFixed(2)}
- Can trade: ${opts.ordersLeft ? "Yes" : "No"}

PENNY STOCK / MICRO-CAP RULES:
- Look for oversold bounces (big dips = buy)
- Volume spikes indicate breakout potential
- Meme potential (GME, SHIB, PEPE patterns)
- Quick 5-20% swings are common
- Enter on consolidation, exit on pump
- Small positions, high frequency

For crypto: DOGE, SHIB, PEPE, BONK, FLOKI are "penny" equivalents
For stocks: Low-float, high short interest = squeeze potential

Is this a good quick-trade opportunity?
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Brief penny analysis (max 50 chars)"}`,
  });
}

// ETF Momentum Rider AI - Specialized for ETF trading patterns
async function etfMomentumRiderVote(opts: {
  pct: number;
  krakenPair: string;
  symbol: string;
  ordersLeft: boolean;
  ohlc: { high: number; low: number; volume: number };
  assetType?: string;
}): Promise<{ vote: boolean; reason: string } | null> {
  // ETFs have specific ticker patterns
  const etfSymbols = ["SPY", "QQQ", "IWM", "VTI", "VOO", "ARKK", "TQQQ", "GLD", "TBLL"];
  const isEtf = etfSymbols.includes(opts.symbol);
  
  return lovableAiVote({
    name: "etf-momentum-rider",
    model: "google/gemini-2.5-flash",
    systemPrompt: "You are an ETF momentum trading specialist. Respond with valid JSON only.",
    userPrompt: `You are "ETF Momentum Rider AI" - specialist in riding ETF momentum for consistent gains.

Market Data:
- Asset: ${opts.symbol} (${opts.krakenPair})
- Is ETF: ${isEtf ? "Yes" : "No (apply ETF-style analysis)"}
- Today's change: ${opts.pct.toFixed(2)}%
- 24h High: $${opts.ohlc.high.toFixed(2)}
- 24h Low: $${opts.ohlc.low.toFixed(2)}
- Can trade: ${opts.ordersLeft ? "Yes" : "No"}

ETF MOMENTUM RULES:
- SPY/QQQ lead the market - follow their direction
- TQQQ (3x leverage) amplifies gains but also losses
- Sector rotation: Follow money flow between sectors
- Buy dips in uptrends, sell rips in downtrends
- End-of-day momentum often continues next morning
- ARKK leads innovation/growth sentiment

${isEtf ? "This IS an ETF - apply full ETF analysis" : "Apply ETF-style momentum analysis to this asset"}

Is this a good momentum entry?
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Brief ETF momentum analysis (max 50 chars)"}`,
  });
}

// Compound Growth Calculator AI - Focuses on path to $10M goal
async function compoundGrowthVote(opts: {
  pct: number;
  krakenPair: string;
  symbol: string;
  ordersLeft: boolean;
  assetType?: string;
}): Promise<{ vote: boolean; reason: string } | null> {
  return lovableAiVote({
    name: "compound-growth-calculator",
    model: "google/gemini-2.5-flash",
    systemPrompt: "You are a compound growth optimization expert focused on reaching $10M. Respond with valid JSON only.",
    userPrompt: `You are "Compound Growth AI" - focused on optimizing every trade to compound toward $10M.

Market Data:
- Asset: ${opts.symbol} (${opts.krakenPair})
- Type: ${opts.assetType || "crypto"}
- Today's change: ${opts.pct.toFixed(2)}%
- Can trade: ${opts.ordersLeft ? "Yes" : "No"}

COMPOUND GROWTH STRATEGY TO $10M:
- Start: Assume current portfolio
- Target: Consistent 0.5-2% gains per trade
- Frequency: Multiple trades per day
- Risk: Never risk more than 2% of portfolio per trade
- Compounding math: 1% daily = 37x annual, 2% daily = 1377x annual

TRADE QUALITY SCORING:
- High probability setups only (>60% expected win rate)
- Favorable risk/reward (>2:1 preferred)
- Quick execution (scalp-friendly conditions)
- Low slippage (high volume assets)

Does this trade advance our path to $10M efficiently?
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Brief compound analysis (max 50 chars)"}`,
  });
}

// Perplexity Real-Time News Search - Gets live market news for sentiment (stocks & crypto)
async function perplexityNewsVote(opts: {
  pct: number;
  krakenPair: string;
  symbol: string;
  ordersLeft: boolean;
  assetType?: string;
}): Promise<{ vote: boolean; reason: string } | null> {
  const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
  if (!PERPLEXITY_API_KEY) {
    console.log("[perplexity-news] No PERPLEXITY_API_KEY configured");
    return null;
  }

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15000);

    const isStock = opts.assetType === "stock";
    const searchQuery = isStock
      ? `${opts.symbol} stock news today earnings market sentiment`
      : `${opts.symbol} ${opts.krakenPair.replace("USD", "")} crypto news today market sentiment`;
    
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: "You are a financial news analyst covering both stocks and cryptocurrency. Search for recent news and provide a trading recommendation. Respond with valid JSON only." },
          { role: "user", content: isStock 
            ? `Search for the latest news about ${opts.symbol} stock (${opts.krakenPair}). 
            
Based on today's news sentiment:
- Price is currently ${opts.pct >= 0 ? "up" : "down"} ${Math.abs(opts.pct).toFixed(2)}%
- Can we place orders: ${opts.ordersLeft ? "Yes" : "No"}
- Consider: earnings reports, analyst ratings, SEC filings, market news

Analyze the stock news sentiment and recommend: should we BUY now?
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Brief news-based reason (max 50 chars)"}`
            : `Search for the latest news about ${opts.symbol} and Bitcoin (${opts.krakenPair}). 
          
Based on today's news sentiment:
- Price is currently ${opts.pct >= 0 ? "up" : "down"} ${Math.abs(opts.pct).toFixed(2)}%
- Can we place orders: ${opts.ordersLeft ? "Yes" : "No"}

Analyze the news sentiment and recommend: should we BUY now?
Respond with ONLY JSON: {"vote":"YES" or "NO","reason":"Brief news-based reason (max 50 chars)"}` }
        ],
        search_recency_filter: "day", // Only last 24 hours
      }),
    });
    clearTimeout(t);

    if (!response.ok) {
      console.log(`[perplexity-news] API error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";
    let jsonStr = content.trim();
    
    // Extract JSON from response
    if (jsonStr.includes("```")) {
      const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) jsonStr = match[1].trim();
    }
    // Try to find JSON object in text
    const jsonMatch = jsonStr.match(/\{[\s\S]*?"vote"[\s\S]*?\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];

    const parsed = JSON.parse(jsonStr) as { vote?: string; reason?: string };
    if (!parsed?.vote) return null;

    const vote = String(parsed.vote).toUpperCase() === "YES";
    const reason = (parsed.reason || "Live news analysis").slice(0, 50);
    console.log(`[perplexity-news] Vote: ${vote ? "YES" : "NO"}, Reason: ${reason}`);
    return { vote, reason };
  } catch (e) {
    console.log(`[perplexity-news] Error: ${e instanceof Error ? e.message : "unknown"}`);
    return null;
  }
}


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

async function lovableAiStrategistVote(opts: {
  context: { pct: number; krakenPair: string; symbol: string; ordersLeft: boolean };
}): Promise<{ vote: boolean; reason: string } | null> {
  try {
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      console.log("[lovable-strategist] No LOVABLE_API_KEY configured");
      return null;
    }

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 10000);
    
    const prompt = `You are a conservative crypto trading assistant. Vote YES or NO for placing a small market BUY order.
Return ONLY valid JSON: {"vote":"YES"|"NO","reason":"max 50 chars"}

Context:
- Pair: ${opts.context.krakenPair}
- Price change today: ${opts.context.pct.toFixed(2)}%
- Symbol: ${opts.context.symbol}
- Orders remaining today: ${opts.context.ordersLeft}

Rules:
- Vote NO if volatility is high (>5% move) or ordersLeft is false
- Vote YES only on mild dips (-1% to -3%) with stable conditions
- Be conservative - when in doubt, vote NO`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a conservative trading assistant. Respond with valid JSON only, no markdown." },
          { role: "user", content: prompt },
        ],
      }),
    });
    clearTimeout(t);
    
    if (!r.ok) {
      console.log(`[lovable-strategist] API error: ${r.status}`);
      return null;
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content || "";
    let jsonStr = content.trim();
    
    // Clean markdown if present
    if (jsonStr.includes("```")) {
      const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) jsonStr = match[1].trim();
    }
    
    const parsed = JSON.parse(jsonStr) as { vote?: string; reason?: string };
    if (!parsed?.vote) return null;
    
    const vote = String(parsed.vote).toUpperCase() === "YES";
    const reason = typeof parsed.reason === "string" ? parsed.reason.slice(0, 50) : "Lovable AI vote";
    console.log(`[lovable-strategist] Vote: ${vote ? "YES" : "NO"}, Reason: ${reason}`);
    return { vote, reason };
  } catch (e) {
    console.log(`[lovable-strategist] Error: ${e instanceof Error ? e.message : "unknown"}`);
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

// Place BUY order on Kraken
async function krakenPlaceOrder(opts: {
  krakenKey: string;
  krakenSecret: string;
  pair: string;
  volumeUsd: number;
}): Promise<{ txid: string[]; price: number; volume: number }> {
  const nonce = Date.now().toString();
  const path = "/0/private/AddOrder";
  
  // Get current price to calculate volume
  const tickerRes = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${opts.pair}`);
  const tickerData = await tickerRes.json() as { result?: Record<string, { c?: string[] }> };
  const ticker = tickerData.result ? Object.values(tickerData.result)[0] : null;
  const currentPrice = ticker?.c?.[0] ? Number(ticker.c[0]) : 0;
  
  if (!currentPrice) throw new Error("Could not fetch current price");
  
  // Calculate volume based on USD amount (minimum order varies by pair)
  const volume = opts.volumeUsd / currentPrice;
  const volumeStr = volume.toFixed(8);
  
  const params = new URLSearchParams({
    nonce,
    ordertype: "market",
    type: "buy",
    volume: volumeStr,
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
  
  return { txid: data.result?.txid || [], price: currentPrice, volume };
}

// Place SELL order on Kraken
async function krakenPlaceSellOrder(opts: {
  krakenKey: string;
  krakenSecret: string;
  pair: string;
  volume: number;
}): Promise<{ txid: string[]; price: number }> {
  const nonce = Date.now().toString();
  const path = "/0/private/AddOrder";
  
  // Get current price
  const tickerRes = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${opts.pair}`);
  const tickerData = await tickerRes.json() as { result?: Record<string, { c?: string[] }> };
  const ticker = tickerData.result ? Object.values(tickerData.result)[0] : null;
  const currentPrice = ticker?.c?.[0] ? Number(ticker.c[0]) : 0;
  
  if (!currentPrice) throw new Error("Could not fetch current price for sell");
  
  const params = new URLSearchParams({
    nonce,
    ordertype: "market",
    type: "sell",
    volume: opts.volume.toFixed(8),
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
  
  console.log(`[bot-tick] Sell order placed: ${opts.volume} ${opts.pair} @ $${currentPrice}`);
  
  return { txid: data.result?.txid || [], price: currentPrice };
}

// Position type for tracking open trades
interface Position {
  id: string;
  user_id: string;
  symbol: string;
  pair: string;
  side: string;
  quantity: number;
  entry_price: number;
  current_price?: number;
  unrealized_pnl?: number;
  unrealized_pnl_percent?: number;
  take_profit_percent?: number;
  stop_loss_percent?: number;
  trailing_stop_enabled?: boolean;
  high_water_mark?: number;
  trailing_stop_price?: number;
  status: string;
  entry_txid?: string;
  exit_txid?: string;
  exit_price?: number;
  realized_pnl?: number;
}

// Check positions and execute take-profit/stop-loss/trailing-stop
async function checkAndClosePositions(opts: {
  supabaseAdmin: any;
  userId: string;
  krakenKey: string;
  krakenSecret: string;
  allowLive: boolean;
  trailingStopPercent?: number;
}): Promise<{ closed: number; messages: string[] }> {
  const messages: string[] = [];
  let closed = 0;

  // Get open positions for user
  const { data: positionsData, error } = await opts.supabaseAdmin
    .from("positions")
    .select("*")
    .eq("user_id", opts.userId)
    .eq("status", "open");

  if (error || !positionsData || positionsData.length === 0) {
    return { closed: 0, messages: [] };
  }

  const positions = positionsData as unknown as Position[];

  for (const position of positions) {
    try {
      // Get current price
      const tickerRes = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${position.pair}`);
      const tickerData = await tickerRes.json() as { result?: Record<string, { c?: string[] }> };
      const ticker = tickerData.result ? Object.values(tickerData.result)[0] : null;
      const currentPrice = ticker?.c?.[0] ? Number(ticker.c[0]) : 0;

      if (!currentPrice) continue;

      const entryPrice = Number(position.entry_price);
      const quantity = Number(position.quantity);
      const takeProfitPercent = Number(position.take_profit_percent || 10);
      const stopLossPercent = Number(position.stop_loss_percent || 5);
      const trailingEnabled = position.trailing_stop_enabled || false;
      const trailingPercent = opts.trailingStopPercent || 3;

      // Calculate P&L
      const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
      const unrealizedPnl = (currentPrice - entryPrice) * quantity;

      // Trailing stop logic: update high water mark and trailing stop price
      let highWaterMark = position.high_water_mark ? Number(position.high_water_mark) : entryPrice;
      let trailingStopPrice = position.trailing_stop_price ? Number(position.trailing_stop_price) : null;

      if (trailingEnabled && currentPrice > highWaterMark) {
        // New high reached - update high water mark and trailing stop
        highWaterMark = currentPrice;
        trailingStopPrice = currentPrice * (1 - trailingPercent / 100);
        console.log(`[${position.symbol}] New high: $${highWaterMark.toFixed(2)}, trailing stop: $${trailingStopPrice.toFixed(2)}`);
      }

      // Update current price, P&L, and trailing stop data
      await (opts.supabaseAdmin
        .from("positions") as any)
        .update({
          current_price: currentPrice,
          unrealized_pnl: unrealizedPnl,
          unrealized_pnl_percent: pnlPercent,
          high_water_mark: highWaterMark,
          trailing_stop_price: trailingStopPrice,
          updated_at: new Date().toISOString(),
        })
        .eq("id", position.id);

      // Check take-profit condition
      if (pnlPercent >= takeProfitPercent) {
        if (opts.allowLive) {
          const sellResult = await krakenPlaceSellOrder({
            krakenKey: opts.krakenKey,
            krakenSecret: opts.krakenSecret,
            pair: position.pair,
            volume: quantity,
          });

          const realizedPnl = (sellResult.price - entryPrice) * quantity;

          await (opts.supabaseAdmin
            .from("positions") as any)
            .update({
              status: "closed",
              exit_price: sellResult.price,
              exit_txid: sellResult.txid.join(","),
              realized_pnl: realizedPnl,
              closed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", position.id);

          messages.push(`🎯 TAKE PROFIT: Sold ${position.symbol} @ $${sellResult.price.toFixed(2)} (+${pnlPercent.toFixed(2)}%) • P&L: $${realizedPnl.toFixed(2)}`);
          closed++;
        } else {
          messages.push(`📊 Take profit target hit for ${position.symbol} (+${pnlPercent.toFixed(2)}%) - live trading disabled`);
        }
      }
      // Check trailing stop condition (triggers when price drops below trailing stop price)
      else if (trailingEnabled && trailingStopPrice && currentPrice <= trailingStopPrice) {
        const lockedInGain = ((trailingStopPrice - entryPrice) / entryPrice) * 100;
        if (opts.allowLive) {
          const sellResult = await krakenPlaceSellOrder({
            krakenKey: opts.krakenKey,
            krakenSecret: opts.krakenSecret,
            pair: position.pair,
            volume: quantity,
          });

          const realizedPnl = (sellResult.price - entryPrice) * quantity;

          await (opts.supabaseAdmin
            .from("positions") as any)
            .update({
              status: "closed",
              exit_price: sellResult.price,
              exit_txid: sellResult.txid.join(","),
              realized_pnl: realizedPnl,
              closed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", position.id);

          messages.push(`📈 TRAILING STOP: Sold ${position.symbol} @ $${sellResult.price.toFixed(2)} (peaked at $${highWaterMark.toFixed(2)}) • P&L: $${realizedPnl.toFixed(2)}`);
          closed++;
        } else {
          messages.push(`📈 Trailing stop triggered for ${position.symbol} at $${currentPrice.toFixed(2)} (peak: $${highWaterMark.toFixed(2)}, locked: +${lockedInGain.toFixed(2)}%) - live trading disabled`);
        }
      }
      // Check regular stop-loss condition
      else if (pnlPercent <= -stopLossPercent) {
        if (opts.allowLive) {
          const sellResult = await krakenPlaceSellOrder({
            krakenKey: opts.krakenKey,
            krakenSecret: opts.krakenSecret,
            pair: position.pair,
            volume: quantity,
          });

          const realizedPnl = (sellResult.price - entryPrice) * quantity;

          await (opts.supabaseAdmin
            .from("positions") as any)
            .update({
              status: "closed",
              exit_price: sellResult.price,
              exit_txid: sellResult.txid.join(","),
              realized_pnl: realizedPnl,
              closed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", position.id);

          messages.push(`🛑 STOP LOSS: Sold ${position.symbol} @ $${sellResult.price.toFixed(2)} (${pnlPercent.toFixed(2)}%) • P&L: $${realizedPnl.toFixed(2)}`);
          closed++;
        } else {
          messages.push(`⚠️ Stop loss triggered for ${position.symbol} (${pnlPercent.toFixed(2)}%) - live trading disabled`);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "position check failed";
      messages.push(`Error checking ${position.symbol}: ${msg}`);
    }
  }

  return { closed, messages };
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
    const defaultSymbol = (Deno.env.get("BOT_DEFAULT_SYMBOL") || "BTC").toUpperCase();
    const notionalUsd = Number(Deno.env.get("BOT_MAX_NOTIONAL_USD") || "50"); // $50 per trade
    const maxOrdersPerDay = Number(Deno.env.get("BOT_MAX_ORDERS_PER_DAY") || "100"); // More trades allowed
    
    // All available Kraken trading pairs - Crypto + xStocks (Tokenized Stocks & ETFs)
    // COMPREHENSIVE LIST: 250+ Crypto + 200+ Stocks/ETFs
    const tradingPairs = [
      // ============ CRYPTO - Major coins (Top 20) ============
      { pair: "XBTUSD", symbol: "BTC", name: "Bitcoin", type: "crypto" },
      { pair: "ETHUSD", symbol: "ETH", name: "Ethereum", type: "crypto" },
      { pair: "SOLUSD", symbol: "SOL", name: "Solana", type: "crypto" },
      { pair: "XRPUSD", symbol: "XRP", name: "XRP", type: "crypto" },
      { pair: "ADAUSD", symbol: "ADA", name: "Cardano", type: "crypto" },
      { pair: "DOTUSD", symbol: "DOT", name: "Polkadot", type: "crypto" },
      { pair: "AVAXUSD", symbol: "AVAX", name: "Avalanche", type: "crypto" },
      { pair: "LINKUSD", symbol: "LINK", name: "Chainlink", type: "crypto" },
      { pair: "LTCUSD", symbol: "LTC", name: "Litecoin", type: "crypto" },
      { pair: "BCHUSD", symbol: "BCH", name: "Bitcoin Cash", type: "crypto" },
      { pair: "TRXUSD", symbol: "TRX", name: "TRON", type: "crypto" },
      { pair: "TONUSD", symbol: "TON", name: "Toncoin", type: "crypto" },
      { pair: "SHIBAUSD", symbol: "SHIB", name: "Shiba Inu", type: "crypto" },
      { pair: "LEOUSD", symbol: "LEO", name: "UNUS SED LEO", type: "crypto" },
      { pair: "DAIUSD", symbol: "DAI", name: "Dai", type: "crypto" },
      { pair: "WBTCUSD", symbol: "WBTC", name: "Wrapped Bitcoin", type: "crypto" },
      { pair: "ETCUSD", symbol: "ETC", name: "Ethereum Classic", type: "crypto" },
      { pair: "UNIUSD", symbol: "UNI", name: "Uniswap", type: "crypto" },
      { pair: "OKBUSD", symbol: "OKB", name: "OKB", type: "crypto" },
      { pair: "CROUSD", symbol: "CRO", name: "Cronos", type: "crypto" },
      
      // ============ Layer 1 & Layer 2 ============
      { pair: "ATOMUSD", symbol: "ATOM", name: "Cosmos", type: "crypto" },
      { pair: "NEARUSD", symbol: "NEAR", name: "NEAR Protocol", type: "crypto" },
      { pair: "APTUSD", symbol: "APT", name: "Aptos", type: "crypto" },
      { pair: "SUIUSD", symbol: "SUI", name: "Sui", type: "crypto" },
      { pair: "ICPUSD", symbol: "ICP", name: "Internet Computer", type: "crypto" },
      { pair: "ALGOUSD", symbol: "ALGO", name: "Algorand", type: "crypto" },
      { pair: "XLMUSD", symbol: "XLM", name: "Stellar", type: "crypto" },
      { pair: "HBARUSD", symbol: "HBAR", name: "Hedera", type: "crypto" },
      { pair: "VETUSD", symbol: "VET", name: "VeChain", type: "crypto" },
      { pair: "FILUSD", symbol: "FIL", name: "Filecoin", type: "crypto" },
      { pair: "EGLDUSD", symbol: "EGLD", name: "MultiversX", type: "crypto" },
      { pair: "EOSUSD", symbol: "EOS", name: "EOS", type: "crypto" },
      { pair: "XTZUSD", symbol: "XTZ", name: "Tezos", type: "crypto" },
      { pair: "FLOWUSD", symbol: "FLOW", name: "Flow", type: "crypto" },
      { pair: "MINAUSD", symbol: "MINA", name: "Mina", type: "crypto" },
      { pair: "KASUSD", symbol: "KAS", name: "Kaspa", type: "crypto" },
      { pair: "SEIUSD", symbol: "SEI", name: "Sei", type: "crypto" },
      { pair: "INJUSD", symbol: "INJ", name: "Injective", type: "crypto" },
      { pair: "TIAUSD", symbol: "TIA", name: "Celestia", type: "crypto" },
      { pair: "ARBUSD", symbol: "ARB", name: "Arbitrum", type: "crypto" },
      { pair: "OPUSD", symbol: "OP", name: "Optimism", type: "crypto" },
      { pair: "MATICUSD", symbol: "MATIC", name: "Polygon", type: "crypto" },
      { pair: "IMXUSD", symbol: "IMX", name: "Immutable X", type: "crypto" },
      { pair: "MANTUSD", symbol: "MANT", name: "Mantle", type: "crypto" },
      { pair: "STXUSD", symbol: "STX", name: "Stacks", type: "crypto" },
      { pair: "ZKSYNUSD", symbol: "ZK", name: "zkSync", type: "crypto" },
      { pair: "BLASTUSD", symbol: "BLAST", name: "Blast", type: "crypto" },
      { pair: "MODEUSD", symbol: "MODE", name: "Mode", type: "crypto" },
      { pair: "SCUSD", symbol: "SC", name: "Siacoin", type: "crypto" },
      { pair: "ARUSD", symbol: "AR", name: "Arweave", type: "crypto" },
      { pair: "ROSEUSD", symbol: "ROSE", name: "Oasis Network", type: "crypto" },
      { pair: "FTMUSD", symbol: "FTM", name: "Fantom", type: "crypto" },
      { pair: "ONEUSDUSD", symbol: "ONE", name: "Harmony", type: "crypto" },
      { pair: "IOTAUSD", symbol: "IOTA", name: "IOTA", type: "crypto" },
      { pair: "NEOUSUSD", symbol: "NEO", name: "Neo", type: "crypto" },
      { pair: "WAVESUSD", symbol: "WAVES", name: "Waves", type: "crypto" },
      { pair: "ZILUSD", symbol: "ZIL", name: "Zilliqa", type: "crypto" },
      { pair: "QTUMUMD", symbol: "QTUM", name: "Qtum", type: "crypto" },
      { pair: "ICXUSD", symbol: "ICX", name: "ICON", type: "crypto" },
      { pair: "IOTXUSD", symbol: "IOTX", name: "IoTeX", type: "crypto" },
      { pair: "ONTUSD", symbol: "ONT", name: "Ontology", type: "crypto" },
      { pair: "SCRTUSDD", symbol: "SCRT", name: "Secret", type: "crypto" },
      { pair: "CELOUSD", symbol: "CELO", name: "Celo", type: "crypto" },
      { pair: "CKBUSD", symbol: "CKB", name: "Nervos Network", type: "crypto" },
      { pair: "CFXUSD", symbol: "CFX", name: "Conflux", type: "crypto" },
      
      // ============ DeFi ============
      { pair: "AAVEUSD", symbol: "AAVE", name: "Aave", type: "crypto" },
      { pair: "MKRUSD", symbol: "MKR", name: "Maker", type: "crypto" },
      { pair: "SNXUSD", symbol: "SNX", name: "Synthetix", type: "crypto" },
      { pair: "CRVUSD", symbol: "CRV", name: "Curve", type: "crypto" },
      { pair: "COMPUSD", symbol: "COMP", name: "Compound", type: "crypto" },
      { pair: "LDOUSD", symbol: "LDO", name: "Lido DAO", type: "crypto" },
      { pair: "SUSHIUSD", symbol: "SUSHI", name: "SushiSwap", type: "crypto" },
      { pair: "1INCHUSD", symbol: "1INCH", name: "1inch", type: "crypto" },
      { pair: "BALUSD", symbol: "BAL", name: "Balancer", type: "crypto" },
      { pair: "YFIUSD", symbol: "YFI", name: "yearn.finance", type: "crypto" },
      { pair: "GMXUSD", symbol: "GMX", name: "GMX", type: "crypto" },
      { pair: "DYDXUSD", symbol: "DYDX", name: "dYdX", type: "crypto" },
      { pair: "PNDUSD", symbol: "PENDLE", name: "Pendle", type: "crypto" },
      { pair: "JUPUSD", symbol: "JUP", name: "Jupiter", type: "crypto" },
      { pair: "RAYUSD", symbol: "RAY", name: "Raydium", type: "crypto" },
      { pair: "ORCAUSD", symbol: "ORCA", name: "Orca", type: "crypto" },
      { pair: "OSMUSD", symbol: "OSMO", name: "Osmosis", type: "crypto" },
      { pair: "RPLUSUSD", symbol: "RPL", name: "Rocket Pool", type: "crypto" },
      { pair: "SSAUSD", symbol: "SSV", name: "ssv.network", type: "crypto" },
      { pair: "CVXUSD", symbol: "CVX", name: "Convex Finance", type: "crypto" },
      { pair: "FXSUSD", symbol: "FXS", name: "Frax Share", type: "crypto" },
      { pair: "SPEUSD", symbol: "SPELL", name: "Spell Token", type: "crypto" },
      { pair: "ALPHAUSD", symbol: "ALPHA", name: "Alpha Venture DAO", type: "crypto" },
      { pair: "BANDUSD", symbol: "BAND", name: "Band Protocol", type: "crypto" },
      { pair: "UMAUSD", symbol: "UMA", name: "UMA", type: "crypto" },
      { pair: "BADGUSD", symbol: "BADGER", name: "Badger DAO", type: "crypto" },
      { pair: "LOOMUSD", symbol: "LOOM", name: "Loom Network", type: "crypto" },
      { pair: "STORJUSD", symbol: "STORJ", name: "Storj", type: "crypto" },
      
      // ============ AI & Data ============
      { pair: "FETUSD", symbol: "FET", name: "Fetch.ai", type: "crypto" },
      { pair: "GRTUSD", symbol: "GRT", name: "The Graph", type: "crypto" },
      { pair: "RENDERUSD", symbol: "RNDR", name: "Render", type: "crypto" },
      { pair: "OCEANUSD", symbol: "OCEAN", name: "Ocean Protocol", type: "crypto" },
      { pair: "AKTUSD", symbol: "AKT", name: "Akash Network", type: "crypto" },
      { pair: "TAOUSD", symbol: "TAO", name: "Bittensor", type: "crypto" },
      { pair: "WLDUSD", symbol: "WLD", name: "Worldcoin", type: "crypto" },
      { pair: "AGIUSD", symbol: "AGIX", name: "SingularityNET", type: "crypto" },
      { pair: "NMRUSD", symbol: "NMR", name: "Numeraire", type: "crypto" },
      { pair: "RLCUSD", symbol: "RLC", name: "iExec RLC", type: "crypto" },
      { pair: "AI16ZUSD", symbol: "AI16Z", name: "ai16z", type: "crypto" },
      { pair: "VIRTUSD", symbol: "VIRTUAL", name: "Virtuals Protocol", type: "crypto" },
      { pair: "AIOZUSD", symbol: "AIOZ", name: "AIOZ Network", type: "crypto" },
      { pair: "ARKMUSD", symbol: "ARKM", name: "Arkham", type: "crypto" },
      { pair: "PHAUSD", symbol: "PHA", name: "Phala Network", type: "crypto" },
      
      // ============ Gaming & Metaverse ============
      { pair: "MANAUSD", symbol: "MANA", name: "Decentraland", type: "crypto" },
      { pair: "SANDUSD", symbol: "SAND", name: "The Sandbox", type: "crypto" },
      { pair: "AXSUSD", symbol: "AXS", name: "Axie Infinity", type: "crypto" },
      { pair: "GALAUSD", symbol: "GALA", name: "Gala", type: "crypto" },
      { pair: "ENJUSD", symbol: "ENJ", name: "Enjin Coin", type: "crypto" },
      { pair: "APEUSD", symbol: "APE", name: "ApeCoin", type: "crypto" },
      { pair: "RONUSD", symbol: "RON", name: "Ronin", type: "crypto" },
      { pair: "ILUVSD", symbol: "ILV", name: "Illuvium", type: "crypto" },
      { pair: "YOOUSD", symbol: "YGG", name: "Yield Guild Games", type: "crypto" },
      { pair: "SLPUSD", symbol: "SLP", name: "Smooth Love Potion", type: "crypto" },
      { pair: "ALICEUSD", symbol: "ALICE", name: "MyNeighborAlice", type: "crypto" },
      { pair: "PRMEUSD", symbol: "PRIME", name: "Echelon Prime", type: "crypto" },
      { pair: "PIUSD", symbol: "PIXL", name: "Pixels", type: "crypto" },
      { pair: "BEAMUSD", symbol: "BEAM", name: "Beam", type: "crypto" },
      { pair: "MAGICUSD", symbol: "MAGIC", name: "MAGIC", type: "crypto" },
      { pair: "GMTUSD", symbol: "GMT", name: "STEPN", type: "crypto" },
      { pair: "ATLASUSD", symbol: "ATLAS", name: "Star Atlas", type: "crypto" },
      { pair: "POLISUSD", symbol: "POLIS", name: "Star Atlas DAO", type: "crypto" },
      { pair: "HIGUSD", symbol: "HIFI", name: "Hifi Finance", type: "crypto" },
      { pair: "RAREUSD", symbol: "RARE", name: "SuperRare", type: "crypto" },
      { pair: "NFTUSD", symbol: "NFT", name: "APENFT", type: "crypto" },
      
      // ============ Meme Coins ============
      { pair: "DOGEUSD", symbol: "DOGE", name: "Dogecoin", type: "crypto" },
      { pair: "SHIBUSD", symbol: "SHIB", name: "Shiba Inu", type: "crypto" },
      { pair: "PEPEUSD", symbol: "PEPE", name: "Pepe", type: "crypto" },
      { pair: "FLOKIUSD", symbol: "FLOKI", name: "Floki", type: "crypto" },
      { pair: "BONKUSD", symbol: "BONK", name: "Bonk", type: "crypto" },
      { pair: "WIFUSD", symbol: "WIF", name: "dogwifhat", type: "crypto" },
      { pair: "MEMUSD", symbol: "MEME", name: "Memecoin", type: "crypto" },
      { pair: "COQINUSD", symbol: "COQ", name: "Coq Inu", type: "crypto" },
      { pair: "PNUTUSD", symbol: "PNUT", name: "Peanut the Squirrel", type: "crypto" },
      { pair: "POPCATUSD", symbol: "POPCAT", name: "Popcat", type: "crypto" },
      { pair: "MOGUSD", symbol: "MOG", name: "Mog Coin", type: "crypto" },
      { pair: "GOATUSD", symbol: "GOAT", name: "Goatseus Maximus", type: "crypto" },
      { pair: "GIGAUSD", symbol: "GIGA", name: "Gigachad", type: "crypto" },
      { pair: "NEIROUSD", symbol: "NEIRO", name: "Neiro", type: "crypto" },
      { pair: "SPXUSD", symbol: "SPX", name: "SPX6900", type: "crypto" },
      { pair: "BABYDOGEUSD", symbol: "BABYDOGE", name: "Baby Doge Coin", type: "crypto" },
      { pair: "LADYSUSD", symbol: "LADYS", name: "Milady Meme Coin", type: "crypto" },
      { pair: "TURBOUSD", symbol: "TURBO", name: "Turbo", type: "crypto" },
      { pair: "ELONUSD", symbol: "ELON", name: "Dogelon Mars", type: "crypto" },
      { pair: "SAFEMOONUSD", symbol: "SAFEMOON", name: "SafeMoon", type: "crypto" },
      { pair: "AKITAUSD", symbol: "AKITA", name: "Akita Inu", type: "crypto" },
      { pair: "KISHUUSD", symbol: "KISHU", name: "Kishu Inu", type: "crypto" },
      { pair: "HPOSEXUSD", symbol: "HPOS10I", name: "Bitcoin HPos", type: "crypto" },
      { pair: "SPONUSD", symbol: "SPONGE", name: "Sponge", type: "crypto" },
      { pair: "BLURUSD", symbol: "BLUR", name: "Blur", type: "crypto" },
      
      // ============ Privacy & Misc ============
      { pair: "XMRUSD", symbol: "XMR", name: "Monero", type: "crypto" },
      { pair: "ZECUSD", symbol: "ZEC", name: "Zcash", type: "crypto" },
      { pair: "DASHUSD", symbol: "DASH", name: "Dash", type: "crypto" },
      { pair: "PAXGUSD", symbol: "PAXG", name: "PAX Gold", type: "crypto" },
      { pair: "KSMUSD", symbol: "KSM", name: "Kusama", type: "crypto" },
      { pair: "QNTUSD", symbol: "QNT", name: "Quant", type: "crypto" },
      { pair: "RUNEUSD", symbol: "RUNE", name: "THORChain", type: "crypto" },
      { pair: "KAVAUSD", symbol: "KAVA", name: "Kava", type: "crypto" },
      { pair: "ZRXUSD", symbol: "ZRX", name: "0x", type: "crypto" },
      { pair: "ENSUSD", symbol: "ENS", name: "ENS", type: "crypto" },
      { pair: "BATUSD", symbol: "BAT", name: "Basic Attention Token", type: "crypto" },
      { pair: "CHZUSD", symbol: "CHZ", name: "Chiliz", type: "crypto" },
      { pair: "ANKRUSD", symbol: "ANKR", name: "Ankr", type: "crypto" },
      { pair: "AUDIOUSD", symbol: "AUDIO", name: "Audius", type: "crypto" },
      { pair: "PYTHUSD", symbol: "PYTH", name: "Pyth Network", type: "crypto" },
      { pair: "JTOUSD", symbol: "JTO", name: "Jito", type: "crypto" },
      { pair: "WUSD", symbol: "W", name: "Wormhole", type: "crypto" },
      { pair: "STRKUSD", symbol: "STRK", name: "Starknet", type: "crypto" },
      { pair: "ETHFIUSD", symbol: "ETHFI", name: "ether.fi", type: "crypto" },
      { pair: "ENAUSD", symbol: "ENA", name: "Ethena", type: "crypto" },
      { pair: "XDCUSD", symbol: "XDC", name: "XDC Network", type: "crypto" },
      { pair: "NEXOUSD", symbol: "NEXO", name: "Nexo", type: "crypto" },
      { pair: "GNOUSD", symbol: "GNO", name: "Gnosis", type: "crypto" },
      { pair: "RSRUSD", symbol: "RSR", name: "Reserve Rights", type: "crypto" },
      { pair: "CELRUSD", symbol: "CELR", name: "Celer Network", type: "crypto" },
      { pair: "CTSIUSD", symbol: "CTSI", name: "Cartesi", type: "crypto" },
      { pair: "SKLUSD", symbol: "SKL", name: "SKALE", type: "crypto" },
      { pair: "AMPLEUSD", symbol: "AMPL", name: "Ampleforth", type: "crypto" },
      { pair: "REQUSDD", symbol: "REQ", name: "Request", type: "crypto" },
      { pair: "COTIUSD", symbol: "COTI", name: "COTI", type: "crypto" },
      { pair: "OXTUSD", symbol: "OXT", name: "Orchid", type: "crypto" },
      { pair: "MLNUSD", symbol: "MLN", name: "Enzyme", type: "crypto" },
      { pair: "PERPUSD", symbol: "PERP", name: "Perpetual Protocol", type: "crypto" },
      { pair: "SUKUSD", symbol: "SUKU", name: "SUKU", type: "crypto" },
      { pair: "TRBUSD", symbol: "TRB", name: "Tellor", type: "crypto" },
      { pair: "RARIUSD", symbol: "RARI", name: "Rarible", type: "crypto" },
      { pair: "SUPERUSD", symbol: "SUPER", name: "SuperVerse", type: "crypto" },
      { pair: "AGLDUSD", symbol: "AGLD", name: "Adventure Gold", type: "crypto" },
      { pair: "BICOUSD", symbol: "BICO", name: "Biconomy", type: "crypto" },
      { pair: "API3USD", symbol: "API3", name: "API3", type: "crypto" },
      { pair: "KLAYUSD", symbol: "KLAY", name: "Klaytn", type: "crypto" },
      { pair: "GLMUSD", symbol: "GLM", name: "Golem", type: "crypto" },
      { pair: "LPTUSD", symbol: "LPT", name: "Livepeer", type: "crypto" },
      { pair: "SYUSD", symbol: "SUSHI", name: "SushiSwap", type: "crypto" },
      { pair: "POLSUSDD", symbol: "POLS", name: "Polkastarter", type: "crypto" },
      { pair: "RLYUSD", symbol: "RLY", name: "Rally", type: "crypto" },
      { pair: "POWRUSD", symbol: "POWR", name: "Powerledger", type: "crypto" },
      { pair: "NMRUSD", symbol: "NMR", name: "Numeraire", type: "crypto" },
      { pair: "MIRUSD", symbol: "MIR", name: "Mirror Protocol", type: "crypto" },
      { pair: "MASKUSD", symbol: "MASK", name: "Mask Network", type: "crypto" },
      { pair: "MCUSD", symbol: "MC", name: "Merit Circle", type: "crypto" },
      { pair: "METISUSD", symbol: "METIS", name: "Metis", type: "crypto" },
      { pair: "MOVRUSD", symbol: "MOVR", name: "Moonriver", type: "crypto" },
      { pair: "MULTIUSD", symbol: "MULTI", name: "Multichain", type: "crypto" },
      { pair: "MVLUSD", symbol: "MVL", name: "MVL", type: "crypto" },
      { pair: "MXCUSD", symbol: "MXC", name: "MXC", type: "crypto" },
      { pair: "NCTUSD", symbol: "NCT", name: "PolySwarm", type: "crypto" },
      { pair: "NODLUSD", symbol: "NODL", name: "Nodle", type: "crypto" },
      { pair: "OGNUSD", symbol: "OGN", name: "Origin Protocol", type: "crypto" },
      { pair: "OMUSD", symbol: "OM", name: "MANTRA", type: "crypto" },
      { pair: "ONDOUSD", symbol: "ONDO", name: "Ondo", type: "crypto" },
      { pair: "OOKIUSD", symbol: "OOKI", name: "Ooki Protocol", type: "crypto" },
      { pair: "PAXUSD", symbol: "PAX", name: "Pax Dollar", type: "crypto" },
      { pair: "PLAUSD", symbol: "PLA", name: "PlayDapp", type: "crypto" },
      { pair: "POLSUSD", symbol: "POL", name: "POL (ex-MATIC)", type: "crypto" },
      { pair: "PONDUSD", symbol: "POND", name: "Marlin", type: "crypto" },
      { pair: "PROUSD", symbol: "PRO", name: "Propy", type: "crypto" },
      { pair: "PUNDIXUSD", symbol: "PUNDIX", name: "Pundi X", type: "crypto" },
      { pair: "QIUSD", symbol: "QI", name: "BENQI", type: "crypto" },
      { pair: "QKCUSD", symbol: "QKC", name: "QuarkChain", type: "crypto" },
      { pair: "QUICKUSD", symbol: "QUICK", name: "QuickSwap", type: "crypto" },
      { pair: "RADUSDD", symbol: "RAD", name: "Radicle", type: "crypto" },
      { pair: "REPUSD", symbol: "REP", name: "Augur", type: "crypto" },
      { pair: "REQUSD", symbol: "REQ", name: "Request", type: "crypto" },
      { pair: "RLCUSD", symbol: "RLC", name: "iExec RLC", type: "crypto" },
      { pair: "RNDRUSD", symbol: "RNDR", name: "Render", type: "crypto" },
      { pair: "SAFEUSD", symbol: "SAFE", name: "Safe", type: "crypto" },
      { pair: "SANTOSUSD", symbol: "SANTOS", name: "Santos FC Fan Token", type: "crypto" },
      { pair: "SDUSD", symbol: "SD", name: "Stader", type: "crypto" },
      { pair: "SFPUSD", symbol: "SFP", name: "SafePal", type: "crypto" },
      { pair: "SLPUSD", symbol: "SLP", name: "Smooth Love Potion", type: "crypto" },
      { pair: "SNTXUSD", symbol: "SNTX", name: "Sentivate", type: "crypto" },
      { pair: "SPELLTUSD", symbol: "SPELL", name: "Spell Token", type: "crypto" },
      { pair: "SRMUSD", symbol: "SRM", name: "Serum", type: "crypto" },
      { pair: "STGUSD", symbol: "STG", name: "Stargate Finance", type: "crypto" },
      { pair: "STMXUSD", symbol: "STMX", name: "StormX", type: "crypto" },
      { pair: "STORJUSD", symbol: "STORJ", name: "Storj", type: "crypto" },
      { pair: "SUSHIUSD", symbol: "SUSHI", name: "SushiSwap", type: "crypto" },
      { pair: "SWEATUSD", symbol: "SWEAT", name: "Sweat Economy", type: "crypto" },
      { pair: "SXPUSD", symbol: "SXP", name: "Solar", type: "crypto" },
      { pair: "SYNUSD", symbol: "SYN", name: "Synapse", type: "crypto" },
      { pair: "TVKUSD", symbol: "TVK", name: "Terra Virtua", type: "crypto" },
      { pair: "TWTUSD", symbol: "TWT", name: "Trust Wallet Token", type: "crypto" },
      { pair: "UMBUSD", symbol: "UMB", name: "Umbrella Network", type: "crypto" },
      { pair: "UNFIUSD", symbol: "UNFI", name: "Unifi Protocol DAO", type: "crypto" },
      { pair: "UOSUSD", symbol: "UOS", name: "Ultra", type: "crypto" },
      { pair: "USDCUSD", symbol: "USDC", name: "USD Coin", type: "crypto" },
      { pair: "USDTUSD", symbol: "USDT", name: "Tether", type: "crypto" },
      { pair: "USTCUSD", symbol: "USTC", name: "TerraClassicUSD", type: "crypto" },
      { pair: "VELOUSD", symbol: "VELO", name: "Velodrome Finance", type: "crypto" },
      { pair: "VIDTUSD", symbol: "VIDT", name: "VIDT DAO", type: "crypto" },
      { pair: "VOXELUSD", symbol: "VOXEL", name: "Voxies", type: "crypto" },
      { pair: "VTHOUSD", symbol: "VTHO", name: "VeThor Token", type: "crypto" },
      { pair: "WAXPUSD", symbol: "WAXP", name: "WAX", type: "crypto" },
      { pair: "WINUSD", symbol: "WIN", name: "WINkLink", type: "crypto" },
      { pair: "WOOUSD", symbol: "WOO", name: "WOO Network", type: "crypto" },
      { pair: "XECUSD", symbol: "XEC", name: "eCash", type: "crypto" },
      { pair: "XEMUSD", symbol: "XEM", name: "NEM", type: "crypto" },
      { pair: "XNOUSD", symbol: "XNO", name: "Nano", type: "crypto" },
      { pair: "XVGUSD", symbol: "XVG", name: "Verge", type: "crypto" },
      { pair: "YFIUSD", symbol: "YFI", name: "yearn.finance", type: "crypto" },
      { pair: "YGGUSD", symbol: "YGG", name: "Yield Guild Games", type: "crypto" },
      { pair: "ZENUSD", symbol: "ZEN", name: "Horizen", type: "crypto" },
      { pair: "ZERUSD", symbol: "ZER", name: "Zero", type: "crypto" },
      
      // ============ New 2024/2025 Listings ============
      { pair: "BERAUSD", symbol: "BERA", name: "Berachain", type: "crypto" },
      { pair: "ATHUSD", symbol: "ATH", name: "Aethir", type: "crypto" },
      { pair: "ZEROUSD", symbol: "ZERO", name: "ZeroLend", type: "crypto" },
      { pair: "GRASSUSD", symbol: "GRASS", name: "Grass", type: "crypto" },
      { pair: "MOVEUSD", symbol: "MOVE", name: "Movement", type: "crypto" },
      { pair: "MEUSD", symbol: "ME", name: "Magic Eden", type: "crypto" },
      { pair: "PENGUUSD", symbol: "PENGU", name: "Pudgy Penguins", type: "crypto" },
      { pair: "HYPEUSD", symbol: "HYPE", name: "Hyperliquid", type: "crypto" },
      { pair: "USUALDSD", symbol: "USUAL", name: "Usual", type: "crypto" },
      { pair: "BIOUSD", symbol: "BIO", name: "BIO Protocol", type: "crypto" },
      { pair: "TRUMPUSD", symbol: "TRUMP", name: "Official Trump", type: "crypto" },
      { pair: "VANUSD", symbol: "VAN", name: "VAna", type: "crypto" },
      { pair: "COOKIEUSD", symbol: "COOKIE", name: "Cookie DAO", type: "crypto" },
      { pair: "SWARMSUSD", symbol: "SWARMS", name: "Swarms", type: "crypto" },
      { pair: "FARTCOINUSD", symbol: "FARTCOIN", name: "Fartcoin", type: "crypto" },
      { pair: "GRIFFAINUSD", symbol: "GRIFFAIN", name: "Griffain", type: "crypto" },
      { pair: "ANIME2USD", symbol: "ANIME", name: "Anime", type: "crypto" },
      { pair: "KAICUSD", symbol: "KAITO", name: "Kaito", type: "crypto" },
      { pair: "IP3USD", symbol: "IP", name: "Story", type: "crypto" },
      { pair: "LAYERUSD", symbol: "LAYER", name: "Solayer", type: "crypto" },
      { pair: "TSHTUSD", symbol: "TST", name: "The Standard Token", type: "crypto" },
      { pair: "LITRAUSD", symbol: "LITRA", name: "Libra", type: "crypto" },
      { pair: "ACTUSD", symbol: "ACT", name: "Act I: The AI Prophecy", type: "crypto" },
      { pair: "AEROUSD", symbol: "AERO", name: "Aerodrome Finance", type: "crypto" },
      
      // ============ xSTOCKS - ETFs Index Funds ============
      { pair: "SPYUSD", symbol: "SPY", name: "SPDR S&P 500 ETF Trust", type: "stock" },
      { pair: "QQQUSD", symbol: "QQQ", name: "Invesco QQQ Trust (Nasdaq 100)", type: "stock" },
      { pair: "IWMUSD", symbol: "IWM", name: "iShares Russell 2000 ETF", type: "stock" },
      { pair: "DIAUSD", symbol: "DIA", name: "SPDR Dow Jones Industrial Average", type: "stock" },
      { pair: "VTIUSD", symbol: "VTI", name: "Vanguard Total Stock Market ETF", type: "stock" },
      { pair: "VOOUSD", symbol: "VOO", name: "Vanguard S&P 500 ETF", type: "stock" },
      { pair: "VXUSUSD", symbol: "VXF", name: "Vanguard Extended Market ETF", type: "stock" },
      { pair: "VTVUSD", symbol: "VTV", name: "Vanguard Value ETF", type: "stock" },
      { pair: "VUGUSD", symbol: "VUG", name: "Vanguard Growth ETF", type: "stock" },
      { pair: "VTIPUSD", symbol: "VTIP", name: "Vanguard Short-Term Inflation-Protected Securities ETF", type: "stock" },
      { pair: "BNDXUSD", symbol: "BNDX", name: "Vanguard Total International Bond ETF", type: "stock" },
      { pair: "BNDUSD", symbol: "BND", name: "Vanguard Total Bond Market ETF", type: "stock" },
      { pair: "AGGUSD", symbol: "AGG", name: "iShares Core U.S. Aggregate Bond ETF", type: "stock" },
      { pair: "LQDUSD", symbol: "LQD", name: "iShares iBoxx Investment Grade Corporate Bond ETF", type: "stock" },
      { pair: "HYGUSD", symbol: "HYG", name: "iShares iBoxx High Yield Corporate Bond ETF", type: "stock" },
      { pair: "EMBUSD", symbol: "EMB", name: "iShares JP Morgan USD Emerging Markets Bond ETF", type: "stock" },
      { pair: "TIPUSD", symbol: "TIP", name: "iShares TIPS Bond ETF", type: "stock" },
      { pair: "SHYUSD", symbol: "SHY", name: "iShares 1-3 Year Treasury Bond ETF", type: "stock" },
      { pair: "IEFUSD", symbol: "IEF", name: "iShares 7-10 Year Treasury Bond ETF", type: "stock" },
      { pair: "TLTUSD", symbol: "TLT", name: "iShares 20+ Year Treasury Bond ETF", type: "stock" },
      { pair: "ARKKUSD", symbol: "ARKK", name: "ARK Innovation ETF", type: "stock" },
      { pair: "ARKGUSD", symbol: "ARKG", name: "ARK Genomic Revolution ETF", type: "stock" },
      { pair: "ARKWUSD", symbol: "ARKW", name: "ARK Next Generation Internet ETF", type: "stock" },
      { pair: "ARKQUSD", symbol: "ARKQ", name: "ARK Autonomous Technology & Robotics ETF", type: "stock" },
      { pair: "ARKFUSD", symbol: "ARKF", name: "ARK Fintech Innovation ETF", type: "stock" },
      { pair: "TQQQUSD", symbol: "TQQQ", name: "ProShares UltraPro QQQ (3x)", type: "stock" },
      { pair: "SQQQUSD", symbol: "SQQQ", name: "ProShares UltraPro Short QQQ (-3x)", type: "stock" },
      { pair: "SPXLUSD", symbol: "SPXL", name: "Direxion Daily S&P 500 Bull 3x", type: "stock" },
      { pair: "SPXSUSD", symbol: "SPXS", name: "Direxion Daily S&P 500 Bear 3x", type: "stock" },
      { pair: "SOXLUSD", symbol: "SOXL", name: "Direxion Daily Semiconductor Bull 3x", type: "stock" },
      { pair: "SOXSUSD", symbol: "SOXS", name: "Direxion Daily Semiconductor Bear 3x", type: "stock" },
      { pair: "GLDUSD", symbol: "GLD", name: "SPDR Gold Shares", type: "stock" },
      { pair: "SLVUSD", symbol: "SLV", name: "iShares Silver Trust", type: "stock" },
      { pair: "USOUSD", symbol: "USO", name: "United States Oil Fund", type: "stock" },
      { pair: "UNGUSD", symbol: "UNG", name: "United States Natural Gas Fund", type: "stock" },
      { pair: "TBLLUSD", symbol: "TBLL", name: "0-3 Month Treasury Bill ETF", type: "stock" },
      { pair: "XLKUSD", symbol: "XLK", name: "Technology Select Sector SPDR", type: "stock" },
      { pair: "XLFUSD", symbol: "XLF", name: "Financial Select Sector SPDR", type: "stock" },
      { pair: "XLVUSD", symbol: "XLV", name: "Health Care Select Sector SPDR", type: "stock" },
      { pair: "XLEUSD", symbol: "XLE", name: "Energy Select Sector SPDR", type: "stock" },
      { pair: "XLIUSD", symbol: "XLI", name: "Industrial Select Sector SPDR", type: "stock" },
      { pair: "XLPUSD", symbol: "XLP", name: "Consumer Staples Select Sector SPDR", type: "stock" },
      { pair: "XLYUSD", symbol: "XLY", name: "Consumer Discretionary Select Sector SPDR", type: "stock" },
      { pair: "XLBUSD", symbol: "XLB", name: "Materials Select Sector SPDR", type: "stock" },
      { pair: "XLUUSD", symbol: "XLU", name: "Utilities Select Sector SPDR", type: "stock" },
      { pair: "XLREUSD", symbol: "XLRE", name: "Real Estate Select Sector SPDR", type: "stock" },
      { pair: "SMHUSD", symbol: "SMH", name: "VanEck Semiconductor ETF", type: "stock" },
      { pair: "IBJBUSD", symbol: "IBB", name: "iShares Biotechnology ETF", type: "stock" },
      { pair: "XBIUSD", symbol: "XBI", name: "SPDR S&P Biotech ETF", type: "stock" },
      { pair: "GDXUSD", symbol: "GDX", name: "VanEck Gold Miners ETF", type: "stock" },
      { pair: "GDXJUSD", symbol: "GDXJ", name: "VanEck Junior Gold Miners ETF", type: "stock" },
      { pair: "EWZUSD", symbol: "EWZ", name: "iShares MSCI Brazil ETF", type: "stock" },
      { pair: "EWJUSD", symbol: "EWJ", name: "iShares MSCI Japan ETF", type: "stock" },
      { pair: "FXIUSD", symbol: "FXI", name: "iShares China Large-Cap ETF", type: "stock" },
      { pair: "KWEUUSD", symbol: "KWEB", name: "KraneShares CSI China Internet ETF", type: "stock" },
      { pair: "EFAUSD", symbol: "EFA", name: "iShares MSCI EAFE ETF", type: "stock" },
      { pair: "EEMUSD", symbol: "EEM", name: "iShares MSCI Emerging Markets ETF", type: "stock" },
      { pair: "VWOUSD", symbol: "VWO", name: "Vanguard FTSE Emerging Markets ETF", type: "stock" },
      { pair: "VEAUSD", symbol: "VEA", name: "Vanguard FTSE Developed Markets ETF", type: "stock" },
      { pair: "VCRUSD", symbol: "VCR", name: "Vanguard Consumer Discretionary ETF", type: "stock" },
      { pair: "VDCUSD", symbol: "VDC", name: "Vanguard Consumer Staples ETF", type: "stock" },
      { pair: "VDEUSD", symbol: "VDE", name: "Vanguard Energy ETF", type: "stock" },
      { pair: "VFISUSD", symbol: "VFH", name: "Vanguard Financials ETF", type: "stock" },
      { pair: "VGTUSD", symbol: "VGT", name: "Vanguard Information Technology ETF", type: "stock" },
      { pair: "VHTUSD", symbol: "VHT", name: "Vanguard Health Care ETF", type: "stock" },
      { pair: "VISUSD", symbol: "VIS", name: "Vanguard Industrials ETF", type: "stock" },
      { pair: "VAWUSD", symbol: "VAW", name: "Vanguard Materials ETF", type: "stock" },
      { pair: "VNQUSD", symbol: "VNQ", name: "Vanguard Real Estate ETF", type: "stock" },
      { pair: "VPUUSD", symbol: "VPU", name: "Vanguard Utilities ETF", type: "stock" },
      { pair: "VOXUSD", symbol: "VOX", name: "Vanguard Communication Services ETF", type: "stock" },
      { pair: "BITOUSD", symbol: "BITO", name: "ProShares Bitcoin Strategy ETF", type: "stock" },
      { pair: "IBITTUSD", symbol: "IBIT", name: "iShares Bitcoin Trust", type: "stock" },
      { pair: "FBTCUSD", symbol: "FBTC", name: "Fidelity Wise Origin Bitcoin Fund", type: "stock" },
      { pair: "GBTCUSD", symbol: "GBTC", name: "Grayscale Bitcoin Trust", type: "stock" },
      { pair: "ETHUUSD", symbol: "ETHE", name: "Grayscale Ethereum Trust", type: "stock" },
      
      // ============ xSTOCKS - Mega Cap Tech ============
      { pair: "NVDAUSD", symbol: "NVDA", name: "NVIDIA", type: "stock" },
      { pair: "AAPLUSD", symbol: "AAPL", name: "Apple", type: "stock" },
      { pair: "MSFTUSD", symbol: "MSFT", name: "Microsoft", type: "stock" },
      { pair: "GOOGLUSD", symbol: "GOOGL", name: "Alphabet (Class A)", type: "stock" },
      { pair: "GOOGUSD", symbol: "GOOG", name: "Alphabet (Class C)", type: "stock" },
      { pair: "AMZNUSD", symbol: "AMZN", name: "Amazon", type: "stock" },
      { pair: "METAUSD", symbol: "META", name: "Meta Platforms", type: "stock" },
      { pair: "TSLAUSD", symbol: "TSLA", name: "Tesla", type: "stock" },
      { pair: "NFLXUSD", symbol: "NFLX", name: "Netflix", type: "stock" },
      
      // ============ xSTOCKS - Semiconductors ============
      { pair: "AVGOUSD", symbol: "AVGO", name: "Broadcom", type: "stock" },
      { pair: "AMDUSD", symbol: "AMD", name: "Advanced Micro Devices", type: "stock" },
      { pair: "MUUSD", symbol: "MU", name: "Micron Technology", type: "stock" },
      { pair: "INTCUSD", symbol: "INTC", name: "Intel", type: "stock" },
      { pair: "QCOMUSD", symbol: "QCOM", name: "Qualcomm", type: "stock" },
      { pair: "MRVLUSD", symbol: "MRVL", name: "Marvell Technology", type: "stock" },
      { pair: "ARMUSD", symbol: "ARM", name: "ARM Holdings", type: "stock" },
      { pair: "TSMUSD", symbol: "TSM", name: "Taiwan Semiconductor", type: "stock" },
      { pair: "ASMLUSD", symbol: "ASML", name: "ASML Holding", type: "stock" },
      { pair: "LRCXUSD", symbol: "LRCX", name: "Lam Research", type: "stock" },
      { pair: "AMATUSD", symbol: "AMAT", name: "Applied Materials", type: "stock" },
      { pair: "KLACUSD", symbol: "KLAC", name: "KLA Corporation", type: "stock" },
      { pair: "ADIIUSD", symbol: "ADI", name: "Analog Devices", type: "stock" },
      { pair: "TXNUSD", symbol: "TXN", name: "Texas Instruments", type: "stock" },
      { pair: "NXPIUSD", symbol: "NXPI", name: "NXP Semiconductors", type: "stock" },
      { pair: "ONUSD", symbol: "ON", name: "ON Semiconductor", type: "stock" },
      { pair: "SWKSUSD", symbol: "SWKS", name: "Skyworks Solutions", type: "stock" },
      { pair: "MCHPUSD", symbol: "MCHP", name: "Microchip Technology", type: "stock" },
      
      // ============ xSTOCKS - Enterprise Software & Cloud ============
      { pair: "ORCLUSD", symbol: "ORCL", name: "Oracle", type: "stock" },
      { pair: "PLTRUSD", symbol: "PLTR", name: "Palantir Technologies", type: "stock" },
      { pair: "CRMUSD", symbol: "CRM", name: "Salesforce", type: "stock" },
      { pair: "ADBEUSD", symbol: "ADBE", name: "Adobe", type: "stock" },
      { pair: "IBMUSD", symbol: "IBM", name: "IBM", type: "stock" },
      { pair: "CSCOUSD", symbol: "CSCO", name: "Cisco Systems", type: "stock" },
      { pair: "CRWDUSD", symbol: "CRWD", name: "CrowdStrike", type: "stock" },
      { pair: "ACNUSD", symbol: "ACN", name: "Accenture", type: "stock" },
      { pair: "INUITUSD", symbol: "INTU", name: "Intuit", type: "stock" },
      { pair: "NOWUSD", symbol: "NOW", name: "ServiceNow", type: "stock" },
      { pair: "SNGUSD", symbol: "SNOW", name: "Snowflake", type: "stock" },
      { pair: "DTSTOCKUSD", symbol: "DDOG", name: "Datadog", type: "stock" },
      { pair: "MNGUSD", symbol: "MDB", name: "MongoDB", type: "stock" },
      { pair: "NETUSD", symbol: "NET", name: "Cloudflare", type: "stock" },
      { pair: "ZSCAUSD", symbol: "ZS", name: "Zscaler", type: "stock" },
      { pair: "PANWUSD", symbol: "PANW", name: "Palo Alto Networks", type: "stock" },
      { pair: "FTTNTUSD", symbol: "FTNT", name: "Fortinet", type: "stock" },
      { pair: "WDAYUSD", symbol: "WDAY", name: "Workday", type: "stock" },
      { pair: "OKAUSD", symbol: "OKTA", name: "Okta", type: "stock" },
      { pair: "ZMUSD", symbol: "ZM", name: "Zoom Video", type: "stock" },
      { pair: "DOCUUSD", symbol: "DOCU", name: "DocuSign", type: "stock" },
      { pair: "TWILIOUSD", symbol: "TWLO", name: "Twilio", type: "stock" },
      { pair: "SPLKUSD", symbol: "SPLK", name: "Splunk", type: "stock" },
      { pair: "TEAMUSD", symbol: "TEAM", name: "Atlassian", type: "stock" },
      { pair: "HBSUSD", symbol: "HUBS", name: "HubSpot", type: "stock" },
      { pair: "VEEAUSD", symbol: "VEEV", name: "Veeva Systems", type: "stock" },
      { pair: "APPUSD", symbol: "APP", name: "AppLovin", type: "stock" },
      
      // ============ xSTOCKS - Finance & Banking ============
      { pair: "JPMUSD", symbol: "JPM", name: "JPMorgan Chase", type: "stock" },
      { pair: "GSUSD", symbol: "GS", name: "Goldman Sachs", type: "stock" },
      { pair: "BACUSD", symbol: "BAC", name: "Bank of America", type: "stock" },
      { pair: "WFCUSD", symbol: "WFC", name: "Wells Fargo", type: "stock" },
      { pair: "CUSD", symbol: "C", name: "Citigroup", type: "stock" },
      { pair: "MSUSD", symbol: "MS", name: "Morgan Stanley", type: "stock" },
      { pair: "SPGIUSD", symbol: "SPGI", name: "S&P Global", type: "stock" },
      { pair: "BLKUSD", symbol: "BLK", name: "BlackRock", type: "stock" },
      { pair: "SCHBUSD", symbol: "SCHW", name: "Charles Schwab", type: "stock" },
      { pair: "AXPUSD", symbol: "AXP", name: "American Express", type: "stock" },
      { pair: "VUSD", symbol: "V", name: "Visa", type: "stock" },
      { pair: "MAUSD", symbol: "MA", name: "Mastercard", type: "stock" },
      { pair: "PYPLUSD", symbol: "PYPL", name: "PayPal", type: "stock" },
      { pair: "SQUSD", symbol: "SQ", name: "Block (Square)", type: "stock" },
      { pair: "BRKBUSD", symbol: "BRK.B", name: "Berkshire Hathaway", type: "stock" },
      { pair: "CMEUSD", symbol: "CME", name: "CME Group", type: "stock" },
      { pair: "ICEUSD", symbol: "ICE", name: "Intercontinental Exchange", type: "stock" },
      { pair: "MCOUSD", symbol: "MCO", name: "Moody's", type: "stock" },
      { pair: "AONUSD", symbol: "AON", name: "Aon", type: "stock" },
      { pair: "MMCUSD", symbol: "MMC", name: "Marsh & McLennan", type: "stock" },
      { pair: "PGRUSD", symbol: "PGR", name: "Progressive", type: "stock" },
      { pair: "CBSUSD", symbol: "CB", name: "Chubb", type: "stock" },
      { pair: "TRVIAUSD", symbol: "TRV", name: "Travelers", type: "stock" },
      { pair: "ALLUSD", symbol: "ALL", name: "Allstate", type: "stock" },
      { pair: "METLIFEUSD", symbol: "MET", name: "MetLife", type: "stock" },
      { pair: "AFLUSD", symbol: "AFL", name: "Aflac", type: "stock" },
      { pair: "PRUUSD", symbol: "PRU", name: "Prudential Financial", type: "stock" },
      { pair: "COFSTUSD", symbol: "COF", name: "Capital One Financial", type: "stock" },
      { pair: "DFSUSD", symbol: "DFS", name: "Discover Financial", type: "stock" },
      { pair: "SYFUSD", symbol: "SYF", name: "Synchrony Financial", type: "stock" },
      { pair: "AFFIRMUSD", symbol: "AFRM", name: "Affirm", type: "stock" },
      { pair: "SIFBUSD", symbol: "SOFI", name: "SoFi Technologies", type: "stock" },
      { pair: "UPSTRUSD", symbol: "UPST", name: "Upstart", type: "stock" },
      
      // ============ xSTOCKS - Crypto-Related Stocks ============
      { pair: "MSTRUSD", symbol: "MSTR", name: "MicroStrategy", type: "stock" },
      { pair: "COINUSD", symbol: "COIN", name: "Coinbase", type: "stock" },
      { pair: "HOODUSD", symbol: "HOOD", name: "Robinhood", type: "stock" },
      { pair: "MARATHONUSD", symbol: "MARA", name: "Marathon Digital Holdings", type: "stock" },
      { pair: "RIOTUSD", symbol: "RIOT", name: "Riot Platforms", type: "stock" },
      { pair: "CLSKUSD", symbol: "CLSK", name: "CleanSpark", type: "stock" },
      { pair: "HIVEUSD", symbol: "HIVE", name: "HIVE Digital Technologies", type: "stock" },
      { pair: "BITFUSD", symbol: "BITF", name: "Bitfarms", type: "stock" },
      { pair: "HUTUSD", symbol: "HUT", name: "Hut 8 Mining", type: "stock" },
      { pair: "CIFRUSD", symbol: "CIFR", name: "Cipher Mining", type: "stock" },
      { pair: "BTDRUSD", symbol: "BTDR", name: "Bitdeer Technologies", type: "stock" },
      { pair: "IREBUSD", symbol: "IREN", name: "Iris Energy", type: "stock" },
      { pair: "WULFUSD", symbol: "WULF", name: "TeraWulf", type: "stock" },
      
      // ============ xSTOCKS - Consumer & Retail ============
      { pair: "COSTUSD", symbol: "COST", name: "Costco Wholesale", type: "stock" },
      { pair: "WMTUSD", symbol: "WMT", name: "Walmart", type: "stock" },
      { pair: "TGTUSD", symbol: "TGT", name: "Target", type: "stock" },
      { pair: "HDUSD", symbol: "HD", name: "Home Depot", type: "stock" },
      { pair: "LOWUSD", symbol: "LOW", name: "Lowe's", type: "stock" },
      { pair: "NKEUSD", symbol: "NKE", name: "Nike", type: "stock" },
      { pair: "SBUXUSD", symbol: "SBUX", name: "Starbucks", type: "stock" },
      { pair: "MCDUSD", symbol: "MCD", name: "McDonald's", type: "stock" },
      { pair: "CMNGUSD", symbol: "CMG", name: "Chipotle Mexican Grill", type: "stock" },
      { pair: "YARDUSD", symbol: "YUM", name: "Yum! Brands", type: "stock" },
      { pair: "DPZUSD", symbol: "DPZ", name: "Domino's Pizza", type: "stock" },
      { pair: "CVNAUSD", symbol: "CVNA", name: "Carvana", type: "stock" },
      { pair: "RVNUSD", symbol: "RIVN", name: "Rivian", type: "stock" },
      { pair: "LCIDUDSD", symbol: "LCID", name: "Lucid Group", type: "stock" },
      { pair: "PGUSD", symbol: "PG", name: "Procter & Gamble", type: "stock" },
      { pair: "KOUSD", symbol: "KO", name: "Coca-Cola", type: "stock" },
      { pair: "PEPUSD", symbol: "PEP", name: "PepsiCo", type: "stock" },
      { pair: "KHHCUSD", symbol: "KHC", name: "Kraft Heinz", type: "stock" },
      { pair: "MDUSD", symbol: "MDLZ", name: "Mondelez International", type: "stock" },
      { pair: "CLUSD", symbol: "CL", name: "Colgate-Palmolive", type: "stock" },
      { pair: "ELUSD", symbol: "EL", name: "Estee Lauder", type: "stock" },
      { pair: "KMBUSD", symbol: "KMB", name: "Kimberly-Clark", type: "stock" },
      { pair: "SJMUSD", symbol: "SJM", name: "J.M. Smucker", type: "stock" },
      { pair: "GISUSD", symbol: "GIS", name: "General Mills", type: "stock" },
      { pair: "KUSD", symbol: "K", name: "Kellanova", type: "stock" },
      { pair: "HSYUSD", symbol: "HSY", name: "Hershey", type: "stock" },
      { pair: "CPBUSD", symbol: "CPB", name: "Campbell Soup", type: "stock" },
      { pair: "HORSTUSD", symbol: "HRL", name: "Hormel Foods", type: "stock" },
      { pair: "MKCCUSD", symbol: "MKC", name: "McCormick", type: "stock" },
      { pair: "CAHUSD", symbol: "CAH", name: "Cardinal Health", type: "stock" },
      { pair: "KRGUSD", symbol: "KR", name: "Kroger", type: "stock" },
      { pair: "SYSCOUSD", symbol: "SYY", name: "Sysco", type: "stock" },
      { pair: "DLRTRUSD", symbol: "DLTR", name: "Dollar Tree", type: "stock" },
      { pair: "DGUSD", symbol: "DG", name: "Dollar General", type: "stock" },
      { pair: "ROSSUSD", symbol: "ROST", name: "Ross Stores", type: "stock" },
      { pair: "TJXUSD", symbol: "TJX", name: "TJX Companies", type: "stock" },
      { pair: "BBBYUSD", symbol: "BBWI", name: "Bath & Body Works", type: "stock" },
      { pair: "LVSUSD", symbol: "LVS", name: "Las Vegas Sands", type: "stock" },
      { pair: "WYNUSD", symbol: "WYNN", name: "Wynn Resorts", type: "stock" },
      { pair: "MGMUSD", symbol: "MGM", name: "MGM Resorts", type: "stock" },
      { pair: "CZRUSD", symbol: "CZR", name: "Caesars Entertainment", type: "stock" },
      { pair: "DKNGUSD", symbol: "DKNG", name: "DraftKings", type: "stock" },
      { pair: "PENDUSD", symbol: "PENN", name: "Penn Entertainment", type: "stock" },
      { pair: "HASUSD", symbol: "HAS", name: "Hasbro", type: "stock" },
      { pair: "MTUSD", symbol: "MAT", name: "Mattel", type: "stock" },
      { pair: "PLNTUSD", symbol: "PLNT", name: "Planet Fitness", type: "stock" },
      { pair: "LULUUSD", symbol: "LULU", name: "Lululemon Athletica", type: "stock" },
      { pair: "GPSUSD", symbol: "GPS", name: "Gap", type: "stock" },
      { pair: "ANFIUSD", symbol: "ANF", name: "Abercrombie & Fitch", type: "stock" },
      { pair: "URBNUSD", symbol: "URBN", name: "Urban Outfitters", type: "stock" },
      { pair: "FLRUSD", symbol: "FL", name: "Foot Locker", type: "stock" },
      
      // ============ xSTOCKS - Healthcare & Pharma ============
      { pair: "JNJUSD", symbol: "JNJ", name: "Johnson & Johnson", type: "stock" },
      { pair: "PFEUSD", symbol: "PFE", name: "Pfizer", type: "stock" },
      { pair: "MRNAUSD", symbol: "MRNA", name: "Moderna", type: "stock" },
      { pair: "LLYUSD", symbol: "LLY", name: "Eli Lilly", type: "stock" },
      { pair: "ABBVUSD", symbol: "ABBV", name: "AbbVie", type: "stock" },
      { pair: "UNHUSD", symbol: "UNH", name: "UnitedHealth Group", type: "stock" },
      { pair: "TMOUSD", symbol: "TMO", name: "Thermo Fisher Scientific", type: "stock" },
      { pair: "MRKUSD", symbol: "MRK", name: "Merck", type: "stock" },
      { pair: "BMYUSD", symbol: "BMY", name: "Bristol-Myers Squibb", type: "stock" },
      { pair: "AMGNUSD", symbol: "AMGN", name: "Amgen", type: "stock" },
      { pair: "GILDUSD", symbol: "GILD", name: "Gilead Sciences", type: "stock" },
      { pair: "REGENUSD", symbol: "REGN", name: "Regeneron Pharmaceuticals", type: "stock" },
      { pair: "VERTIXUSD", symbol: "VRTX", name: "Vertex Pharmaceuticals", type: "stock" },
      { pair: "BIIBBUSD", symbol: "BIIB", name: "Biogen", type: "stock" },
      { pair: "DHRRUSD", symbol: "DHR", name: "Danaher", type: "stock" },
      { pair: "ABUSD", symbol: "ABT", name: "Abbott Laboratories", type: "stock" },
      { pair: "MDTUSD", symbol: "MDT", name: "Medtronic", type: "stock" },
      { pair: "SYKUSD", symbol: "SYK", name: "Stryker", type: "stock" },
      { pair: "BSXUSD", symbol: "BSX", name: "Boston Scientific", type: "stock" },
      { pair: "EWUSD", symbol: "EW", name: "Edwards Lifesciences", type: "stock" },
      { pair: "ISHRUSD", symbol: "ISRG", name: "Intuitive Surgical", type: "stock" },
      { pair: "IDXXUSD", symbol: "IDXX", name: "IDEXX Laboratories", type: "stock" },
      { pair: "ILMNUSD", symbol: "ILMN", name: "Illumina", type: "stock" },
      { pair: "DXCMUSD", symbol: "DXCM", name: "DexCom", type: "stock" },
      { pair: "ALGKUSD", symbol: "ALGN", name: "Align Technology", type: "stock" },
      { pair: "HOLXUSD", symbol: "HOLX", name: "Hologic", type: "stock" },
      { pair: "IQVUSD", symbol: "IQV", name: "IQVIA Holdings", type: "stock" },
      { pair: "CIUSD", symbol: "CI", name: "Cigna", type: "stock" },
      { pair: "CVSUSD", symbol: "CVS", name: "CVS Health", type: "stock" },
      { pair: "HUMAUSD", symbol: "HUM", name: "Humana", type: "stock" },
      { pair: "ELVAHUSD", symbol: "ELV", name: "Elevance Health", type: "stock" },
      { pair: "HCAUSD", symbol: "HCA", name: "HCA Healthcare", type: "stock" },
      { pair: "MCKKUSD", symbol: "MCK", name: "McKesson", type: "stock" },
      { pair: "ABCUSD", symbol: "ABC", name: "AmerisourceBergen", type: "stock" },
      { pair: "WBAUSD", symbol: "WBA", name: "Walgreens Boots Alliance", type: "stock" },
      { pair: "ZSGUSD", symbol: "ZTS", name: "Zoetis", type: "stock" },
      { pair: "AZNNUSD", symbol: "AZN", name: "AstraZeneca", type: "stock" },
      { pair: "NVSUSD", symbol: "NVS", name: "Novartis", type: "stock" },
      { pair: "SNYFUSD", symbol: "SNY", name: "Sanofi", type: "stock" },
      { pair: "GSKKUSD", symbol: "GSK", name: "GSK", type: "stock" },
      { pair: "NOVOUSD", symbol: "NVO", name: "Novo Nordisk", type: "stock" },
      
      // ============ xSTOCKS - Energy & Industrials ============
      { pair: "XOMUSD", symbol: "XOM", name: "Exxon Mobil", type: "stock" },
      { pair: "CVXUSD", symbol: "CVX", name: "Chevron", type: "stock" },
      { pair: "COPUSD", symbol: "COP", name: "ConocoPhillips", type: "stock" },
      { pair: "EOGGUSD", symbol: "EOG", name: "EOG Resources", type: "stock" },
      { pair: "SLBUSD", symbol: "SLB", name: "Schlumberger", type: "stock" },
      { pair: "PXDUSD", symbol: "PXD", name: "Pioneer Natural Resources", type: "stock" },
      { pair: "MPCUSD", symbol: "MPC", name: "Marathon Petroleum", type: "stock" },
      { pair: "PSXUSD", symbol: "PSX", name: "Phillips 66", type: "stock" },
      { pair: "VLLOUSD", symbol: "VLO", name: "Valero Energy", type: "stock" },
      { pair: "OXYYUSD", symbol: "OXY", name: "Occidental Petroleum", type: "stock" },
      { pair: "HALTBUSD", symbol: "HAL", name: "Halliburton", type: "stock" },
      { pair: "BAKRUSD", symbol: "BKR", name: "Baker Hughes", type: "stock" },
      { pair: "KMIUSD", symbol: "KMI", name: "Kinder Morgan", type: "stock" },
      { pair: "WMBUSD", symbol: "WMB", name: "Williams Companies", type: "stock" },
      { pair: "OKEUSD", symbol: "OKE", name: "ONEOK", type: "stock" },
      { pair: "EPDUSD", symbol: "EPD", name: "Enterprise Products Partners", type: "stock" },
      { pair: "BAUSD", symbol: "BA", name: "Boeing", type: "stock" },
      { pair: "RTXUSD", symbol: "RTX", name: "RTX Corporation", type: "stock" },
      { pair: "LMTUSD", symbol: "LMT", name: "Lockheed Martin", type: "stock" },
      { pair: "NOCUSD", symbol: "NOC", name: "Northrop Grumman", type: "stock" },
      { pair: "GDDUSD", symbol: "GD", name: "General Dynamics", type: "stock" },
      { pair: "LHXUSD", symbol: "LHX", name: "L3Harris Technologies", type: "stock" },
      { pair: "CATUSD", symbol: "CAT", name: "Caterpillar", type: "stock" },
      { pair: "DEUSD", symbol: "DE", name: "Deere & Company", type: "stock" },
      { pair: "GEUSD", symbol: "GE", name: "GE Aerospace", type: "stock" },
      { pair: "HONUSD", symbol: "HON", name: "Honeywell", type: "stock" },
      { pair: "MMMUSD", symbol: "MMM", name: "3M", type: "stock" },
      { pair: "EMRUSD", symbol: "EMR", name: "Emerson Electric", type: "stock" },
      { pair: "ETNJUSD", symbol: "ETN", name: "Eaton Corporation", type: "stock" },
      { pair: "IRUSD", symbol: "IR", name: "Ingersoll Rand", type: "stock" },
      { pair: "ROKUSD", symbol: "ROK", name: "Rockwell Automation", type: "stock" },
      { pair: "AMEUSD", symbol: "AME", name: "AMETEK", type: "stock" },
      { pair: "PHHUSD", symbol: "PH", name: "Parker-Hannifin", type: "stock" },
      { pair: "ITTWUSD", symbol: "ITW", name: "Illinois Tool Works", type: "stock" },
      { pair: "GWNWUSD", symbol: "GWW", name: "W.W. Grainger", type: "stock" },
      { pair: "FASTTUSD", symbol: "FAST", name: "Fastenal", type: "stock" },
      { pair: "UPSUSD", symbol: "UPS", name: "United Parcel Service", type: "stock" },
      { pair: "FDXUSD", symbol: "FDX", name: "FedEx", type: "stock" },
      { pair: "UNIPUSD", symbol: "UNP", name: "Union Pacific", type: "stock" },
      { pair: "CSUUSD", symbol: "CSX", name: "CSX Corporation", type: "stock" },
      { pair: "NSCUSD", symbol: "NSC", name: "Norfolk Southern", type: "stock" },
      { pair: "JBHTTUSD", symbol: "JBHT", name: "J.B. Hunt Transport", type: "stock" },
      { pair: "XPOUSD", symbol: "XPO", name: "XPO", type: "stock" },
      { pair: "AALUSD", symbol: "AAL", name: "American Airlines", type: "stock" },
      { pair: "DALUSD", symbol: "DAL", name: "Delta Air Lines", type: "stock" },
      { pair: "UALUSD", symbol: "UAL", name: "United Airlines", type: "stock" },
      { pair: "LWWUSD", symbol: "LUV", name: "Southwest Airlines", type: "stock" },
      { pair: "RCLUSD", symbol: "RCL", name: "Royal Caribbean", type: "stock" },
      { pair: "NCLHUSD", symbol: "NCLH", name: "Norwegian Cruise Line", type: "stock" },
      { pair: "CCLUSD", symbol: "CCL", name: "Carnival Corporation", type: "stock" },
      { pair: "MARUSD", symbol: "MAR", name: "Marriott International", type: "stock" },
      { pair: "HLTUSD", symbol: "HLT", name: "Hilton Worldwide", type: "stock" },
      { pair: "HYATUSD", symbol: "H", name: "Hyatt Hotels", type: "stock" },
      { pair: "EXPEDUSD", symbol: "EXPE", name: "Expedia", type: "stock" },
      { pair: "BKNGUSD", symbol: "BKNG", name: "Booking Holdings", type: "stock" },
      { pair: "ABNBUSD", symbol: "ABNB", name: "Airbnb", type: "stock" },
      { pair: "LYFTUSD", symbol: "LYFT", name: "Lyft", type: "stock" },
      { pair: "UBERUSD", symbol: "UBER", name: "Uber Technologies", type: "stock" },
      { pair: "DASHUSD", symbol: "DASH", name: "DoorDash", type: "stock" },
      
      // ============ xSTOCKS - Media & Entertainment ============
      { pair: "DISUSD", symbol: "DIS", name: "Disney", type: "stock" },
      { pair: "CMPAXUSD", symbol: "CMCSA", name: "Comcast", type: "stock" },
      { pair: "CHRTRUSD", symbol: "CHTR", name: "Charter Communications", type: "stock" },
      { pair: "WBDUSD", symbol: "WBD", name: "Warner Bros. Discovery", type: "stock" },
      { pair: "PARAAUSD", symbol: "PARA", name: "Paramount Global", type: "stock" },
      { pair: "FOXUSD", symbol: "FOX", name: "Fox Corporation", type: "stock" },
      { pair: "NWSUSD", symbol: "NWSA", name: "News Corporation", type: "stock" },
      { pair: "VIUZUSD", symbol: "VIAC", name: "ViacomCBS", type: "stock" },
      { pair: "IPGUSD", symbol: "IPG", name: "Interpublic Group", type: "stock" },
      { pair: "OMCUSD", symbol: "OMC", name: "Omnicom Group", type: "stock" },
      { pair: "TTDUSD", symbol: "TTD", name: "The Trade Desk", type: "stock" },
      { pair: "ROKUXUSD", symbol: "ROKU", name: "Roku", type: "stock" },
      { pair: "SPOTTUSD", symbol: "SPOT", name: "Spotify", type: "stock" },
      { pair: "LYUSD", symbol: "LYV", name: "Live Nation Entertainment", type: "stock" },
      { pair: "EAUSD", symbol: "EA", name: "Electronic Arts", type: "stock" },
      { pair: "TTTTWOUSD", symbol: "TTWO", name: "Take-Two Interactive", type: "stock" },
      { pair: "ATVIUSD", symbol: "ATVI", name: "Activision Blizzard", type: "stock" },
      { pair: "RBXLUSD", symbol: "RBLX", name: "Roblox", type: "stock" },
      { pair: "UNITYYUSD", symbol: "U", name: "Unity Software", type: "stock" },
      { pair: "GMEUSD", symbol: "GME", name: "GameStop", type: "stock" },
      { pair: "AMCUSD", symbol: "AMC", name: "AMC Entertainment", type: "stock" },
      { pair: "NYTTUSD", symbol: "NYT", name: "New York Times", type: "stock" },
      
      // ============ xSTOCKS - Telecom & Communication ============
      { pair: "TUSD", symbol: "T", name: "AT&T", type: "stock" },
      { pair: "VZUSD", symbol: "VZ", name: "Verizon", type: "stock" },
      { pair: "TMSUSD", symbol: "TMUS", name: "T-Mobile US", type: "stock" },
      { pair: "AMTUSD", symbol: "AMT", name: "American Tower", type: "stock" },
      { pair: "CCIUSD", symbol: "CCI", name: "Crown Castle", type: "stock" },
      { pair: "SBACUSD", symbol: "SBAC", name: "SBA Communications", type: "stock" },
      
      // ============ xSTOCKS - Real Estate ============
      { pair: "PLDDUSD", symbol: "PLD", name: "Prologis", type: "stock" },
      { pair: "EQUIXUSD", symbol: "EQIX", name: "Equinix", type: "stock" },
      { pair: "WLKUSD", symbol: "WELL", name: "Welltower", type: "stock" },
      { pair: "DLRUSD", symbol: "DLR", name: "Digital Realty Trust", type: "stock" },
      { pair: "OUSD", symbol: "O", name: "Realty Income", type: "stock" },
      { pair: "SPGUSD", symbol: "SPG", name: "Simon Property Group", type: "stock" },
      { pair: "AVBUSD", symbol: "AVB", name: "AvalonBay Communities", type: "stock" },
      { pair: "EQUSD", symbol: "EQR", name: "Equity Residential", type: "stock" },
      { pair: "PSAUSD", symbol: "PSA", name: "Public Storage", type: "stock" },
      { pair: "EXRUSD", symbol: "EXR", name: "Extra Space Storage", type: "stock" },
      { pair: "AREUSD", symbol: "ARE", name: "Alexandria Real Estate", type: "stock" },
      { pair: "CBREUSD", symbol: "CBRE", name: "CBRE Group", type: "stock" },
      { pair: "JLLUSD", symbol: "JLL", name: "Jones Lang LaSalle", type: "stock" },
      
      // ============ xSTOCKS - Utilities ============
      { pair: "NEXUSD", symbol: "NEE", name: "NextEra Energy", type: "stock" },
      { pair: "DUKUSD", symbol: "DUK", name: "Duke Energy", type: "stock" },
      { pair: "SOUSD", symbol: "SO", name: "Southern Company", type: "stock" },
      { pair: "DUSD", symbol: "D", name: "Dominion Energy", type: "stock" },
      { pair: "AEPUSD", symbol: "AEP", name: "American Electric Power", type: "stock" },
      { pair: "XCEELUSD", symbol: "XEL", name: "Xcel Energy", type: "stock" },
      { pair: "WEECUSD", symbol: "WEC", name: "WEC Energy Group", type: "stock" },
      { pair: "EDDUSD", symbol: "ED", name: "Consolidated Edison", type: "stock" },
      { pair: "EXCCUSD", symbol: "EXC", name: "Exelon", type: "stock" },
      { pair: "PEGUSD", symbol: "PEG", name: "Public Service Enterprise", type: "stock" },
      { pair: "AWKKUSD", symbol: "AWK", name: "American Water Works", type: "stock" },
      { pair: "WMTUSD", symbol: "WM", name: "Waste Management", type: "stock" },
      { pair: "RSGUSD", symbol: "RSG", name: "Republic Services", type: "stock" },
      { pair: "VSTRRAUSD", symbol: "VST", name: "Vistra", type: "stock" },
      
      // ============ xSTOCKS - Materials ============
      { pair: "LNIUSD", symbol: "LIN", name: "Linde", type: "stock" },
      { pair: "APDUSD", symbol: "APD", name: "Air Products and Chemicals", type: "stock" },
      { pair: "SHWUSD", symbol: "SHW", name: "Sherwin-Williams", type: "stock" },
      { pair: "ECLUSD", symbol: "ECL", name: "Ecolab", type: "stock" },
      { pair: "DDUSD", symbol: "DD", name: "DuPont", type: "stock" },
      { pair: "DOWIUSD", symbol: "DOW", name: "Dow", type: "stock" },
      { pair: "PPGBUSD", symbol: "PPG", name: "PPG Industries", type: "stock" },
      { pair: "FCXUSD", symbol: "FCX", name: "Freeport-McMoRan", type: "stock" },
      { pair: "NEMUSD", symbol: "NEM", name: "Newmont", type: "stock" },
      { pair: "NUEUSD", symbol: "NUE", name: "Nucor", type: "stock" },
      { pair: "CRHUSD", symbol: "CRH", name: "CRH", type: "stock" },
      { pair: "VMCUSD", symbol: "VMC", name: "Vulcan Materials", type: "stock" },
      { pair: "MLMUSD", symbol: "MLM", name: "Martin Marietta Materials", type: "stock" },
      { pair: "BALLUSD", symbol: "BALL", name: "Ball Corporation", type: "stock" },
      { pair: "PKGUSD", symbol: "PKG", name: "Packaging Corporation", type: "stock" },
      { pair: "IPUSD", symbol: "IP", name: "International Paper", type: "stock" },
      
      // ============ xSTOCKS - AI & High-Growth Tech ============
      { pair: "AITUSD", symbol: "AI", name: "C3.ai", type: "stock" },
      { pair: "SNDDUSD", symbol: "SND", name: "SoundHound AI", type: "stock" },
      { pair: "BBBUSD", symbol: "BBAI", name: "BigBear.ai", type: "stock" },
      { pair: "UPLOUSD", symbol: "UPLD", name: "Upland Software", type: "stock" },
      { pair: "PRIMUSD", symbol: "PRCT", name: "Procept BioRobotics", type: "stock" },
      { pair: "SYMHUSD", symbol: "SMCI", name: "Super Micro Computer", type: "stock" },
      { pair: "IOTUSD", symbol: "IONQ", name: "IonQ", type: "stock" },
      { pair: "QSIUSD", symbol: "QBTS", name: "D-Wave Quantum", type: "stock" },
      { pair: "RGTIUSD", symbol: "RGTI", name: "Rigetti Computing", type: "stock" },
    ];

    // Find all active users
    const { data: active, error: activeErr } = await supabaseAdmin
      .from("trader_state")
      .select("user_id,swarm_active,autonomy_mode")
      .eq("swarm_active", true);
    if (activeErr) return jsonResponse({ error: activeErr.message }, 500);

    const users = (active || []).map((r) => r.user_id).filter(Boolean);
    if (!users.length) return jsonResponse({ success: true, processed: 0 });

    const today = new Date().toISOString().slice(0, 10);
    const results: Array<{ user_id: string; status: string; pair?: string; detail?: string }> = [];
    
    // Track best opportunity across all pairs
    let bestPair = tradingPairs[0];
    let bestPct = 0;
    let bestOhlc = { high: 0, low: 0, volume: 0 };

    // Fetch market data for all pairs in parallel
    const pairDataPromises = tradingPairs.map(async (p) => {
      const [pct, ohlc] = await Promise.all([
        krakenPctChange(p.pair),
        krakenOHLC(p.pair),
      ]);
      return { ...p, pct, ohlc };
    });
    const pairData = await Promise.all(pairDataPromises);
    
    // Find best trading opportunity (looking for dips or strong momentum)
    for (const pd of pairData) {
      // Prefer dips (negative), but also consider strong positive momentum
      const score = pd.pct < 0 ? Math.abs(pd.pct) * 2 : pd.pct; // Weight dips higher
      if (score > Math.abs(bestPct) || bestPct === 0) {
        bestPair = pd;
        bestPct = pd.pct;
        bestOhlc = pd.ohlc;
      }
    }
    
    const bestAssetType = (bestPair as { type?: string }).type || "crypto";
    console.log(`[bot-tick] Best opportunity: ${bestPair.symbol} (${bestAssetType}) at ${bestPct.toFixed(2)}%`);

    for (const userId of users) {
      // pull keys
      const { data: keys, error: keysErr } = await supabaseAdmin
        .from("user_exchange_keys")
        .select("kraken_key,kraken_secret,default_take_profit_percent,default_stop_loss_percent,trailing_stop_percent,max_position_percent")
        .eq("user_id", userId)
        .maybeSingle();
      if (keysErr) {
        results.push({ user_id: userId, status: "error", detail: keysErr.message });
        continue;
      }
      
      const hasKrakenKeys = Boolean(keys?.kraken_key && keys?.kraken_secret);

      // daily limit
      const { data: stat } = await supabaseAdmin
        .from("user_bot_daily_stats")
        .select("orders_count")
        .eq("user_id", userId)
        .eq("day", today)
        .maybeSingle();
      const ordersCount = Number(stat?.orders_count || 0);
      const ordersLeft = ordersCount < maxOrdersPerDay;

      // Use best pair for analysis
      const krakenPair = bestPair.pair;
      const pct = bestPct;
      const ohlc = bestOhlc;
      const assetType = (bestPair as { type?: string }).type || "crypto";

      let c = council(pct, ordersLeft);
      let totalMembers = 5;
      let yesVotes = Number(String(c.votes).split("/")[0] || "0");

      // Run ALL AI analysts in parallel for maximum speed (uses Lovable AI + Perplexity - no user config needed)
      const aiContext = { pct, krakenPair, symbol: bestPair.symbol, ordersLeft, assetType };
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
        // Pro-level AI analysts (uses Gemini 2.5 Pro for deeper reasoning)
        masterStrategistResult,
        riskAssessorResult,
        patternRecognitionResult,
        // Real-time search (uses Perplexity for live news)
        perplexityNewsResult,
        // Stock-specific analysts (only run for stocks)
        stockFundamentalResult,
        stockEarningsResult,
        stockSectorResult,
        stockInstitutionalResult,
        // Options flow and high-frequency trading algorithms
        optionsFlowResult,
        microScalperResult,
        pennyHunterResult,
        etfMomentumResult,
        compoundGrowthResult,
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
        // Pro models
        masterStrategistVote(ohlcContext),
        aiRiskAssessorVote(ohlcContext),
        patternRecognitionVote(ohlcContext),
        // Real-time search
        perplexityNewsVote(aiContext),
        // Stock-specific analysts
        stockFundamentalAnalystVote(aiContext),
        stockEarningsAnalystVote(aiContext),
        stockSectorRotationVote(aiContext),
        stockInstitutionalFlowVote(aiContext),
        // Options flow and high-frequency trading
        optionsFlowAnalystVote(aiContext),
        microScalperVote(ohlcContext),
        pennyStockHunterVote(ohlcContext),
        etfMomentumRiderVote(ohlcContext),
        compoundGrowthVote(aiContext),
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
        // Pro-level analysts
        { result: masterStrategistResult, name: "Master Strategist (Pro)" },
        { result: riskAssessorResult, name: "AI Risk Assessor (Pro)" },
        { result: patternRecognitionResult, name: "Pattern Recognition AI" },
        // Real-time search
        { result: perplexityNewsResult, name: "Live News Search" },
        // Stock-specific analysts (only populated for stocks)
        { result: stockFundamentalResult, name: "Stock Fundamentals (P/E)" },
        { result: stockEarningsResult, name: "Earnings Analyst" },
        { result: stockSectorResult, name: "Sector Rotation" },
        { result: stockInstitutionalResult, name: "Institutional Flow" },
        // Options flow and high-frequency trading
        { result: optionsFlowResult, name: "Options Flow AI" },
        { result: microScalperResult, name: "Micro-Scalper ($10M Goal)" },
        { result: pennyHunterResult, name: "Penny/Meme Hunter" },
        { result: etfMomentumResult, name: "ETF Momentum Rider" },
        { result: compoundGrowthResult, name: "Compound Growth AI" },
      ];

      for (const { result, name } of aiVotes) {
        if (result) {
          totalMembers++;
          if (result.vote) yesVotes++;
          c.reasons.push(`${result.vote ? "YES" : "NO"}: ${name} • ${result.reason}`);
        }
      }

      // Lovable AI Strategist vote - uses pre-configured LOVABLE_API_KEY (no user key needed)
      const lovableVote = await lovableAiStrategistVote({ context: aiContext });
      if (lovableVote) {
        totalMembers++;
        if (lovableVote.vote) yesVotes++;
        c.reasons.push(`${lovableVote.vote ? "YES" : "NO"}: AI Strategist • ${lovableVote.reason}`);
      }

      // Recalculate approval with all members
      // ULTRA-AGGRESSIVE: Maximum trading frequency for constant micro-gains
      // Only need 25-35% approval to execute trades - prioritize volume over certainty
      
      const isAnyPositiveSignal = yesVotes >= 2; // At least 2 yes votes
      const hasAnyMomentum = Math.abs(pct) > 0.1; // Any movement > 0.1%
      
      // Ultra-low thresholds for maximum trade execution
      let thresholdPercent = 0.25; // Default: only 25% needed
      let thresholdReason = "ultra-aggressive";
      
      if (notionalUsd < 50) {
        thresholdPercent = 0.15; // Only 15% for tiny trades under $50
        thresholdReason = "micro<$50";
      } else if (notionalUsd < 100) {
        thresholdPercent = 0.20; // 20% for trades under $100
        thresholdReason = "micro<$100";
      } else if (notionalUsd < 250) {
        thresholdPercent = 0.25; // 25% for trades under $250
        thresholdReason = "small<$250";
      } else if (notionalUsd < 500) {
        thresholdPercent = 0.30; // 30% for trades under $500
        thresholdReason = "medium<$500";
      } else {
        thresholdPercent = 0.35; // 35% for larger trades
        thresholdReason = "standard";
      }
      
      const threshold = Math.max(Math.ceil(totalMembers * thresholdPercent), 2); // Minimum 2 votes needed
      console.log(`[bot-tick] ULTRA-AGGRESSIVE Threshold: ${(thresholdPercent * 100).toFixed(0)}% (${thresholdReason}) = ${threshold}/${totalMembers} votes needed, got ${yesVotes}`);
      
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
        p_trade_message: `Bot tick: ${bestPair.symbol} (${krakenPair}) ${pct.toFixed(2)}% • ${c.votes} council vote`,
      });

      if (!c.approved || !ordersLeft) {
        results.push({ user_id: userId, status: "no_trade", pair: bestPair.symbol });
        continue;
      }

      // Skip trading if Kraken keys are missing
      if (!hasKrakenKeys) {
        results.push({ user_id: userId, status: "skipped", detail: "missing Kraken keys" });
        continue;
      }

      // place Kraken crypto order (requires BOT_ALLOW_LIVE=true for safety)
      if (!allowLive) {
        results.push({ user_id: userId, status: "blocked", detail: "live trading disabled (set BOT_ALLOW_LIVE=true)" });
        continue;
      }

      try {
        // Get user's TP/SL/Position sizing settings with validation
        const tradingConfig = validateTradingConfig(keys as Record<string, unknown> | null);
        const { takeProfitPercent, stopLossPercent, trailingStopPercent, maxPositionPercent } = tradingConfig;
        const trailingEnabled = trailingStopPercent !== null && trailingStopPercent > 0;
        
        console.log(`[bot-tick] Validated trading config: TP=${takeProfitPercent}%, SL=${stopLossPercent}%, Trail=${trailingStopPercent ?? 'off'}%, MaxPos=${maxPositionPercent}%`);

        // Get user's portfolio value to calculate position size
        const { data: traderState } = await supabaseAdmin
          .from("trader_state")
          .select("portfolio_value,balance")
          .eq("user_id", userId)
          .maybeSingle();
        
        const portfolioValue = clampNumber(traderState?.portfolio_value ?? traderState?.balance, 0, 1e12, 0);
        
        // Calculate and validate order size
        const maxPositionUsd = portfolioValue > 0 
          ? Math.min(portfolioValue * (maxPositionPercent / 100), notionalUsd)
          : notionalUsd;
        
        const actualOrderSize = validateOrderSize(Math.max(maxPositionUsd, 10), portfolioValue, maxPositionPercent);
        
        console.log(`[bot-tick] Position sizing: Portfolio $${portfolioValue.toFixed(2)}, Max ${maxPositionPercent}% = $${maxPositionUsd.toFixed(2)}, Order: $${actualOrderSize.toFixed(2)}`);

        // First, check existing positions and execute take-profit/stop-loss/trailing-stop
        const positionCheckResult = await checkAndClosePositions({
          supabaseAdmin,
          userId,
          krakenKey: String(keys?.kraken_key || ""),
          krakenSecret: String(keys?.kraken_secret || ""),
          allowLive,
          trailingStopPercent: trailingStopPercent || undefined,
        });

        // Log position check results
        for (const msg of positionCheckResult.messages) {
          await supabaseAdmin.rpc("update_trader_state_from_webhook", {
            p_user_id: userId,
            p_trade_message: msg,
          });
        }

        // Now place the new buy order with position-sized amount
        const orderResult = await krakenPlaceOrder({
          krakenKey: String(keys?.kraken_key || ""),
          krakenSecret: String(keys?.kraken_secret || ""),
          pair: krakenPair,
          volumeUsd: actualOrderSize,
        });

        // Create position record for tracking with validated TP/SL and trailing stop
        await (supabaseAdmin.from("positions") as any).insert({
          user_id: userId,
          symbol: bestPair.symbol,
          pair: krakenPair,
          side: "long",
          quantity: orderResult.volume,
          entry_price: orderResult.price,
          current_price: orderResult.price,
          take_profit_percent: takeProfitPercent,
          stop_loss_percent: stopLossPercent,
          trailing_stop_enabled: trailingEnabled,
          high_water_mark: orderResult.price,
          trailing_stop_price: trailingEnabled ? orderResult.price * (1 - (trailingStopPercent || 3) / 100) : null,
          status: "open",
          entry_txid: orderResult.txid.join(","),
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

        const trailInfo = trailingEnabled ? ` • Trail: ${trailingStopPercent}%` : "";
        const positionInfo = portfolioValue > 0 ? ` (${maxPositionPercent}% of portfolio)` : "";
        await supabaseAdmin.rpc("update_trader_state_from_webhook", {
          p_user_id: userId,
          p_trade_message: `🚀 BOUGHT ${bestPair.symbol} (${krakenPair}) ${orderResult.volume.toFixed(6)} @ $${orderResult.price.toFixed(2)} ($${actualOrderSize.toFixed(2)}${positionInfo}) • TP: ${takeProfitPercent}% / SL: ${stopLossPercent}%${trailInfo} • txid: ${orderResult.txid.join(",")}`,
        });

        results.push({ 
          user_id: userId, 
          status: "traded", 
          pair: bestPair.symbol,
          detail: `Bought + ${positionCheckResult.closed} positions closed`
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "order failed";
        results.push({ user_id: userId, status: "error", detail: msg });
        await supabaseAdmin.rpc("update_trader_state_from_webhook", {
          p_user_id: userId,
          p_trade_message: `Kraken order error: ${msg}`,
        });
      }
    }

    return jsonResponse({ 
      success: true, 
      processed: users.length, 
      bestPair: bestPair.symbol,
      pct: bestPct,
      allPairs: pairData.map(p => ({ symbol: p.symbol, pct: p.pct.toFixed(2) })),
      results 
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return jsonResponse({ error: msg }, 500);
  }
});
