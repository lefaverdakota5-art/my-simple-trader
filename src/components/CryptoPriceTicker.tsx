import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, RefreshCw } from "lucide-react";

interface PriceData {
  btc: { price: number; change24h: number } | null;
  eth: { price: number; change24h: number } | null;
}

export function CryptoPriceTicker() {
  const [prices, setPrices] = useState<PriceData>({ btc: null, eth: null });
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchPrices = async () => {
    try {
      const response = await fetch(
        "https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD"
      );
      const data = await response.json();

      if (data.result) {
        const btcData = data.result.XXBTZUSD || data.result.XBTUSD;
        const ethData = data.result.XETHZUSD || data.result.ETHUSD;

        setPrices({
          btc: btcData
            ? {
                price: parseFloat(btcData.c[0]),
                change24h:
                  ((parseFloat(btcData.c[0]) - parseFloat(btcData.o)) /
                    parseFloat(btcData.o)) *
                  100,
              }
            : null,
          eth: ethData
            ? {
                price: parseFloat(ethData.c[0]),
                change24h:
                  ((parseFloat(ethData.c[0]) - parseFloat(ethData.o)) /
                    parseFloat(ethData.o)) *
                  100,
              }
            : null,
        });
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error("Failed to fetch Kraken prices:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(price);

  const formatChange = (change: number) => {
    const isPositive = change >= 0;
    return (
      <span className={`flex items-center gap-1 ${isPositive ? "text-green-500" : "text-red-500"}`}>
        {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {isPositive ? "+" : ""}{change.toFixed(2)}%
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading prices...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {prices.btc && (
        <Badge variant="outline" className="flex items-center gap-2 py-1.5 px-3">
          <span className="font-bold text-orange-500">BTC</span>
          <span className="font-mono">{formatPrice(prices.btc.price)}</span>
          {formatChange(prices.btc.change24h)}
        </Badge>
      )}
      {prices.eth && (
        <Badge variant="outline" className="flex items-center gap-2 py-1.5 px-3">
          <span className="font-bold text-blue-500">ETH</span>
          <span className="font-mono">{formatPrice(prices.eth.price)}</span>
          {formatChange(prices.eth.change24h)}
        </Badge>
      )}
      {lastUpdate && (
        <span className="text-xs text-muted-foreground">
          Updated {lastUpdate.toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
