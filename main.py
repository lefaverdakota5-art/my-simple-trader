import asyncio
import os
import sqlite3
import time
import logging
import sys
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

# Configure logging before anything else
logging.basicConfig(
    level=logging.INFO if os.getenv("DEBUG") != "true" else logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("app.log") if os.getenv("LOG_FILE") == "true" else logging.NullHandler()
    ]
)

logger = logging.getLogger(__name__)

try:
    # Optional convenience for local runs (does nothing if not installed / no .env).
    from dotenv import load_dotenv  # type: ignore
    load_dotenv()
    logger.info("Environment variables loaded from .env file")
except ImportError:
    logger.info("python-dotenv not installed, using environment variables only")
    pass

import requests
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
import krakenex
from pykrakenapi import KrakenAPI
from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.requests import StockLatestQuoteRequest, StockLatestBarRequest

from src.ai_modules.ensemble_ai import EnsembleAI
from src.ai_modules.news_sentiment import NewsSentiment
from src.ai_modules.hft import HighFrequencyTrader
from src.ai_modules.arbitrage import ArbitrageEngine
from src.ai_modules.profit_maximizer import ProfitMaximizer

# OpenAI is optional; if not installed, the council falls back to deterministic voting
try:
    from openai import OpenAI as OpenAIClient
except ImportError:
    OpenAIClient = None  # type: ignore
    logger.warning("OpenAI package not installed, AI council will use deterministic voting")




def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "t", "yes", "y", "on"}


@dataclass(frozen=True)
class Settings:
    # Supabase
    # Convenience: allow reusing Vite env var names when running locally.
    supabase_url: str | None = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    supabase_service_role_key: str | None = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    supabase_push_update_url: str | None = (
        os.getenv("SUPABASE_PUSH_UPDATE_URL") or os.getenv("SUPABASE_WEBHOOK")
    )  # Edge function URL (back-compat: SUPABASE_WEBHOOK)
    supabase_webhook_secret: str | None = os.getenv("SUPABASE_WEBHOOK_SECRET")
    poll_interval_seconds: float = float(os.getenv("BOT_POLL_INTERVAL_SECONDS", "10"))
    tick_interval_seconds: float = float(os.getenv("BOT_TICK_INTERVAL_SECONDS", "30"))

    # Trading mode & risk
    trading_mode: str = os.getenv("TRADING_MODE", "paper").strip().lower()  # paper|dry_run|live
    max_notional_per_order_usd: float = float(os.getenv("MAX_NOTIONAL_PER_ORDER_USD", "1.00"))
    max_orders_per_day: int = int(os.getenv("MAX_ORDERS_PER_DAY", "20"))

    # Local storage (for personal use)
    sqlite_path: str = os.getenv("BOT_SQLITE_PATH", "bot_data.sqlite")

    # CORS
    cors_origins: list[str] = field(
        default_factory=lambda: [
            o.strip()
            for o in os.getenv("BOT_CORS_ORIGINS", "*").split(",")
            if o.strip()
        ]
    )

    # Alpaca (stocks)
    alpaca_api_key: str | None = os.getenv("ALPACA_API_KEY")
    alpaca_secret: str | None = os.getenv("ALPACA_SECRET")
    alpaca_paper: bool = _env_bool("ALPACA_PAPER", True)
    alpaca_symbols: list[str] = field(
        default_factory=lambda: [
            s.strip().upper()
            for s in os.getenv("ALPACA_SYMBOLS", "AAPL,SPY").split(",")
            if s.strip()
        ]
    )

    # Kraken (crypto)
    kraken_key: str | None = os.getenv("KRAKEN_KEY")
    kraken_secret: str | None = os.getenv("KRAKEN_SECRET")
    kraken_pairs: list[str] = field(
        default_factory=lambda: [
            s.strip().upper()
            for s in os.getenv("KRAKEN_PAIRS", "XBTUSD,ETHUSD").split(",")
            if s.strip()
        ]
    )

    # Plaid (optional; enables bank linking and balances from the backend)
    plaid_client_id: str | None = os.getenv("PLAID_CLIENT_ID")
    plaid_secret: str | None = os.getenv("PLAID_SECRET")
    plaid_env: str = os.getenv("PLAID_ENV", "sandbox").strip().lower()  # sandbox|development|production
    plaid_products: list[str] = field(
        default_factory=lambda: [
            p.strip()
            for p in os.getenv("PLAID_PRODUCTS", "auth,transactions").split(",")
            if p.strip()
        ]
    )
    plaid_redirect_uri: str | None = os.getenv("PLAID_REDIRECT_URI")


SETTINGS = Settings()

# Log startup configuration
logger.info("="*50)
logger.info("AI Trader starting up")
logger.info("Trading Mode: %s", SETTINGS.trading_mode)
logger.info("Alpaca Paper: %s", SETTINGS.alpaca_paper)
logger.info("Max Notional per Order: $%.2f", SETTINGS.max_notional_per_order_usd)
logger.info("Max Orders per Day: %d", SETTINGS.max_orders_per_day)
logger.info("CORS Origins: %s", SETTINGS.cors_origins)
logger.info("="*50)


