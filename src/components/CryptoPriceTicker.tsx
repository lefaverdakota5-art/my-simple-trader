import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, RefreshCw } from "lucide-react";

interface CoinPrice {
  price: number;
  change24h: number;
}

interface PriceData {
  btc: CoinPrice | null;
  eth: CoinPrice | null;
  xrp: CoinPrice | null;
  sol: CoinPrice | null;
  doge: CoinPrice | null;
}

const COIN_CONFIG = [
  { key: "btc", label: "BTC", color: "text-orange-500", pairs: ["XXBTZUSD", "XBTUSD"] },
  { key: "eth", label: "ETH", color: "text-blue-500", pairs: ["XETHZUSD", "ETHUSD"] },
  { key: "xrp", label: "XRP", color: "text-slate-400", pairs: ["XXRPZUSD", "XRPUSD"] },
  { key: "sol", label: "SOL", color: "text-purple-500", pairs: ["SOLUSD"] },
  { key: "doge", label: "DOGE", color: "text-yellow-500", pairs: ["XDGUSD", "DOGEUSD"] },
] as const;

export function CryptoPriceTicker() {
  const [prices, setPrices] = useState<PriceData>({ btc: null, eth: null, xrp: null, sol: null, doge: null });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchPrices = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const response = await fetch(
        "https://api.kraken.com/0/public/Ticker?pair=XBTUSD,ETHUSD,XRPUSD,SOLUSD,DOGEUSD"
      );
      const data = await response.json();

      if (data.result) {
        const newPrices: PriceData = { btc: null, eth: null, xrp: null, sol: null, doge: null };
        
        for (const coin of COIN_CONFIG) {
          for (const pairName of coin.pairs) {
            const pairData = data.result[pairName];
            if (pairData) {
              newPrices[coin.key] = {
                price: parseFloat(pairData.c[0]),
                change24h:
                  ((parseFloat(pairData.c[0]) - parseFloat(pairData.o)) /
                    parseFloat(pairData.o)) *
                  100,
              };
              break;
            }
          }
        }
        
        setPrices(newPrices);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error("Failed to fetch Kraken prices:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatPrice = (price: number) => {
    if (price < 1) {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 4,
      }).format(price);
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(price);
  };

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
    <div className="flex flex-wrap items-center gap-2">
      {COIN_CONFIG.map((coin) => {
        const priceData = prices[coin.key];
        if (!priceData) return null;
        return (
          <Badge key={coin.key} variant="outline" className="flex items-center gap-2 py-1.5 px-3">
            <span className={`font-bold ${coin.color}`}>{coin.label}</span>
            <span className="font-mono text-xs">{formatPrice(priceData.price)}</span>
            {formatChange(priceData.change24h)}
          </Badge>
        );
      })}
      <button
        onClick={() => fetchPrices(true)}
        disabled={refreshing}
        className="p-1.5 rounded-md hover:bg-muted transition-colors disabled:opacity-50"
        title="Refresh prices"
      >
        <RefreshCw className={`h-4 w-4 text-muted-foreground ${refreshing ? "animate-spin" : ""}`} />
      </button>
      {lastUpdate && (
        <span className="text-xs text-muted-foreground">
          {lastUpdate.toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
