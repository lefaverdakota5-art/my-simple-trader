import os
import asyncio
import requests
from datetime import datetime
from fastapi import FastAPI
from alpaca.trading.client import TradingClient
from alpaca.trading.requests import MarketOrderRequest
from alpaca.data.live import StockDataStream
import krakenex
from pykrakenapi import KrakenAPI

app = FastAPI()

ALPACA_KEY = os.getenv("ALPACA_API_KEY")
ALPACA_SECRET = os.getenv("ALPACA_SECRET")
KRAKEN_KEY = os.getenv("KRAKEN_KEY")
KRAKEN_SECRET = os.getenv("KRAKEN_SECRET")
SUPABASE_WEBHOOK = os.getenv("SUPABASE_WEBHOOK")

trading_client = TradingClient(ALPACA_KEY, ALPACA_SECRET, paper=True)
k = krakenex.API(key=KRAKEN_KEY, secret=KRAKEN_SECRET)
kraken = KrakenAPI(k)

def send_update(message):
    if SUPABASE_WEBHOOK:
        requests.post(SUPABASE_WEBHOOK, json={
            "new_trade": message,
            "balance": "Live",
            "today_pl": "+0.00",
            "council_votes": "Running",
            "council_reasons": ["Bot active 24/7"]
        })

async def stock_bot():
    send_update("Stock swarm started - running 24/7")
    stream = StockDataStream(ALPACA_KEY, ALPACA_SECRET)
    async def handle_bar(bar):
        if bar.close > bar.open * 1.002:
            order = MarketOrderRequest(symbol=bar.symbol, notional="1.00", side="buy", time_in_force="day")
            trading_client.submit_order(order)
            send_update(f"Bought {bar.symbol} $1")
        await asyncio.sleep(1)
    stream.subscribe_bars(handle_bar, "TOI", "AAPL")
    await stream.run()

async def crypto_bot():
    send_update("Crypto swarm started - running 24/7")
    while True:
        try:
            ticker = kraken.get_ticker_information('XBTUSD')
            price = float(ticker['c'][0][0])
            send_update(f"BTC price: ${price}")
        except:
            pass
        await asyncio.sleep(300)

@app.get("/health")
async def health():
    return {"status": "Swarm running 24/7 🟢"}

if __name__ == "__main__":
    loop = asyncio.get_event_loop()
    loop.create_task(stock_bot())
    loop.create_task(crypto_bot())
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
