import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TrendingUp, TrendingDown, RefreshCw, Search, Grid3X3, Coins } from "lucide-react";

interface CryptoPrice {
  symbol: string;
  name: string;
  pair: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
}

// All trading pairs from bot-tick
const ALL_PAIRS = [
  // Major coins (Top 10)
  { pair: "XBTUSD", symbol: "BTC", name: "Bitcoin", category: "Major" },
  { pair: "ETHUSD", symbol: "ETH", name: "Ethereum", category: "Major" },
  { pair: "SOLUSD", symbol: "SOL", name: "Solana", category: "Major" },
  { pair: "XRPUSD", symbol: "XRP", name: "XRP", category: "Major" },
  { pair: "ADAUSD", symbol: "ADA", name: "Cardano", category: "Major" },
  { pair: "DOTUSD", symbol: "DOT", name: "Polkadot", category: "Major" },
  { pair: "AVAXUSD", symbol: "AVAX", name: "Avalanche", category: "Major" },
  { pair: "LINKUSD", symbol: "LINK", name: "Chainlink", category: "Major" },
  { pair: "LTCUSD", symbol: "LTC", name: "Litecoin", category: "Major" },
  { pair: "BCHUSD", symbol: "BCH", name: "Bitcoin Cash", category: "Major" },
  // Layer 1 & Layer 2
  { pair: "ATOMUSD", symbol: "ATOM", name: "Cosmos", category: "Layer 1" },
  { pair: "NEARUSD", symbol: "NEAR", name: "NEAR Protocol", category: "Layer 1" },
  { pair: "APTUSD", symbol: "APT", name: "Aptos", category: "Layer 1" },
  { pair: "SUIUSD", symbol: "SUI", name: "Sui", category: "Layer 1" },
  { pair: "ICPUSD", symbol: "ICP", name: "Internet Computer", category: "Layer 1" },
  { pair: "ALGOUSD", symbol: "ALGO", name: "Algorand", category: "Layer 1" },
  { pair: "XLMUSD", symbol: "XLM", name: "Stellar", category: "Layer 1" },
  { pair: "HBARUSD", symbol: "HBAR", name: "Hedera", category: "Layer 1" },
  { pair: "VETUSD", symbol: "VET", name: "VeChain", category: "Layer 1" },
  { pair: "FILUSD", symbol: "FIL", name: "Filecoin", category: "Layer 1" },
  { pair: "EGLDUSD", symbol: "EGLD", name: "MultiversX", category: "Layer 1" },
  { pair: "EOSUSD", symbol: "EOS", name: "EOS", category: "Layer 1" },
  { pair: "XTZUSD", symbol: "XTZ", name: "Tezos", category: "Layer 1" },
  { pair: "FLOWUSD", symbol: "FLOW", name: "Flow", category: "Layer 1" },
  { pair: "MINAUSD", symbol: "MINA", name: "Mina", category: "Layer 1" },
  { pair: "KASUSD", symbol: "KAS", name: "Kaspa", category: "Layer 1" },
  { pair: "SEIUSD", symbol: "SEI", name: "Sei", category: "Layer 1" },
  { pair: "INJUSD", symbol: "INJ", name: "Injective", category: "Layer 1" },
  { pair: "TIAUSD", symbol: "TIA", name: "Celestia", category: "Layer 1" },
  { pair: "ARBUSD", symbol: "ARB", name: "Arbitrum", category: "Layer 2" },
  { pair: "OPUSD", symbol: "OP", name: "Optimism", category: "Layer 2" },
  { pair: "MATICUSD", symbol: "MATIC", name: "Polygon", category: "Layer 2" },
  { pair: "IMXUSD", symbol: "IMX", name: "Immutable X", category: "Layer 2" },
  { pair: "MANTUSD", symbol: "MANT", name: "Mantle", category: "Layer 2" },
  { pair: "STXUSD", symbol: "STX", name: "Stacks", category: "Layer 2" },
  // DeFi
  { pair: "UNIUSD", symbol: "UNI", name: "Uniswap", category: "DeFi" },
  { pair: "AAVEUSD", symbol: "AAVE", name: "Aave", category: "DeFi" },
  { pair: "MKRUSD", symbol: "MKR", name: "Maker", category: "DeFi" },
  { pair: "SNXUSD", symbol: "SNX", name: "Synthetix", category: "DeFi" },
  { pair: "CRVUSD", symbol: "CRV", name: "Curve", category: "DeFi" },
  { pair: "COMPUSD", symbol: "COMP", name: "Compound", category: "DeFi" },
  { pair: "LDOUSD", symbol: "LDO", name: "Lido DAO", category: "DeFi" },
  { pair: "SUSHIUSD", symbol: "SUSHI", name: "SushiSwap", category: "DeFi" },
  { pair: "1INCHUSD", symbol: "1INCH", name: "1inch", category: "DeFi" },
  { pair: "BALUSD", symbol: "BAL", name: "Balancer", category: "DeFi" },
  { pair: "YFIUSD", symbol: "YFI", name: "yearn.finance", category: "DeFi" },
  { pair: "GMXUSD", symbol: "GMX", name: "GMX", category: "DeFi" },
  { pair: "DYDXUSD", symbol: "DYDX", name: "dYdX", category: "DeFi" },
  // AI & Data
  { pair: "FETUSD", symbol: "FET", name: "Fetch.ai", category: "AI" },
  { pair: "GRTUSD", symbol: "GRT", name: "The Graph", category: "AI" },
  { pair: "RENDERUSD", symbol: "RNDR", name: "Render", category: "AI" },
  { pair: "OCEANUSD", symbol: "OCEAN", name: "Ocean Protocol", category: "AI" },
  { pair: "AKTUSD", symbol: "AKT", name: "Akash Network", category: "AI" },
  { pair: "WLDUSD", symbol: "WLD", name: "Worldcoin", category: "AI" },
  // Gaming & Metaverse
  { pair: "MANAUSD", symbol: "MANA", name: "Decentraland", category: "Gaming" },
  { pair: "SANDUSD", symbol: "SAND", name: "The Sandbox", category: "Gaming" },
  { pair: "AXSUSD", symbol: "AXS", name: "Axie Infinity", category: "Gaming" },
  { pair: "GALAUSD", symbol: "GALA", name: "Gala", category: "Gaming" },
  { pair: "ENJUSD", symbol: "ENJ", name: "Enjin Coin", category: "Gaming" },
  { pair: "APEUSD", symbol: "APE", name: "ApeCoin", category: "Gaming" },
  { pair: "RONUSD", symbol: "RON", name: "Ronin", category: "Gaming" },
  // Meme coins
  { pair: "DOGEUSD", symbol: "DOGE", name: "Dogecoin", category: "Meme" },
  { pair: "SHIBUSD", symbol: "SHIB", name: "Shiba Inu", category: "Meme" },
  { pair: "PEPEUSD", symbol: "PEPE", name: "Pepe", category: "Meme" },
  { pair: "FLOKIUSD", symbol: "FLOKI", name: "Floki", category: "Meme" },
  { pair: "BONKUSD", symbol: "BONK", name: "Bonk", category: "Meme" },
  { pair: "WIFUSD", symbol: "WIF", name: "dogwifhat", category: "Meme" },
  // Privacy & Misc
  { pair: "XMRUSD", symbol: "XMR", name: "Monero", category: "Privacy" },
  { pair: "ZECUSD", symbol: "ZEC", name: "Zcash", category: "Privacy" },
  { pair: "DASHUSD", symbol: "DASH", name: "Dash", category: "Privacy" },
  { pair: "PAXGUSD", symbol: "PAXG", name: "PAX Gold", category: "Other" },
  { pair: "KSMUSD", symbol: "KSM", name: "Kusama", category: "Other" },
  { pair: "QNTUSD", symbol: "QNT", name: "Quant", category: "Other" },
  { pair: "RUNEUSD", symbol: "RUNE", name: "THORChain", category: "Other" },
  { pair: "KAVAUSD", symbol: "KAVA", name: "Kava", category: "Other" },
  { pair: "ZRXUSD", symbol: "ZRX", name: "0x", category: "Other" },
  { pair: "STORJUSD", symbol: "STORJ", name: "Storj", category: "Other" },
  { pair: "ENSUSD", symbol: "ENS", name: "ENS", category: "Other" },
  { pair: "BATUSD", symbol: "BAT", name: "Basic Attention Token", category: "Other" },
  { pair: "CHZUSD", symbol: "CHZ", name: "Chiliz", category: "Other" },
  { pair: "ANKRUSD", symbol: "ANKR", name: "Ankr", category: "Other" },
  { pair: "AUDIOUSD", symbol: "AUDIO", name: "Audius", category: "Other" },
  { pair: "JASMYUSD", symbol: "JASMY", name: "JasmyCoin", category: "Other" },
  { pair: "PYTHUSD", symbol: "PYTH", name: "Pyth Network", category: "Other" },
  { pair: "JUPUSD", symbol: "JUP", name: "Jupiter", category: "Other" },
  { pair: "JTOUSD", symbol: "JTO", name: "Jito", category: "Other" },
  { pair: "STRKUSD", symbol: "STRK", name: "Starknet", category: "Other" },
  { pair: "ENAUSD", symbol: "ENA", name: "Ethena", category: "Other" },
];