def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(SETTINGS.sqlite_path)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS plaid_item (
          user_id TEXT PRIMARY KEY,
          item_id TEXT NOT NULL,
          access_token TEXT NOT NULL,
          institution_name TEXT DEFAULT ''
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS plaid_account (
          user_id TEXT NOT NULL,
          account_id TEXT NOT NULL,
          name TEXT DEFAULT '',
          mask TEXT DEFAULT '',
          type TEXT DEFAULT '',
          subtype TEXT DEFAULT '',
          is_primary INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (user_id, account_id)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS bot_secret (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
        """
    )
    conn.commit()
    return conn


def _db_set_secret(key: str, value: str) -> None:
    conn = _db()
    with conn:
        conn.execute(
            "INSERT INTO bot_secret(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value),
        )


def _db_get_secret(key: str) -> str | None:
    conn = _db()
    row = conn.execute("SELECT value FROM bot_secret WHERE key=?", (key,)).fetchone()
    if not row:
        return None
    return str(row[0])


def _get_alpaca_creds() -> tuple[str | None, str | None]:
    return (
        SETTINGS.alpaca_api_key or _db_get_secret("ALPACA_API_KEY"),
        SETTINGS.alpaca_secret or _db_get_secret("ALPACA_SECRET"),
    )


def _get_kraken_creds() -> tuple[str | None, str | None]:
    return (
        SETTINGS.kraken_key or _db_get_secret("KRAKEN_KEY"),
        SETTINGS.kraken_secret or _db_get_secret("KRAKEN_SECRET"),
    )


def _get_plaid_creds() -> tuple[str | None, str | None, str]:
    client_id = SETTINGS.plaid_client_id or _db_get_secret("PLAID_CLIENT_ID")
    secret = SETTINGS.plaid_secret or _db_get_secret("PLAID_SECRET")
    env = SETTINGS.plaid_env or (_db_get_secret("PLAID_ENV") or "sandbox")
    return client_id, secret, env.strip().lower() if isinstance(env, str) else "sandbox"


def _get_openai_creds() -> tuple[str | None, str]:
    """Get OpenAI API key and model from DB or env."""
    api_key = _db_get_secret("OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY")
    model = _db_get_secret("OPENAI_MODEL") or os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    return api_key, model


def _supabase_user_id_from_jwt(jwt: str) -> str | None:
    if not SETTINGS.supabase_url or not SETTINGS.supabase_service_role_key:
        return None
    try:
        r = requests.get(
            f"{SETTINGS.supabase_url.rstrip('/')}/auth/v1/user",
            headers={
                "apikey": SETTINGS.supabase_service_role_key,
                "Authorization": f"Bearer {jwt}",
            },
            timeout=10,
        )
        if r.status_code != 200:
            return None
        return str(r.json().get("id"))
    except Exception:
        return None


def _supabase_get_row(table: str, select: str, filters: dict[str, str]) -> dict[str, Any] | None:
    if not SETTINGS.supabase_url or not SETTINGS.supabase_service_role_key:
        return None
    endpoint = f"{SETTINGS.supabase_url.rstrip('/')}/rest/v1/{table}"
    params = {"select": select, **filters}
    r = requests.get(
        endpoint,
        headers={
            "apikey": SETTINGS.supabase_service_role_key,
            "Authorization": f"Bearer {SETTINGS.supabase_service_role_key}",
            "Accept": "application/json",
        },
        params=params,
        timeout=15,
    )
    if r.status_code != 200:
        return None
    rows = r.json() or []
    return rows[0] if rows else None


def _supabase_get_rows(table: str, select: str, filters: dict[str, str]) -> list[dict[str, Any]]:
    if not SETTINGS.supabase_url or not SETTINGS.supabase_service_role_key:
        return []
    endpoint = f"{SETTINGS.supabase_url.rstrip('/')}/rest/v1/{table}"
    params = {"select": select, **filters}
    r = requests.get(
        endpoint,
        headers={
            "apikey": SETTINGS.supabase_service_role_key,
            "Authorization": f"Bearer {SETTINGS.supabase_service_role_key}",
            "Accept": "application/json",
        },
        params=params,
        timeout=15,
    )
    if r.status_code != 200:
        return []
    return r.json() or []


def _plaid_base_url() -> str:
    _, _, env = _get_plaid_creds()
    if env == "production":
        return "https://production.plaid.com"
    if env == "development":
        return "https://development.plaid.com"
    return "https://sandbox.plaid.com"


def _plaid_post(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    client_id, secret, _ = _get_plaid_creds()
    if not client_id or not secret:
        raise RuntimeError("Plaid not configured (PLAID_CLIENT_ID/PLAID_SECRET missing)")
    body = {
        "client_id": client_id,
        "secret": secret,
        **payload,
    }
    r = requests.post(
        f"{_plaid_base_url()}{path}",
        json=body,
        headers={"Content-Type": "application/json"},
        timeout=20,
    )
    data = r.json()
    if r.status_code >= 400:
        raise RuntimeError(data.get("error_message") or f"Plaid error ({r.status_code})")
    return data


def _plaid_transfer_enabled() -> bool:
    return _env_bool("PLAID_ENABLE_TRANSFERS", False)


def _plaid_processor_enabled() -> bool:
    return _env_bool("PLAID_ENABLE_PROCESSOR", True)

def _kraken_trading_enabled() -> bool:
    return _env_bool("KRAKEN_ENABLE_TRADING", False)


def _kraken_withdrawals_enabled() -> bool:
    return _env_bool("KRAKEN_ENABLE_WITHDRAWALS", False)


def _db_get_plaid_access_token(user_id: str) -> str | None:
    conn = _db()
    row = conn.execute(
        "SELECT access_token FROM plaid_item WHERE user_id=?",
        (user_id,),
    ).fetchone()
    if not row:
        return None
    return str(row[0])


def _db_get_primary_plaid_account_id(user_id: str) -> str | None:
    conn = _db()
    row = conn.execute(
        "SELECT account_id FROM plaid_account WHERE user_id=? ORDER BY is_primary DESC LIMIT 1",
        (user_id,),
    ).fetchone()
    if not row:
        return None
    return str(row[0])

def _round_down(value: float, decimals: int) -> float:
    if decimals <= 0:
        return float(int(value))
    factor = 10 ** decimals
    return float(int(value * factor)) / factor


def _kraken_public(k: krakenex.API, method: str, data: dict[str, Any] | None = None) -> dict[str, Any]:
    resp = k.query_public(method, data or {})
    if resp.get("error"):
        raise RuntimeError(f"Kraken error: {resp['error']}")
    return resp.get("result") or {}


def _kraken_private(k: krakenex.API, method: str, data: dict[str, Any] | None = None) -> dict[str, Any]:
    resp = k.query_private(method, data or {})
    if resp.get("error"):
        raise RuntimeError(f"Kraken error: {resp['error']}")
    return resp.get("result") or {}


def _kraken_find_usd_pair(asset: str, asset_pairs: dict[str, Any]) -> tuple[str, dict[str, Any]] | None:
    # Prefer USD (ZUSD) pairs, then USDT, then USDC.
    preferred_quotes = {"ZUSD", "USD", "USDT", "USDC"}
    candidates: list[tuple[int, str, dict[str, Any]]] = []
    for pair_name, meta in asset_pairs.items():
        base = str(meta.get("base") or "")
        quote = str(meta.get("quote") or "")
        if not base or not quote:
            continue
        if base != asset:
            continue
        if quote not in preferred_quotes:
            continue
        rank = {"ZUSD": 0, "USD": 1, "USDT": 2, "USDC": 3}.get(quote, 9)
        candidates.append((rank, pair_name, meta))
    if not candidates:
        return None
    candidates.sort(key=lambda x: x[0])
    _, pair_name, meta = candidates[0]
    return pair_name, meta


def _kraken_public_ticker(pair: str) -> tuple[float | None, float | None]:
    """
    Returns (last, open) using Kraken public REST (no auth).
    """
    try:
        r = requests.get(
            "https://api.kraken.com/0/public/Ticker",
            params={"pair": pair},
            timeout=10,
        )
        data = r.json()
        if data.get("error"):
            return None, None
        result = data.get("result") or {}
        first = next(iter(result.values()), None)
        if not first:
            return None, None
        last = float(first["c"][0])
        open_ = float(first["o"])
        return last, open_
    except Exception:
        return None, None


def _alpaca_latest_snapshot(symbols: list[str]) -> dict[str, dict[str, float]]:
    """
    Best-effort latest prices from Alpaca data API (requires Alpaca keys).
    Returns per-symbol dict; empty if unavailable.
    """
    alpaca_key, alpaca_secret = _get_alpaca_creds()
    if not (alpaca_key and alpaca_secret) or not symbols:
        return {}

    symbols = [s.strip().upper() for s in symbols if s.strip()]
    if not symbols:
        return {}

    out: dict[str, dict[str, float]] = {}
    try:
        client = StockHistoricalDataClient(alpaca_key, alpaca_secret)
        quotes = client.get_stock_latest_quote(StockLatestQuoteRequest(symbol_or_symbols=symbols))
        for sym, q in quotes.items():
            try:
                out[str(sym)] = {"bid": float(q.bid_price), "ask": float(q.ask_price)}
            except Exception:
                continue
        if out:
            return out
    except Exception:
        pass

    # Fallback to bars
    try:
        client = StockHistoricalDataClient(alpaca_key, alpaca_secret)
        bars = client.get_stock_latest_bar(StockLatestBarRequest(symbol_or_symbols=symbols))
        for sym, b in bars.items():
            try:
                out[str(sym)] = {"open": float(b.open), "close": float(b.close)}
            except Exception:
                continue
    except Exception:
        pass
    return out


class PushUpdateClient:
    def __init__(self, url: str, webhook_secret: str | None) -> None:
        self._url = url
        self._secret = webhook_secret

    def send_update(
        self,
        *,
        user_id: str,
        balance: float | None = None,
        today_pl: float | None = None,
        portfolio_value: float | None = None,
        progress_percent: float | None = None,
        win_rate: float | None = None,
        new_trade: str | None = None,
        council_votes: str | None = None,
        council_reasons: list[str] | None = None,
        withdraw_status: str | None = None,
    ) -> None:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._secret:
            headers["x-webhook-secret"] = self._secret

        payload: dict[str, Any] = {
            "user_id": user_id,
            "balance": balance,
            "today_pl": today_pl,
            "portfolio_value": portfolio_value,
            "progress_percent": progress_percent,
            "win_rate": win_rate,
            "new_trade": new_trade,
            "council_votes": council_votes,
            "council_reasons": council_reasons,
            "withdraw_status": withdraw_status,
        }

        try:
            r = requests.post(self._url, json=payload, headers=headers, timeout=10)
            r.raise_for_status()
        except Exception as e:
            # Don't crash bots due to telemetry issues
            logger.warning(f"[push-update] failed: {e}")


class SupabaseAdmin:
    def __init__(self, url: str, service_key: str) -> None:
        self._url = url.rstrip("/")
        self._service_key = service_key

    def _headers(self) -> dict[str, str]:
        return {
            "apikey": self._service_key,
            "Authorization": f"Bearer {self._service_key}",
            "Accept": "application/json",
        }

    def list_active_swarm_user_ids(self) -> set[str]:
        # Uses service role key to bypass RLS.
        endpoint = f"{self._url}/rest/v1/trader_state"
        params = {
            "select": "user_id,swarm_active",
            "swarm_active": "eq.true",
        }
        r = requests.get(endpoint, headers=self._headers(), params=params, timeout=10)
        r.raise_for_status()
        rows = r.json() or []
        return {str(row["user_id"]) for row in rows if row.get("user_id")}

    def get_user_exchange_keys(self, user_id: str) -> dict[str, Any] | None:
        endpoint = f"{self._url}/rest/v1/user_exchange_keys"
        params = {"select": "*", "user_id": f"eq.{user_id}", "limit": "1"}
        r = requests.get(endpoint, headers=self._headers(), params=params, timeout=10)
        if r.status_code != 200:
            return None
        rows = r.json() or []
        return rows[0] if rows else None


def _council_vote_from_price_change(pct_change: float, orders_left: bool) -> tuple[str, list[str], bool]:
    # Lightweight “5-AI council”: 4/5 YES required to trade.
    # These are deterministic heuristics (no external AI calls).
    ai1 = pct_change > 0.10  # Momentum (strict)
    ai2 = pct_change > 0.05  # Momentum (medium)
    ai3 = pct_change > 0.00  # Momentum (loose)
    ai4 = abs(pct_change) <= 2.00  # Volatility sanity check
    ai5 = orders_left  # Risk governor

    votes = [ai1, ai2, ai3, ai4, ai5]
    yes = sum(1 for v in votes if v)
    reasons = [
        ("YES" if ai1 else "NO") + f": momentum>0.10% ({pct_change:.2f}%)",
        ("YES" if ai2 else "NO") + f": momentum>0.05% ({pct_change:.2f}%)",
        ("YES" if ai3 else "NO") + f": momentum>0.00% ({pct_change:.2f}%)",
        ("YES" if ai4 else "NO") + f": volatility<=2.00% ({pct_change:.2f}%)",
        ("YES" if ai5 else "NO") + ": risk limits (orders remaining today)",
    ]
    approved = yes >= 4
    return f"{yes}/5", reasons, approved


def _openai_council_vote(
    pct_change: float,
    orders_left: bool,
    openai_api_key: str,
    openai_model: str = "gpt-4o-mini",
) -> tuple[str, list[str], bool]:
    """
    Enhanced council voting using OpenAI for intelligent decision-making.
    Each of 5 AI agents analyzes the market data and votes YES/NO.
    4/5 YES votes are required to approve trading.
    """
    if not OpenAIClient:
        # Fallback to deterministic voting if OpenAI is not installed
        return _council_vote_from_price_change(pct_change, orders_left)
    
    try:
        client = OpenAIClient(api_key=openai_api_key)
        
        # Define 5 AI agents with different perspectives
        agents = [
            {
                "name": "Momentum Analyst",
                "role": "You are a momentum trading expert. Analyze if the price change indicates strong momentum worth trading.",
            },
            {
                "name": "Risk Manager",
                "role": "You are a conservative risk manager. Assess if the trade risk is acceptable given the volatility.",
            },
            {
                "name": "Technical Analyst",
                "role": "You are a technical analysis expert. Determine if technical indicators support this trade.",
            },
            {
                "name": "Market Sentiment Analyst",
                "role": "You are a market sentiment expert. Evaluate if the price change reflects positive market sentiment.",
            },
            {
                "name": "Portfolio Guardian",
                "role": "You are a portfolio protection specialist. Assess if trading now aligns with daily risk limits.",
            },
        ]
        
        market_data = f"""
Market Analysis Request:
- Price change: {pct_change:.2f}%
- Orders remaining today: {'Yes' if orders_left else 'No'}
- Risk limits: Orders left = {orders_left}

Respond with ONLY 'YES' or 'NO' followed by a brief one-sentence reason (max 80 chars).
Format: YES: [reason] or NO: [reason]
"""
        
        votes = []
        reasons = []
        max_reason_length = 80
        
        for agent in agents:
            try:
                response = client.chat.completions.create(
                    model=openai_model,
                    messages=[
                        {"role": "system", "content": agent["role"]},
                        {"role": "user", "content": market_data},
                    ],
                    max_tokens=50,
                    temperature=0.7,
                )
                
                result = response.choices[0].message.content.strip()
                vote = result.upper().startswith("YES")
                votes.append(vote)
                
                # Format the reason nicely with consistent truncation
                reason_text = result if len(result) < max_reason_length else result[:max_reason_length - 3] + "..."
                reasons.append(f"{agent['name']}: {reason_text}")
                
            except Exception as e:
                # If an agent fails, it votes NO by default
                error_msg = str(e)
                error_text = error_msg if len(error_msg) < 40 else error_msg[:37] + "..."
                votes.append(False)
                reasons.append(f"{agent['name']}: NO (error: {error_text})")
        
        yes_count = sum(votes)
        approved = yes_count >= 4
        
        return f"{yes_count}/5", reasons, approved
        
    except Exception as e:
        logger.warning(f"[openai-council] Error: {e}. Falling back to deterministic voting.")
        return _council_vote_from_price_change(pct_change, orders_left)


class UserBot:
    def __init__(
        self,
        *,
        user_id: str,
        push: PushUpdateClient,
        alpaca: TradingClient | None,
        kraken: KrakenAPI | None,
        settings: Settings,
        openai_api_key: str | None = None,
        openai_model: str = "gpt-4o-mini",
        openai_enabled: bool = False,
    ) -> None:
        self._user_id = user_id
        self._push = push
        self._alpaca = alpaca
        self._kraken = kraken
        self._settings = settings
        self._openai_api_key = openai_api_key
        self._openai_model = openai_model
        self._openai_enabled = openai_enabled

        self._day_key: str = self._today_key()
        self._orders_today: int = 0

    def _today_key(self) -> str:
        return datetime.now(tz=UTC).strftime("%Y-%m-%d")

    def _roll_day(self) -> None:
        today = self._today_key()
        if today != self._day_key:
            self._day_key = today
            self._orders_today = 0

    def _orders_left(self) -> bool:
        return self._orders_today < self._settings.max_orders_per_day

    def _maybe_inc_orders(self) -> None:
        self._orders_today += 1

    def _get_trader_state_balance(self) -> float:
        """Get current balance from trader_state in Supabase."""
        if not SETTINGS.supabase_url or not SETTINGS.supabase_service_role_key:
            return 0.0
        try:
            row = _supabase_get_row(
                "trader_state",
                "balance",
                {"user_id": f"eq.{self._user_id}"}
            )
            if row and "balance" in row:
                return float(row["balance"])
            return 0.0
        except Exception as e:
            print(f"[trader-state] get balance failed: {e}")
            return 0.0

    def _update_trader_state_balance(self, new_balance: float) -> None:
        """Update balance in trader_state in Supabase."""
        if not SETTINGS.supabase_url or not SETTINGS.supabase_service_role_key:
            return
        try:
            endpoint = f"{SETTINGS.supabase_url.rstrip('/')}/rest/v1/trader_state"
            headers = {
                "apikey": SETTINGS.supabase_service_role_key,
                "Authorization": f"Bearer {SETTINGS.supabase_service_role_key}",
                "Content-Type": "application/json",
            }
            data = {
                "user_id": self._user_id,
                "balance": new_balance,
                "updated_at": datetime.now(tz=UTC).isoformat(),
            }
            r = requests.post(
                endpoint,
                headers={**headers, "Prefer": "resolution=merge-duplicates"},
                json=data,
                timeout=10,
            )
            r.raise_for_status()
        except Exception as e:
            print(f"[trader-state] update balance failed: {e}")

    def _kraken_get_portfolio_value(self) -> float | None:
        """Get total portfolio value from Kraken (all balances in USD equivalent)."""
        if not self._kraken:
            return None
        try:
            bal = self._kraken.get_account_balance()
            total_usd = 0.0
            
            for asset, row in bal.iterrows():
                try:
                    amount = float(row.iloc[0])
                except Exception:
                    continue
                if amount <= 0:
                    continue
                    
                # USD-like assets are 1:1
                if str(asset) in {"ZUSD", "USD", "USDT", "USDC"}:
                    total_usd += amount
                else:
                    # For other assets, try to get USD price
                    try:
                        # Get ticker for this asset paired with USD
                        k = self._kraken.api
                        asset_pairs = _kraken_public(k, "AssetPairs")
                        pair_info = _kraken_find_usd_pair(str(asset), asset_pairs)
                        if pair_info:
                            pair_name, _ = pair_info
                            last, _ = _kraken_public_ticker(pair_name)
                            if last:
                                total_usd += amount * last
                    except Exception:
                        continue
            
            return total_usd
        except Exception as e:
            print(f"[kraken] get portfolio value failed: {e}")
            return None

    def _alpaca_equity(self) -> tuple[float | None, float | None]:
        if not self._alpaca:
            return None, None
        try:
            acct = self._alpaca.get_account()
            equity = float(acct.equity) if getattr(acct, "equity", None) is not None else None
            cash = float(acct.cash) if getattr(acct, "cash", None) is not None else None
            return cash, equity
        except Exception as e:
            print(f"[alpaca] get_account failed: {e}")
            return None, None

    def _kraken_trade_one_pair(self, pair: str) -> None:
        """Execute a Kraken buy order using trader_state balance."""
        if not self._kraken:
            print(f"[kraken-trade] Skipped {pair}: No Kraken client configured")
            return
        if self._settings.trading_mode not in {"paper", "live"}:
            print(f"[kraken-trade] Skipped {pair}: Trading mode is {self._settings.trading_mode}")
            return
        if not _kraken_trading_enabled():
            msg = "Kraken trading is disabled. Set KRAKEN_ENABLE_TRADING=true to enable."
            print(f"[kraken-trade] {msg}")
            self._push.send_update(
                user_id=self._user_id,
                new_trade=msg
            )
            return
        if not self._orders_left():
            print(f"[kraken-trade] Skipped {pair}: Daily order limit reached")
            return
        
        # Check trader_state balance before placing trade
        current_balance = self._get_trader_state_balance()
        trade_amount = self._settings.max_notional_per_order_usd
        
        print(f"[kraken-trade] User {self._user_id}: Balance=${current_balance:.2f}, Trade amount=${trade_amount:.2f}")
        
        if current_balance < trade_amount:
            msg = f"Insufficient balance for trade: ${current_balance:.2f} < ${trade_amount:.2f}"
            print(f"[kraken-trade] {msg}")
            self._push.send_update(
                user_id=self._user_id,
                new_trade=msg
            )
            return
        
        try:
            # Get pair information for precision
            k = self._kraken.api
            asset_pairs = _kraken_public(k, "AssetPairs")
            
            # Find the pair info
            pair_meta = asset_pairs.get(pair)
            if not pair_meta:
                msg = f"Kraken pair {pair} not found"
                print(f"[kraken-trade] {msg}")
                self._push.send_update(
                    user_id=self._user_id,
                    new_trade=msg
                )
                return
            
            # Get current price
            last_price, _ = _kraken_public_ticker(pair)
            if not last_price or last_price <= 0:
                msg = f"Could not get price for {pair}"
                print(f"[kraken-trade] {msg}")
                self._push.send_update(
                    user_id=self._user_id,
                    new_trade=msg
                )
                return
            
            print(f"[kraken-trade] {pair} current price: ${last_price:.2f}")
            
            # Calculate volume to buy with trade_amount USD
            lot_decimals = int(pair_meta.get("lot_decimals", 8))
            volume = _round_down(trade_amount / last_price, lot_decimals)
            
            # Check minimum order size
            order_min = float(pair_meta.get("ordermin", 0))
            if volume < order_min:
                msg = f"Volume {volume} below minimum {order_min} for {pair}"
                print(f"[kraken-trade] {msg}")
                self._push.send_update(
                    user_id=self._user_id,
                    new_trade=msg
                )
                return
            
            print(f"[kraken-trade] Placing order: BUY {volume:.{lot_decimals}f} {pair} (~${trade_amount:.2f})")
            
            # Place market buy order
            order = _kraken_private(
                k,
                "AddOrder",
                {
                    "pair": pair,
                    "type": "buy",
                    "ordertype": "market",
                    "volume": f"{volume:.{lot_decimals}f}",
                },
            )
            
            self._maybe_inc_orders()
            
            # Deduct from trader_state balance
            new_balance = current_balance - trade_amount
            print(f"[kraken-trade] Updating balance: ${current_balance:.2f} -> ${new_balance:.2f}")
            self._update_trader_state_balance(new_balance)
            
            txid = order.get("txid", ["unknown"])[0] if isinstance(order.get("txid"), list) else "unknown"
            msg = f"✅ Placed Kraken BUY {pair} {volume:.{lot_decimals}f} (~${trade_amount:.2f}) txid:{txid} (New balance: ${new_balance:.2f})"
            print(f"[kraken-trade] SUCCESS: {msg}")
            self._push.send_update(
                user_id=self._user_id,
                new_trade=msg,
            )
        except Exception as e:
            msg = f"Kraken order failed ({pair}): {e}"
            print(f"[kraken-trade] ERROR: {msg}")
            self._push.send_update(
                user_id=self._user_id,
                new_trade=msg
            )

    def _alpaca_trade_one_symbol(self, symbol: str) -> None:
        if not self._alpaca:
            return
        if self._settings.trading_mode not in {"paper", "live"}:
            return
        if not self._orders_left():
            return
        
        # Check trader_state balance before placing trade
        current_balance = self._get_trader_state_balance()
        trade_amount = self._settings.max_notional_per_order_usd
        
        if current_balance < trade_amount:
            self._push.send_update(
                user_id=self._user_id,
                new_trade=f"Insufficient balance for trade: ${current_balance:.2f} < ${trade_amount:.2f}"
            )
            return
        
        try:
            req = MarketOrderRequest(
                symbol=symbol,
                notional=trade_amount,
                side=OrderSide.BUY,
                time_in_force=TimeInForce.DAY,
            )
            self._alpaca.submit_order(req)
            self._maybe_inc_orders()
            
            # Deduct from trader_state balance
            new_balance = current_balance - trade_amount
            self._update_trader_state_balance(new_balance)
            
            self._push.send_update(
                user_id=self._user_id,
                new_trade=f"Placed Alpaca BUY {symbol} ${trade_amount:.2f} (New balance: ${new_balance:.2f})",
            )
        except Exception as e:
            self._push.send_update(user_id=self._user_id, new_trade=f"Alpaca order failed ({symbol}): {e}")

    def _kraken_price_change_pct(self, pair: str) -> float | None:
        if not self._kraken:
            return None
        try:
            ticker = self._kraken.get_ticker_information(pair)
            # pykrakenapi returns a dataframe; try to read the close/open-ish from "c" and "o" when present.
            # If format differs, fall back to None and keep running.
            if "c" in ticker.columns and "o" in ticker.columns:
                last = float(ticker["c"].iloc[0][0])
                open_ = float(ticker["o"].iloc[0])
                if open_ == 0:
                    return None
                return (last / open_ - 1.0) * 100.0
            return None
        except Exception as e:
            print(f"[kraken] ticker failed ({pair}): {e}")
            return None

    async def run(self) -> None:
        self._push.send_update(user_id=self._user_id, new_trade="Swarm started")
        while True:
            self._roll_day()

            # Get trader_state balance (deposited funds)
            trader_balance = self._get_trader_state_balance()
            
            # Get Kraken portfolio value
            portfolio_value = self._kraken_get_portfolio_value()

            # Minimal council update using a cheap price-change proxy (no heavy data dependencies).
            pct_change = None
            for pair in self._settings.kraken_pairs:
                pct_change = self._kraken_price_change_pct(pair)
                if pct_change is not None:
                    break
            if pct_change is None:
                pct_change = 0.0

            # Get council vote using OpenAI if enabled, otherwise use deterministic voting
            if self._openai_enabled and self._openai_api_key:
                votes, reasons, approved = _openai_council_vote(
                    pct_change, 
                    self._orders_left(), 
                    self._openai_api_key, 
                    self._openai_model
                )
            else:
                votes, reasons, approved = _council_vote_from_price_change(
                    pct_change, 
                    self._orders_left()
                )
            
            self._push.send_update(
                user_id=self._user_id,
                balance=trader_balance,
                today_pl=0.0,
                portfolio_value=portfolio_value,
                progress_percent=0.0,
                win_rate=0.0,
                council_votes=votes,
                council_reasons=reasons,
            )

            if approved:
                # Place a Kraken order when approved
                for pair in self._settings.kraken_pairs:
                    self._kraken_trade_one_pair(pair)
                    break

            await asyncio.sleep(self._settings.tick_interval_seconds)


class BotManager:
    def __init__(self, *, settings: Settings) -> None:
        self._settings = settings
        self._tasks: dict[str, asyncio.Task[None]] = {}

        self._push: PushUpdateClient | None = None
        self._admin: SupabaseAdmin | None = None

    def configured(self) -> bool:
        return bool(self._settings.supabase_url and self._settings.supabase_push_update_url)

    def start(self) -> None:
        if not self._settings.supabase_url or not self._settings.supabase_push_update_url:
            print("[bot-manager] SUPABASE_URL and SUPABASE_PUSH_UPDATE_URL are required")
            return

        self._push = PushUpdateClient(
            self._settings.supabase_push_update_url,
            self._settings.supabase_webhook_secret,
        )

        if self._settings.supabase_service_role_key:
            self._admin = SupabaseAdmin(self._settings.supabase_url, self._settings.supabase_service_role_key)
        else:
            print("[bot-manager] SUPABASE_SERVICE_ROLE_KEY not set; cannot auto-start bots from swarm_active")

    def active_user_ids(self) -> list[str]:
        return sorted(self._tasks.keys())

    def _ensure_user_started(self, user_id: str) -> None:
        if user_id in self._tasks:
            return
        assert self._push is not None

        alpaca: TradingClient | None = None
        kraken: KrakenAPI | None = None

        # Prefer per-user keys stored in Supabase (phone-only setup).
        keys = self._admin.get_user_exchange_keys(user_id) if self._admin else None
        if keys:
            alpaca_key = keys.get("alpaca_api_key")
            alpaca_secret = keys.get("alpaca_secret")
            alpaca_paper = bool(keys.get("alpaca_paper", True))
            if alpaca_key and alpaca_secret:
                alpaca = TradingClient(str(alpaca_key), str(alpaca_secret), paper=alpaca_paper)

            kraken_key = keys.get("kraken_key")
            kraken_secret = keys.get("kraken_secret")
            if kraken_key and kraken_secret:
                k = krakenex.API(key=str(kraken_key), secret=str(kraken_secret))
                kraken = KrakenAPI(k)

        # Fallback: env / local SQLite
        if alpaca is None:
            alpaca_key, alpaca_secret = _get_alpaca_creds()
            if alpaca_key and alpaca_secret:
                alpaca = TradingClient(alpaca_key, alpaca_secret, paper=self._settings.alpaca_paper)
        if kraken is None:
            kraken_key, kraken_secret = _get_kraken_creds()
            if kraken_key and kraken_secret:
                k = krakenex.API(key=kraken_key, secret=kraken_secret)
                kraken = KrakenAPI(k)

        # Get OpenAI credentials from Supabase or fallback
        openai_api_key: str | None = None
        openai_model: str = "gpt-4o-mini"
        openai_enabled: bool = False
        
        if keys:
            openai_api_key = keys.get("openai_api_key")
            openai_model = keys.get("openai_model") or "gpt-4o-mini"
            openai_enabled = bool(keys.get("openai_enabled", False))
        
        # Fallback to env / local SQLite
        if not openai_api_key:
            openai_api_key, openai_model = _get_openai_creds()

        bot = UserBot(
            user_id=user_id, 
            push=self._push, 
            alpaca=alpaca, 
            kraken=kraken, 
            settings=self._settings,
            openai_api_key=openai_api_key,
            openai_model=openai_model,
            openai_enabled=openai_enabled,
        )
        self._tasks[user_id] = asyncio.create_task(bot.run())

    def _ensure_user_stopped(self, user_id: str) -> None:
        task = self._tasks.pop(user_id, None)
        if task:
            task.cancel()

    async def poll_forever(self) -> None:
        while True:
            if not self._admin:
                await asyncio.sleep(self._settings.poll_interval_seconds)
                continue
            try:
                target = self._admin.list_active_swarm_user_ids()
                current = set(self._tasks.keys())

                for user_id in target - current:
                    self._ensure_user_started(user_id)
                for user_id in current - target:
                    self._ensure_user_stopped(user_id)
            except Exception as e:
                print(f"[bot-manager] poll failed: {e}")
            await asyncio.sleep(self._settings.poll_interval_seconds)


BOT_MANAGER = BotManager(settings=SETTINGS)


# Use lifespan context manager for startup/shutdown
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app_instance: FastAPI):
    """Application lifespan: startup and shutdown events."""
    # Startup
    logger.info("Starting AI Trader application")
    BOT_MANAGER.start()
    bot_task = asyncio.create_task(BOT_MANAGER.poll_forever())
    
    yield
    
    # Shutdown
    logger.info("Shutting down AI Trader application")
    bot_task.cancel()
    try:
        await bot_task
    except asyncio.CancelledError:
        logger.info("Bot manager task cancelled successfully")


# Now create the app with lifespan
app = FastAPI(
    title="AI Trader API",
    description="Production-ready AI trading bot with ensemble learning",
    version="1.3.0",
    lifespan=lifespan
)

# Add gzip compression for responses
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Configure CORS
if SETTINGS.cors_origins == ["*"]:
    logger.warning("CORS configured to allow ALL origins - not recommended for production!")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    logger.info("CORS configured with specific origins: %s", SETTINGS.cors_origins)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=SETTINGS.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Request ID middleware for tracing
@app.middleware("http")
async def add_request_id(request: Request, call_next):
    """Add request ID for tracing."""
    request_id = request.headers.get("X-Request-ID", str(time.time()))
    logger.info(f"Request: {request.method} {request.url.path} [ID: {request_id}]")
    
    try:
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response
    except Exception as e:
        logger.error(f"Request failed [ID: {request_id}]: {e}")
        raise


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle uncaught exceptions globally."""
    logger.error(f"Unhandled exception for {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "message": str(exc) if os.getenv("DEBUG") == "true" else "An unexpected error occurred",
            "path": str(request.url.path)
        }
    )


# Initialize AI modules as singletons
ensemble_ai_instance = EnsembleAI()
news_sentiment_instance = NewsSentiment()
hft_instance = HighFrequencyTrader()
arbitrage_instance = ArbitrageEngine()
profit_maximizer_instance = ProfitMaximizer()

logger.info("AI modules initialized successfully")


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "configured": BOT_MANAGER.configured(),
        "trading_mode": SETTINGS.trading_mode,
        "alpaca_paper": SETTINGS.alpaca_paper,
        "active_users": BOT_MANAGER.active_user_ids(),
    }


@app.get("/config/status")
async def config_status() -> JSONResponse:
    missing: list[str] = []
    if not (SETTINGS.supabase_url and SETTINGS.supabase_service_role_key):
        missing.append("SUPABASE_URL (or VITE_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY")

    alpaca_key = SETTINGS.alpaca_api_key or _db_get_secret("ALPACA_API_KEY")
    alpaca_secret = SETTINGS.alpaca_secret or _db_get_secret("ALPACA_SECRET")
    kraken_key = SETTINGS.kraken_key or _db_get_secret("KRAKEN_KEY")
    kraken_secret = SETTINGS.kraken_secret or _db_get_secret("KRAKEN_SECRET")

    if not (alpaca_key and alpaca_secret):
        missing.append("ALPACA_API_KEY + ALPACA_SECRET")
    if not (kraken_key and kraken_secret):
        missing.append("KRAKEN_KEY + KRAKEN_SECRET")

    plaid_client_id, plaid_secret, _ = _get_plaid_creds()
    plaid_ok = bool(plaid_client_id and plaid_secret)
    return JSONResponse(
        {
            "supabase_configured": bool(SETTINGS.supabase_url and SETTINGS.supabase_service_role_key),
            "alpaca_configured": bool(alpaca_key and alpaca_secret),
            "kraken_configured": bool(kraken_key and kraken_secret),
            "plaid_configured": plaid_ok,
            "missing": missing,
            "note": "Secrets are never returned. If you set keys via /config/set_keys, restart the backend to apply them everywhere.",
        }
    )


@app.post("/config/set_keys")
async def config_set_keys(
    body: dict[str, Any],
    authorization: str | None = Header(default=None),
) -> JSONResponse:
    """
    Convenience endpoint for personal use: stores API keys on the backend (SQLite).
    The frontend can call this so you don't need to SSH/edit env vars.

    IMPORTANT: This is still sensitive. Only expose your backend over a trusted network + HTTPS.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        return JSONResponse({"error": "Missing Authorization Bearer token"}, status_code=401)
    user_id = _supabase_user_id_from_jwt(authorization.split(" ", 1)[1])
    if not user_id:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    # Only allow users with Supabase user_roles.admin (optional) OR any authenticated user if ADMIN not configured.
    # For simplicity, allow any authenticated user in this personal build.

    def _get_str(name: str) -> str:
        v = body.get(name)
        return str(v).strip() if v is not None else ""

    alpaca_api_key = _get_str("alpaca_api_key")
    alpaca_secret = _get_str("alpaca_secret")
    kraken_key = _get_str("kraken_key")
    kraken_secret = _get_str("kraken_secret")
    plaid_client_id = _get_str("plaid_client_id")
    plaid_secret = _get_str("plaid_secret")
    plaid_env = _get_str("plaid_env")

    wrote = []
    if alpaca_api_key:
        _db_set_secret("ALPACA_API_KEY", alpaca_api_key)
        wrote.append("ALPACA_API_KEY")
    if alpaca_secret:
        _db_set_secret("ALPACA_SECRET", alpaca_secret)
        wrote.append("ALPACA_SECRET")
    if kraken_key:
        _db_set_secret("KRAKEN_KEY", kraken_key)
        wrote.append("KRAKEN_KEY")
    if kraken_secret:
        _db_set_secret("KRAKEN_SECRET", kraken_secret)
        wrote.append("KRAKEN_SECRET")
    if plaid_client_id:
        _db_set_secret("PLAID_CLIENT_ID", plaid_client_id)
        wrote.append("PLAID_CLIENT_ID")
    if plaid_secret:
        _db_set_secret("PLAID_SECRET", plaid_secret)
        wrote.append("PLAID_SECRET")
    if plaid_env:
        _db_set_secret("PLAID_ENV", plaid_env)
        wrote.append("PLAID_ENV")

    return JSONResponse(
        {
            "success": True,
            "stored": wrote,
            "note": "Keys stored on backend. Restart backend to ensure bots pick them up.",
        }
    )


@app.get("/me/status")
async def me_status(authorization: str | None = Header(default=None)) -> JSONResponse:
    if not authorization or not authorization.lower().startswith("bearer "):
        return JSONResponse({"error": "Missing Authorization Bearer token"}, status_code=401)
    user_id = _supabase_user_id_from_jwt(authorization.split(" ", 1)[1])
    if not user_id:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    return JSONResponse(
        {
            "user_id": user_id,
            "bot_active": user_id in set(BOT_MANAGER.active_user_ids()),
            "trading_mode": SETTINGS.trading_mode,
            "alpaca_paper": SETTINGS.alpaca_paper,
            "kraken_trading_enabled": _kraken_trading_enabled(),
            "kraken_withdrawals_enabled": _kraken_withdrawals_enabled(),
        }
    )


@app.get("/me/config")
async def me_config(authorization: str | None = Header(default=None)) -> JSONResponse:
    if not authorization or not authorization.lower().startswith("bearer "):
        return JSONResponse({"error": "Missing Authorization Bearer token"}, status_code=401)
    user_id = _supabase_user_id_from_jwt(authorization.split(" ", 1)[1])
    if not user_id:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    alpaca_key, alpaca_secret = _get_alpaca_creds()
    kraken_key, kraken_secret = _get_kraken_creds()
    plaid_client_id, plaid_secret, _ = _get_plaid_creds()
    return JSONResponse(
        {
            "supabase_configured": bool(SETTINGS.supabase_url and SETTINGS.supabase_service_role_key),
            "plaid_configured": bool(plaid_client_id and plaid_secret),
            "plaid_linked": bool(_db_get_plaid_access_token(user_id)),
            "alpaca_configured": bool(alpaca_key and alpaca_secret),
            "kraken_configured": bool(kraken_key and kraken_secret),
        }
    )


def _alpaca_close_all_positions(alpaca: TradingClient) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    positions = alpaca.get_all_positions()
    for p in positions:
        symbol = getattr(p, "symbol", None)
        qty_raw = getattr(p, "qty", None)
        try:
            qty = float(qty_raw)
        except Exception:
            qty = 0.0
        if not symbol or qty <= 0:
            continue
        try:
            req = MarketOrderRequest(
                symbol=str(symbol),
                qty=qty,
                side=OrderSide.SELL,
                time_in_force=TimeInForce.DAY,
            )
            alpaca.submit_order(req)
            results.append({"symbol": str(symbol), "qty": qty, "status": "submitted"})
        except Exception as e:
            results.append({"symbol": str(symbol), "qty": qty, "status": "error", "error": str(e)})
    return results


def _kraken_close_positions_to_cash(kraken_api: KrakenAPI) -> list[dict[str, Any]]:
    # This is a "best effort" implementation using Kraken's official API.
    # It is guarded behind KRAKEN_ENABLE_TRADING=true to avoid accidental live orders.
    results: list[dict[str, Any]] = []
    if not _kraken_trading_enabled():
        try:
            bal = kraken_api.get_account_balance()
            for asset, row in bal.iterrows():
                try:
                    amount = float(row.iloc[0])
                except Exception:
                    continue
                if amount <= 0:
                    continue
                results.append({"asset": str(asset), "balance": amount, "status": "reported"})
        except Exception as e:
            results.append({"status": "error", "error": str(e)})
        results.append(
            {
                "status": "note",
                "message": "Set KRAKEN_ENABLE_TRADING=true to allow market sells (live).",
            }
        )
        return results

    try:
        # Pull balances and asset pairs from Kraken directly for precision metadata.
        k = kraken_api.api  # underlying krakenex.API instance
        balances = _kraken_private(k, "Balance")
        asset_pairs = _kraken_public(k, "AssetPairs")

        for asset, amount_str in balances.items():
            try:
                amount = float(amount_str)
            except Exception:
                continue
            if amount <= 0:
                continue
            # Skip USD-like balances
            if asset in {"ZUSD", "USD", "USDT", "USDC"}:
                continue

            pair_info = _kraken_find_usd_pair(asset, asset_pairs)
            if not pair_info:
                results.append({"asset": asset, "balance": amount, "status": "skipped", "reason": "no USD quote pair found"})
                continue

            pair_name, meta = pair_info
            lot_decimals = int(meta.get("lot_decimals") or 0)
            order_min = float(meta.get("ordermin") or 0)
            volume = _round_down(amount, lot_decimals)
            if volume <= 0 or (order_min and volume < order_min):
                results.append(
                    {"asset": asset, "pair": pair_name, "balance": amount, "volume": volume, "status": "skipped", "reason": "below minimum order size"}
                )
                continue

            order = _kraken_private(
                k,
                "AddOrder",
                {
                    "pair": pair_name,
                    "type": "sell",
                    "ordertype": "market",
                    "volume": f"{volume:.{lot_decimals}f}",
                },
            )
            results.append({"asset": asset, "pair": pair_name, "volume": volume, "status": "submitted", "txid": order.get("txid")})
    except Exception as e:
        results.append({"status": "error", "error": str(e)})
    return results


@app.post("/actions/sell_to_cash")
async def sell_to_cash(authorization: str | None = Header(default=None)) -> JSONResponse:
    if not authorization or not authorization.lower().startswith("bearer "):
        return JSONResponse({"error": "Missing Authorization Bearer token"}, status_code=401)
    user_id = _supabase_user_id_from_jwt(authorization.split(" ", 1)[1])
    if not user_id:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    if SETTINGS.trading_mode == "dry_run":
        return JSONResponse(
            {
                "success": True,
                "mode": SETTINGS.trading_mode,
                "alpaca": {"status": "skipped (dry_run)"},
                "kraken": {"status": "skipped (dry_run)"},
            }
        )

    # Alpaca (stocks)
    alpaca_results: Any = {"status": "not_configured"}
    alpaca_key: str | None = None
    alpaca_secret: str | None = None
    alpaca_paper = SETTINGS.alpaca_paper
    if SETTINGS.supabase_url and SETTINGS.supabase_service_role_key:
        admin = SupabaseAdmin(SETTINGS.supabase_url, SETTINGS.supabase_service_role_key)
        keys = admin.get_user_exchange_keys(user_id)
        if keys:
            alpaca_key = keys.get("alpaca_api_key")
            alpaca_secret = keys.get("alpaca_secret")
            alpaca_paper = bool(keys.get("alpaca_paper", alpaca_paper))
    if not alpaca_key or not alpaca_secret:
        alpaca_key, alpaca_secret = _get_alpaca_creds()
    if alpaca_key and alpaca_secret:
        alpaca = TradingClient(
            str(alpaca_key), str(alpaca_secret), paper=alpaca_paper
        )
        alpaca_results = _alpaca_close_all_positions(alpaca)

    # Kraken (crypto) - safe reporting only in this build
    kraken_results: Any = {"status": "not_configured"}
    kraken_key: str | None = None
    kraken_secret: str | None = None
    if SETTINGS.supabase_url and SETTINGS.supabase_service_role_key:
        admin = SupabaseAdmin(SETTINGS.supabase_url, SETTINGS.supabase_service_role_key)
        keys = admin.get_user_exchange_keys(user_id)
        if keys:
            kraken_key = keys.get("kraken_key")
            kraken_secret = keys.get("kraken_secret")
    if not kraken_key or not kraken_secret:
        kraken_key, kraken_secret = _get_kraken_creds()
    if kraken_key and kraken_secret:
        k = krakenex.API(key=str(kraken_key), secret=str(kraken_secret))
        kraken_api = KrakenAPI(k)
        kraken_results = _kraken_close_positions_to_cash(kraken_api)

    return JSONResponse(
        {
            "success": True,
            "mode": SETTINGS.trading_mode,
            "alpaca": alpaca_results,
            "kraken": kraken_results,
            "note": "Kraken sells are guarded by KRAKEN_ENABLE_TRADING=true.",
        }
    )


@app.post("/simulate/run")
async def simulate_run(
    body: dict[str, Any],
    authorization: str | None = Header(default=None),
) -> JSONResponse:
    """
    Short, bounded simulation (NO orders) using real market data when available:
    - Kraken public ticker for price change
    - Alpaca latest quote/bar snapshot (if keys available)
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        return JSONResponse({"error": "Missing Authorization Bearer token"}, status_code=401)
    user_id = _supabase_user_id_from_jwt(authorization.split(" ", 1)[1])
    if not user_id:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    seconds = int(body.get("seconds") or 20)
    seconds = max(5, min(seconds, 60))
    tick_seconds = float(body.get("tick_seconds") or 5)
    tick_seconds = max(2.0, min(tick_seconds, 10.0))

    pairs_in = body.get("pairs")
    if isinstance(pairs_in, list) and all(isinstance(p, str) for p in pairs_in):
        pairs = [p.strip().upper() for p in pairs_in if p.strip()][:10]
    else:
        pairs = SETTINGS.kraken_pairs[:10]

    symbols_in = body.get("symbols")
    if isinstance(symbols_in, list) and all(isinstance(s, str) for s in symbols_in):
        symbols = [s.strip().upper() for s in symbols_in if s.strip()][:10]
    else:
        symbols = SETTINGS.alpaca_symbols[:10]

    started = time.time()
    events: list[dict[str, Any]] = []

    while time.time() - started < seconds:
        pct_change = 0.0
        last_price: float | None = None
        open_price: float | None = None

        for pair in pairs:
            last, open_ = _kraken_public_ticker(pair)
            if last is not None and open_ not in (None, 0.0):
                last_price = last
                open_price = open_
                pct_change = (last / open_ - 1.0) * 100.0
                break

        votes, reasons, approved = _council_vote_from_price_change(pct_change, orders_left=True)
        alpaca_snapshot = _alpaca_latest_snapshot(symbols)

        events.append(
            {
                "ts": datetime.now(tz=UTC).isoformat(),
                "kraken": {
                    "pairs": pairs,
                    "last": last_price,
                    "open": open_price,
                    "pct_change": pct_change,
                },
                "council_votes": votes,
                "council_reasons": reasons,
                "would_trade": bool(approved),
                "alpaca_latest": alpaca_snapshot,
                "note": "Simulation only. No orders submitted.",
            }
        )

        await asyncio.sleep(tick_seconds)

    return JSONResponse(
        {
            "success": True,
            "user_id": user_id,
            "seconds": seconds,
            "tick_seconds": tick_seconds,
            "events": events,
        }
    )


@app.post("/kraken/withdraw_fiat")
async def kraken_withdraw_fiat(
    body: dict[str, Any],
    authorization: str | None = Header(default=None),
) -> JSONResponse:
    """
    Initiates a Kraken fiat withdrawal using a pre-configured Kraken withdrawal key.
    You MUST create a withdrawal key in Kraken and set it in the request (or env).
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        return JSONResponse({"error": "Missing Authorization Bearer token"}, status_code=401)
    user_id = _supabase_user_id_from_jwt(authorization.split(" ", 1)[1])
    if not user_id:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    if SETTINGS.trading_mode == "dry_run":
        return JSONResponse({"success": True, "mode": SETTINGS.trading_mode, "status": "skipped (dry_run)"})

    if not _kraken_withdrawals_enabled():
        return JSONResponse(
            {
                "error": "Kraken withdrawals are disabled in this backend.",
                "how_to_fix": [
                    "Set KRAKEN_ENABLE_WITHDRAWALS=true on the backend.",
                    "Create a Kraken withdrawal key (to your bank/Chime) in Kraken.",
                    "Call this endpoint with that key and amount.",
                ],
            },
            status_code=501,
        )

    kraken_key: str | None = None
    kraken_secret: str | None = None
    if SETTINGS.supabase_url and SETTINGS.supabase_service_role_key:
        admin = SupabaseAdmin(SETTINGS.supabase_url, SETTINGS.supabase_service_role_key)
        keys = admin.get_user_exchange_keys(user_id)
        if keys:
            kraken_key = keys.get("kraken_key")
            kraken_secret = keys.get("kraken_secret")
    if not kraken_key or not kraken_secret:
        kraken_key, kraken_secret = _get_kraken_creds()
    if not (kraken_key and kraken_secret):
        return JSONResponse({"error": "Kraken API keys not configured"}, status_code=400)

    asset = str(body.get("asset") or os.getenv("KRAKEN_WITHDRAW_ASSET", "ZUSD")).strip()
    key = str(body.get("key") or os.getenv("KRAKEN_WITHDRAW_KEY_USD", "")).strip()
    amount = body.get("amount")
    try:
        amount_num = float(amount)
    except Exception:
        amount_num = 0.0
    if amount_num <= 0:
        return JSONResponse({"error": "amount must be a positive number"}, status_code=400)
    if not key:
        return JSONResponse({"error": "withdrawal key is required (body.key or env KRAKEN_WITHDRAW_KEY_USD)"}, status_code=400)

    try:
        k = krakenex.API(key=str(kraken_key), secret=str(kraken_secret))
        res = _kraken_private(
            k,
            "Withdraw",
            {"asset": asset, "key": key, "amount": f"{amount_num:.2f}"},
        )
        return JSONResponse({"success": True, "result": res})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/plaid/create_link_token")
async def plaid_create_link_token(authorization: str | None = Header(default=None)) -> JSONResponse:
    if not authorization or not authorization.lower().startswith("bearer "):
        return JSONResponse({"error": "Missing Authorization Bearer token"}, status_code=401)
    user_id = _supabase_user_id_from_jwt(authorization.split(" ", 1)[1])
    if not user_id:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    try:
        payload: dict[str, Any] = {
            "user": {"client_user_id": user_id},
            "client_name": "AI Trader",
            "products": SETTINGS.plaid_products,
            "country_codes": ["US"],
            "language": "en",
        }
        if SETTINGS.plaid_redirect_uri:
            payload["redirect_uri"] = SETTINGS.plaid_redirect_uri
        data = _plaid_post("/link/token/create", payload)
        return JSONResponse({"link_token": data["link_token"]})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/plaid/exchange_public_token")
async def plaid_exchange_public_token(
    body: dict[str, Any],
    authorization: str | None = Header(default=None),
) -> JSONResponse:
    if not authorization or not authorization.lower().startswith("bearer "):
        return JSONResponse({"error": "Missing Authorization Bearer token"}, status_code=401)
    user_id = _supabase_user_id_from_jwt(authorization.split(" ", 1)[1])
    if not user_id:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    public_token = str(body.get("public_token") or "")
    institution_name = str(body.get("institution_name") or "")
    accounts = body.get("accounts") or []
    if not public_token:
        return JSONResponse({"error": "public_token is required"}, status_code=400)

    try:
        exchanged = _plaid_post("/item/public_token/exchange", {"public_token": public_token})
        access_token = exchanged["access_token"]
        item_id = exchanged["item_id"]

        conn = _db()
        with conn:
            conn.execute(
                "INSERT INTO plaid_item(user_id,item_id,access_token,institution_name) VALUES(?,?,?,?) "
                "ON CONFLICT(user_id) DO UPDATE SET item_id=excluded.item_id, access_token=excluded.access_token, institution_name=excluded.institution_name",
                (user_id, item_id, access_token, institution_name),
            )

            # update accounts (optional)
            if isinstance(accounts, list) and accounts:
                conn.execute("UPDATE plaid_account SET is_primary=0 WHERE user_id=?", (user_id,))
                for idx, a in enumerate(accounts):
                    account_id = str(a.get("id") or a.get("account_id") or "")
                    if not account_id:
                        continue
                    conn.execute(
                        "INSERT INTO plaid_account(user_id,account_id,name,mask,type,subtype,is_primary) VALUES(?,?,?,?,?,?,?) "
                        "ON CONFLICT(user_id,account_id) DO UPDATE SET name=excluded.name, mask=excluded.mask, type=excluded.type, subtype=excluded.subtype, is_primary=excluded.is_primary",
                        (
                            user_id,
                            account_id,
                            str(a.get("name") or ""),
                            str(a.get("mask") or ""),
                            str(a.get("type") or ""),
                            str(a.get("subtype") or ""),
                            1 if idx == 0 else 0,
                        ),
                    )
        return JSONResponse({"success": True})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/plaid/import_from_supabase")
async def plaid_import_from_supabase(authorization: str | None = Header(default=None)) -> JSONResponse:
    """
    One-time helper: if you previously connected Plaid through the Supabase edge function,
    this imports plaid_items/plaid_accounts into the backend SQLite store.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        return JSONResponse({"error": "Missing Authorization Bearer token"}, status_code=401)
    user_id = _supabase_user_id_from_jwt(authorization.split(" ", 1)[1])
    if not user_id:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    if not (SETTINGS.supabase_url and SETTINGS.supabase_service_role_key):
        return JSONResponse({"error": "Supabase service role not configured on backend"}, status_code=400)

    item = _supabase_get_row(
        "plaid_items",
        "user_id,item_id,access_token,institution_name",
        {"user_id": f"eq.{user_id}"},
    )
    if not item or not item.get("access_token") or not item.get("item_id"):
        return JSONResponse({"error": "No plaid_items row found in Supabase for this user"}, status_code=404)

    accounts = _supabase_get_rows(
        "plaid_accounts",
        "account_id,name,mask,type,subtype,is_primary,item_id",
        {"user_id": f"eq.{user_id}"},
    )

    conn = _db()
    with conn:
        conn.execute(
            "INSERT INTO plaid_item(user_id,item_id,access_token,institution_name) VALUES(?,?,?,?) "
            "ON CONFLICT(user_id) DO UPDATE SET item_id=excluded.item_id, access_token=excluded.access_token, institution_name=excluded.institution_name",
            (
                user_id,
                str(item["item_id"]),
                str(item["access_token"]),
                str(item.get("institution_name") or ""),
            ),
        )
        if accounts:
            conn.execute("DELETE FROM plaid_account WHERE user_id=?", (user_id,))
            for a in accounts:
                conn.execute(
                    "INSERT INTO plaid_account(user_id,account_id,name,mask,type,subtype,is_primary) VALUES(?,?,?,?,?,?,?)",
                    (
                        user_id,
                        str(a.get("account_id") or ""),
                        str(a.get("name") or ""),
                        str(a.get("mask") or ""),
                        str(a.get("type") or ""),
                        str(a.get("subtype") or ""),
                        1 if a.get("is_primary") else 0,
                    ),
                )

    return JSONResponse({"success": True, "imported_accounts": len(accounts)})


@app.get("/plaid/accounts")
async def plaid_get_accounts(authorization: str | None = Header(default=None)) -> JSONResponse:
    if not authorization or not authorization.lower().startswith("bearer "):
        return JSONResponse({"error": "Missing Authorization Bearer token"}, status_code=401)
    user_id = _supabase_user_id_from_jwt(authorization.split(" ", 1)[1])
    if not user_id:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    try:
        conn = _db()
        row = conn.execute(
            "SELECT access_token, institution_name FROM plaid_item WHERE user_id=?",
            (user_id,),
        ).fetchone()
        if not row:
            return JSONResponse({"connected": False, "accounts": []})
        access_token, institution_name = row[0], row[1]

        data = _plaid_post("/accounts/balance/get", {"access_token": access_token})
        accounts_out = []
        for a in data.get("accounts", []) or []:
            accounts_out.append(
                {
                    "account_id": a.get("account_id"),
                    "name": a.get("name"),
                    "mask": a.get("mask"),
                    "type": a.get("type"),
                    "subtype": a.get("subtype"),
                    "balances": a.get("balances"),
                }
            )
        return JSONResponse(
            {"connected": True, "institution_name": institution_name, "accounts": accounts_out}
        )
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/plaid/processor_token_create")
async def plaid_processor_token_create(
    body: dict[str, Any],
    authorization: str | None = Header(default=None),
) -> JSONResponse:
    """
    Creates a Plaid processor token (used to hand off bank auth to a processor partner).
    This does NOT transfer money; it's only for supported processors (e.g., Stripe, Dwolla, etc.).
    """
    if not _plaid_processor_enabled():
        return JSONResponse({"error": "Processor endpoints disabled"}, status_code=403)
    if not authorization or not authorization.lower().startswith("bearer "):
        return JSONResponse({"error": "Missing Authorization Bearer token"}, status_code=401)
    user_id = _supabase_user_id_from_jwt(authorization.split(" ", 1)[1])
    if not user_id:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    processor = str(body.get("processor") or "").strip()
    account_id = str(body.get("account_id") or "").strip()
    if not processor:
        return JSONResponse({"error": "processor is required"}, status_code=400)
    if not account_id:
        account_id = _db_get_primary_plaid_account_id(user_id) or ""
    if not account_id:
        return JSONResponse(
            {"error": "No account_id provided and no primary Plaid account stored."},
            status_code=400,
        )

    access_token = _db_get_plaid_access_token(user_id)
    if not access_token:
        return JSONResponse(
            {"error": "No Plaid bank connected. Go to Banking (Plaid) and connect first."},
            status_code=400,
        )

    try:
        data = _plaid_post(
            "/processor/token/create",
            {
                "access_token": access_token,
                "account_id": account_id,
                "processor": processor,
            },
        )
        return JSONResponse({"processor_token": data.get("processor_token")})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/plaid/processor_token_permissions_set")
async def plaid_processor_token_permissions_set(
    body: dict[str, Any],
    authorization: str | None = Header(default=None),
) -> JSONResponse:
    """
    Sets which products a processor_token can access.
    Example products: ["auth","balance","identity"] (must be enabled on your Plaid account).
    """
    if not _plaid_processor_enabled():
        return JSONResponse({"error": "Processor endpoints disabled"}, status_code=403)
    if not authorization or not authorization.lower().startswith("bearer "):
        return JSONResponse({"error": "Missing Authorization Bearer token"}, status_code=401)
    user_id = _supabase_user_id_from_jwt(authorization.split(" ", 1)[1])
    if not user_id:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    processor_token = str(body.get("processor_token") or "").strip()
    products = body.get("products")
    if not processor_token:
        return JSONResponse({"error": "processor_token is required"}, status_code=400)
    if not isinstance(products, list) or not all(isinstance(p, str) for p in products):
        return JSONResponse({"error": "products must be a string[]"}, status_code=400)

    try:
        data = _plaid_post(
            "/processor/token/permissions/set",
            {
                "processor_token": processor_token,
                "products": products,
            },
        )
        return JSONResponse({"success": True, "result": data})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/plaid/withdraw")
async def plaid_withdraw(
    body: dict[str, Any],
    authorization: str | None = Header(default=None),
) -> JSONResponse:
    """
    Attempts to create an ACH payout using Plaid Transfer (if enabled on your Plaid account).
    This is guarded because Plaid Transfer requires approvals + a funding account.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        return JSONResponse({"error": "Missing Authorization Bearer token"}, status_code=401)
    user_id = _supabase_user_id_from_jwt(authorization.split(" ", 1)[1])
    if not user_id:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    amount = body.get("amount")
    try:
        amount_num = float(amount)
    except Exception:
        amount_num = 0.0
    if amount_num <= 0:
        return JSONResponse({"error": "amount must be a positive number"}, status_code=400)

    if SETTINGS.trading_mode == "dry_run":
        return JSONResponse({"success": True, "mode": SETTINGS.trading_mode, "status": "skipped (dry_run)"})

    if not _plaid_transfer_enabled():
        return JSONResponse(
            {
                "error": "Plaid Transfer is not enabled in this backend.",
                "how_to_fix": [
                    "Enable Plaid Transfer for your Plaid account (requires approval).",
                    "Set PLAID_ENABLE_TRANSFERS=true on the backend.",
                    "Configure and provide: PLAID_TRANSFER_AUTHORIZATION_ACCOUNT_ID, PLAID_TRANSFER_FUNDING_ACCOUNT_ID (Plaid-side).",
                ],
            },
            status_code=501,
        )

    # Minimal guarded implementation skeleton (requires your Plaid Transfer configuration).
    # We intentionally fail with a clear message until the required account IDs are provided.
    auth_account_id = os.getenv("PLAID_TRANSFER_AUTHORIZATION_ACCOUNT_ID")
    funding_account_id = os.getenv("PLAID_TRANSFER_FUNDING_ACCOUNT_ID")
    if not auth_account_id or not funding_account_id:
        return JSONResponse(
            {
                "error": "Missing Plaid Transfer configuration.",
                "required_env": [
                    "PLAID_TRANSFER_AUTHORIZATION_ACCOUNT_ID",
                    "PLAID_TRANSFER_FUNDING_ACCOUNT_ID",
                ],
            },
            status_code=501,
        )

    try:
        # 1) authorization create
        access_token = _db_get_plaid_access_token(user_id)
        if not access_token:
            return JSONResponse(
                {"error": "No Plaid bank connected. Go to Banking (Plaid) and connect first."},
                status_code=400,
            )
        authz = _plaid_post(
            "/transfer/authorization/create",
            {
                "access_token": access_token,
                "account_id": auth_account_id,
                "type": "credit",
                "network": "ach",
                "amount": f"{amount_num:.2f}",
                "ach_class": "ppd",
                "user": {
                    "legal_name": "User",
                },
            },
        )
        authorization_id = authz.get("authorization", {}).get("id")
        if not authorization_id:
            raise RuntimeError("Plaid Transfer authorization failed")

        # 2) transfer create
        transfer = _plaid_post(
            "/transfer/create",
            {
                "access_token": access_token,
                "account_id": auth_account_id,
                "authorization_id": authorization_id,
                "type": "credit",
                "network": "ach",
                "amount": f"{amount_num:.2f}",
                "ach_class": "ppd",
                "description": "AI Trader withdrawal",
                "user": {
                    "legal_name": "User",
                },
            },
        )
        return JSONResponse({"success": True, "transfer": transfer})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/deposit/from_chime")
async def deposit_from_chime(
    body: dict[str, Any],
    authorization: str | None = Header(default=None),
) -> JSONResponse:
    """
    Deposit money from Chime account to trading account.
    This updates the trader_state balance and creates a deposit record.
    Note: This is a virtual deposit for MVP - actual ACH transfers would require Plaid Transfer API.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        return JSONResponse({"error": "Missing Authorization Bearer token"}, status_code=401)
    user_id = _supabase_user_id_from_jwt(authorization.split(" ", 1)[1])
    if not user_id:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    amount = body.get("amount")
    try:
        amount_num = float(amount)
    except Exception:
        amount_num = 0.0
    if amount_num <= 0:
        return JSONResponse({"error": "amount must be a positive number"}, status_code=400)

    print(f"[deposit] User {user_id}: Depositing ${amount_num:.2f}")

    if not SETTINGS.supabase_url or not SETTINGS.supabase_service_role_key:
        return JSONResponse({"error": "Supabase not configured"}, status_code=500)

    try:
        # Get current trader state
        endpoint = f"{SETTINGS.supabase_url.rstrip('/')}/rest/v1/trader_state"
        headers = {
            "apikey": SETTINGS.supabase_service_role_key,
            "Authorization": f"Bearer {SETTINGS.supabase_service_role_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        
        # Fetch current balance
        params = {"select": "balance", "user_id": f"eq.{user_id}"}
        r = requests.get(endpoint, headers=headers, params=params, timeout=10)
        r.raise_for_status()
        rows = r.json() or []
        current_balance = float(rows[0]["balance"]) if rows else 0.0
        
        print(f"[deposit] Current balance: ${current_balance:.2f}")
        
        # Update balance by adding deposit amount
        new_balance = current_balance + amount_num
        
        print(f"[deposit] New balance: ${new_balance:.2f}")
        
        # Upsert trader_state with new balance
        upsert_data = {
            "user_id": user_id,
            "balance": new_balance,
            "updated_at": datetime.now(tz=UTC).isoformat(),
        }
        r = requests.post(
            endpoint,
            headers={**headers, "Prefer": "resolution=merge-duplicates"},
            json=upsert_data,
            timeout=10,
        )
        r.raise_for_status()
        
        print(f"[deposit] Updated trader_state balance in database")
        
        # Create deposit record in withdrawal_requests table
        withdrawal_endpoint = f"{SETTINGS.supabase_url.rstrip('/')}/rest/v1/withdrawal_requests"
        deposit_record = {
            "user_id": user_id,
            "amount": amount_num,
            "status": "completed",
            "withdraw_type": "deposit",
            "bank_name": "Chime",
        }
        r = requests.post(withdrawal_endpoint, headers=headers, json=deposit_record, timeout=10)
        r.raise_for_status()
        
        print(f"[deposit] Created deposit record in withdrawal_requests")
        print(f"[deposit] ✅ SUCCESS: Deposited ${amount_num:.2f}, new balance ${new_balance:.2f}")
        
        return JSONResponse({
            "success": True,
            "amount": amount_num,
            "new_balance": new_balance,
            "message": f"Successfully deposited ${amount_num:.2f} from Chime to trading account",
        })
    except Exception as e:
        print(f"[deposit] ❌ ERROR: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/ai/decision")
async def ai_decision(symbol: str = "AAPL"):
    """
    Get AI trading decision for a symbol.
    
    Args:
        symbol: Stock/crypto symbol (e.g., "AAPL", "BTC")
        
    Returns:
        AI decision with confidence score
    """
    try:
        logger.info(f"AI decision requested for symbol: {symbol}")
        
        # Fetch sentiment (no headlines provided, will return neutral)
        sentiment_score = news_sentiment_instance.fetch(symbol, None)
        
        # Placeholder market data (in production, fetch real data)
        market_data = {
            "symbol": symbol,
            "current_price": 100,  # Would fetch from exchange API
            "open_price": 98,
            "high": 102,
            "low": 97,
            "volume": 1000000,
            "avg_volume": 950000
        }
        
        # Get ensemble AI decision
        decision = ensemble_ai_instance.predict(market_data, news_sentiment=sentiment_score)
        
        logger.info(f"AI decision for {symbol}: {decision.get('final_decision')}")
        return {"symbol": symbol, "decision": decision, "sentiment": sentiment_score}
        
    except Exception as e:
        logger.error(f"Error getting AI decision for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ai/decision")
async def ai_decision_with_headlines(body: dict):
    """
    Get AI trading decision for a symbol with optional news headlines.
    
    Args:
        body: JSON with symbol and optional headlines list
        
    Returns:
        AI decision with confidence score
    """
    try:
        symbol = body.get("symbol", "AAPL")
        headlines = body.get("headlines", None)
        
        logger.info(f"AI decision requested for symbol: {symbol} with {len(headlines) if headlines else 0} headlines")
        
        # Fetch sentiment
        sentiment_score = news_sentiment_instance.fetch(symbol, headlines)
        
        # Placeholder market data (in production, fetch real data)
        market_data = {
            "symbol": symbol,
            "current_price": 100,  # Would fetch from exchange API
            "open_price": 98,
            "high": 102,
            "low": 97,
            "volume": 1000000,
            "avg_volume": 950000
        }
        
        # Get ensemble AI decision
        decision = ensemble_ai_instance.predict(market_data, news_sentiment=sentiment_score)
        
        logger.info(f"AI decision for {symbol}: {decision.get('final_decision')}")
        return {"symbol": symbol, "decision": decision, "sentiment": sentiment_score}
        
    except Exception as e:
        logger.error(f"Error getting AI decision: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/hft/execute")
async def hft_execute(body: dict):
    """
    Execute high-frequency trade.
    
    Args:
        body: JSON with symbol, amount, and side
        
    Returns:
        Execution result
    """
    try:
        symbol = body.get("symbol", "")
        amount = float(body.get("amount", 0))
        side = body.get("side", "")
        
        logger.info(f"HFT execute request: {side} {symbol} ${amount}")
        
        result = hft_instance.execute(symbol, amount, side)
        return result
        
    except Exception as e:
        logger.error(f"HFT execution error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/arbitrage/check")
async def arbitrage_check(prices: dict = None):
    """
    Check for arbitrage opportunities.
    
    Args:
        prices: Optional dict of exchange prices (e.g., {"kraken": 100, "binance": 101})
        
    Returns:
        Arbitrage opportunity if found
    """
    try:
        # Use provided prices or fetch from exchanges (placeholder)
        if not prices:
            prices = {"kraken": 100, "binance": 101, "coinbase": 99.5, "kucoin": 100.2}
        
        logger.info("Checking arbitrage opportunities across exchanges")
        
        opportunity = arbitrage_instance.find_opportunity(prices)
        if opportunity:
            execution = arbitrage_instance.execute(opportunity)
            return execution
        
        return {"status": "no_opportunity", "message": "No profitable arbitrage found"}
        
    except Exception as e:
        logger.error(f"Arbitrage check error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/profit/allocate")
async def profit_allocate(body: dict):
    """
    Calculate optimal profit allocation.
    
    Args:
        body: JSON with performance data for each asset/bot
        
    Returns:
        Allocation recommendations
    """
    try:
        performance = body.get("performance", {})
        
        logger.info(f"Calculating profit allocation for {len(performance)} assets")
        
        allocation = profit_maximizer_instance.allocate(performance)
        return allocation
        
    except Exception as e:
        logger.error(f"Profit allocation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
