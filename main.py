import asyncio
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import krakenex
import requests
from alpaca.trading.client import TradingClient
from alpaca.trading.enums import OrderSide, TimeInForce
from alpaca.trading.requests import MarketOrderRequest
from fastapi import FastAPI
from pykrakenapi import KrakenAPI

app = FastAPI()


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "t", "yes", "y", "on"}


@dataclass(frozen=True)
class Settings:
    # Supabase
    supabase_url: str | None = os.getenv("SUPABASE_URL")
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

    # Alpaca (stocks)
    alpaca_api_key: str | None = os.getenv("ALPACA_API_KEY")
    alpaca_secret: str | None = os.getenv("ALPACA_SECRET")
    alpaca_paper: bool = _env_bool("ALPACA_PAPER", True)
    alpaca_symbols: list[str] = [
        s.strip().upper()
        for s in os.getenv("ALPACA_SYMBOLS", "AAPL,SPY").split(",")
        if s.strip()
    ]

    # Kraken (crypto)
    kraken_key: str | None = os.getenv("KRAKEN_KEY")
    kraken_secret: str | None = os.getenv("KRAKEN_SECRET")
    kraken_pairs: list[str] = [
        s.strip().upper()
        for s in os.getenv("KRAKEN_PAIRS", "XBTUSD,ETHUSD").split(",")
        if s.strip()
    ]


SETTINGS = Settings()


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
            print(f"[push-update] failed: {e}")


class SupabaseAdmin:
    def __init__(self, url: str, service_key: str) -> None:
        self._url = url.rstrip("/")
        self._service_key = service_key

    def list_active_swarm_user_ids(self) -> set[str]:
        # Uses service role key to bypass RLS.
        endpoint = f"{self._url}/rest/v1/trader_state"
        params = {
            "select": "user_id,swarm_active",
            "swarm_active": "eq.true",
        }
        headers = {
            "apikey": self._service_key,
            "Authorization": f"Bearer {self._service_key}",
            "Accept": "application/json",
        }
        r = requests.get(endpoint, headers=headers, params=params, timeout=10)
        r.raise_for_status()
        rows = r.json() or []
        return {str(row["user_id"]) for row in rows if row.get("user_id")}


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


class UserBot:
    def __init__(
        self,
        *,
        user_id: str,
        push: PushUpdateClient,
        alpaca: TradingClient | None,
        kraken: KrakenAPI | None,
        settings: Settings,
    ) -> None:
        self._user_id = user_id
        self._push = push
        self._alpaca = alpaca
        self._kraken = kraken
        self._settings = settings

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

    def _alpaca_trade_one_symbol(self, symbol: str) -> None:
        if not self._alpaca:
            return
        if self._settings.trading_mode not in {"paper", "live"}:
            return
        if not self._orders_left():
            return
        try:
            req = MarketOrderRequest(
                symbol=symbol,
                notional=self._settings.max_notional_per_order_usd,
                side=OrderSide.BUY,
                time_in_force=TimeInForce.DAY,
            )
            self._alpaca.submit_order(req)
            self._maybe_inc_orders()
            self._push.send_update(
                user_id=self._user_id,
                new_trade=f"Placed Alpaca BUY {symbol} ${self._settings.max_notional_per_order_usd:.2f}",
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

            cash, equity = self._alpaca_equity()

            # Minimal council update using a cheap price-change proxy (no heavy data dependencies).
            pct_change = None
            for pair in self._settings.kraken_pairs:
                pct_change = self._kraken_price_change_pct(pair)
                if pct_change is not None:
                    break
            if pct_change is None:
                pct_change = 0.0

            votes, reasons, approved = _council_vote_from_price_change(pct_change, self._orders_left())
            self._push.send_update(
                user_id=self._user_id,
                balance=cash,
                today_pl=0.0,
                portfolio_value=equity,
                progress_percent=0.0,
                win_rate=0.0,
                council_votes=votes,
                council_reasons=reasons,
            )

            if approved:
                # In this minimal working version, place a tiny Alpaca order when approved.
                # This is intentionally conservative; expand symbols/strategies once stable.
                for symbol in self._settings.alpaca_symbols:
                    self._alpaca_trade_one_symbol(symbol)
                    break

            await asyncio.sleep(self._settings.tick_interval_seconds)


class BotManager:
    def __init__(self, *, settings: Settings) -> None:
        self._settings = settings
        self._tasks: dict[str, asyncio.Task[None]] = {}

        self._push: PushUpdateClient | None = None
        self._admin: SupabaseAdmin | None = None

        self._alpaca: TradingClient | None = None
        self._kraken: KrakenAPI | None = None

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

        if self._settings.alpaca_api_key and self._settings.alpaca_secret:
            self._alpaca = TradingClient(
                self._settings.alpaca_api_key,
                self._settings.alpaca_secret,
                paper=self._settings.alpaca_paper,
            )
        else:
            print("[bot-manager] Alpaca keys not set; stock trading disabled")

        if self._settings.kraken_key and self._settings.kraken_secret:
            k = krakenex.API(key=self._settings.kraken_key, secret=self._settings.kraken_secret)
            self._kraken = KrakenAPI(k)
        else:
            print("[bot-manager] Kraken keys not set; crypto signals degraded")

    def active_user_ids(self) -> list[str]:
        return sorted(self._tasks.keys())

    def _ensure_user_started(self, user_id: str) -> None:
        if user_id in self._tasks:
            return
        assert self._push is not None
        bot = UserBot(user_id=user_id, push=self._push, alpaca=self._alpaca, kraken=self._kraken, settings=self._settings)
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


@app.on_event("startup")
async def _startup() -> None:
    BOT_MANAGER.start()
    asyncio.create_task(BOT_MANAGER.poll_forever())


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "configured": BOT_MANAGER.configured(),
        "trading_mode": SETTINGS.trading_mode,
        "alpaca_paper": SETTINGS.alpaca_paper,
        "active_users": BOT_MANAGER.active_user_ids(),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