const CATEGORIES = ["All", "Major", "Layer 1", "Layer 2", "DeFi", "AI", "Gaming", "Meme", "Privacy", "Other"];

const CATEGORY_COLORS: Record<string, string> = {
  Major: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "Layer 1": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "Layer 2": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  DeFi: "bg-green-500/20 text-green-400 border-green-500/30",
  AI: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  Gaming: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  Meme: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  Privacy: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  Other: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export function CryptoMarketGrid() {
  const [prices, setPrices] = useState<Map<string, CryptoPrice>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [sortBy, setSortBy] = useState<"change" | "name" | "price">("change");

  const fetchPrices = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    
    try {
      // Fetch in batches to avoid overwhelming the API
      const batchSize = 20;
      const newPrices = new Map<string, CryptoPrice>();
      
      for (let i = 0; i < ALL_PAIRS.length; i += batchSize) {
        const batch = ALL_PAIRS.slice(i, i + batchSize);
        const pairString = batch.map(p => p.pair).join(",");
        
        try {
          const response = await fetch(
            `https://api.kraken.com/0/public/Ticker?pair=${pairString}`
          );
          const data = await response.json();
          
          if (data.result) {
            for (const pairConfig of batch) {
              // Try multiple pair name formats
              const possibleNames = [
                pairConfig.pair,
                `X${pairConfig.symbol}ZUSD`,
                `${pairConfig.symbol}USD`,
              ];
              
              for (const pairName of possibleNames) {
                const pairData = data.result[pairName];
                if (pairData) {
                  const currentPrice = parseFloat(pairData.c[0]);
                  const openPrice = parseFloat(pairData.o);
                  const change24h = ((currentPrice - openPrice) / openPrice) * 100;
                  
                  newPrices.set(pairConfig.symbol, {
                    symbol: pairConfig.symbol,
                    name: pairConfig.name,
                    pair: pairConfig.pair,
                    price: currentPrice,
                    change24h,
                    volume24h: parseFloat(pairData.v[1]),
                    high24h: parseFloat(pairData.h[1]),
                    low24h: parseFloat(pairData.l[1]),
                  });
                  break;
                }
              }
            }
          }
        } catch (error) {
          console.error(`Failed to fetch batch starting at ${i}:`, error);
        }
        
        // Small delay between batches
        if (i + batchSize < ALL_PAIRS.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      setPrices(newPrices);
      setLastUpdate(new Date());
    } catch (error) {
      console.error("Failed to fetch prices:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(() => fetchPrices(), 60000); // Update every minute
    return () => clearInterval(interval);
  }, [fetchPrices]);

  const formatPrice = (price: number) => {
    if (price >= 1000) {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(price);
    }
    if (price >= 1) {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }).format(price);
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 4,
      maximumFractionDigits: 6,
    }).format(price);
  };

  const filteredAndSortedPairs = ALL_PAIRS
    .filter(pair => {
      const matchesSearch = 
        pair.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pair.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === "All" || pair.category === selectedCategory;
      return matchesSearch && matchesCategory;
    })
    .map(pair => ({
      ...pair,
      priceData: prices.get(pair.symbol),
    }))
    .sort((a, b) => {
      if (sortBy === "change") {
        const changeA = a.priceData?.change24h ?? 0;
        const changeB = b.priceData?.change24h ?? 0;
        return changeB - changeA; // Descending by change
      }
      if (sortBy === "price") {
        const priceA = a.priceData?.price ?? 0;
        const priceB = b.priceData?.price ?? 0;
        return priceB - priceA; // Descending by price
      }
      return a.name.localeCompare(b.name); // Alphabetical
    });

  const loadedCount = prices.size;
  const totalCount = ALL_PAIRS.length;

  if (loading && loadedCount === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Grid3X3 className="h-5 w-5" />
            Crypto Market
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Loading market data...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5" />
            Crypto Market
            <Badge variant="secondary" className="ml-2">
              {loadedCount}/{totalCount}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchPrices(true)}
              disabled={refreshing}
              className="p-2 rounded-md hover:bg-muted transition-colors disabled:opacity-50"
              title="Refresh prices"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
            {lastUpdate && (
              <span className="text-xs text-muted-foreground">
                {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        
        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search coins..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "change" | "name" | "price")}
            className="px-3 py-2 rounded-md border border-border bg-background text-sm"
          >
            <option value="change">Sort by Change</option>
            <option value="price">Sort by Price</option>
            <option value="name">Sort by Name</option>
          </select>
        </div>
        
        {/* Category Filter */}
        <div className="flex flex-wrap gap-2 mt-3">
          {CATEGORIES.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedCategory === category
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <ScrollArea className="h-[500px] pr-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredAndSortedPairs.map(({ symbol, name, category, priceData }) => {
              const isPositive = (priceData?.change24h ?? 0) >= 0;
              
              return (
                <div
                  key={symbol}
                  className="p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="font-bold text-lg">{symbol}</span>
                      <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                        {name}
                      </p>
                    </div>
                    <Badge 
                      variant="outline" 
                      className={`text-[10px] px-1.5 py-0.5 ${CATEGORY_COLORS[category] || ""}`}
                    >
                      {category}
                    </Badge>
                  </div>
                  
                  {priceData ? (
                    <>
                      <p className="font-mono text-lg font-semibold mb-1">
                        {formatPrice(priceData.price)}
                      </p>
                      <div className={`flex items-center gap-1 text-sm font-medium ${
                        isPositive ? "text-green-500" : "text-red-500"
                      }`}>
                        {isPositive ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {isPositive ? "+" : ""}{priceData.change24h.toFixed(2)}%
                      </div>
                    </>
                  ) : (
                    <div className="text-muted-foreground text-sm">
                      Loading...
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          {filteredAndSortedPairs.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No coins found matching your search.
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}