import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTrades } from "@/hooks/useTrades";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  BarChart2,
  Search,
  Home,
  Activity,
  Loader2,
} from "lucide-react";

export default function TradeHistory() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { trades, loading, stats, refresh } = useTrades(user?.id ?? null);

  const [symbolFilter, setSymbolFilter] = useState("");
  const [sideFilter, setSideFilter] = useState<"all" | "buy" | "sell">("all");
  const [pnlFilter, setPnlFilter] = useState<"all" | "profit" | "loss" | "breakeven">("all");

  const formatMoney = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value ?? 0);

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  const filteredTrades = useMemo(() => {
    return trades.filter((t) => {
      if (symbolFilter && !t.pair.toLowerCase().includes(symbolFilter.toLowerCase())) return false;
      if (sideFilter !== "all" && t.side !== sideFilter) return false;
      if (pnlFilter === "profit" && (t.realized_pnl ?? 0) <= 0) return false;
      if (pnlFilter === "loss" && (t.realized_pnl ?? 0) >= 0) return false;
      if (pnlFilter === "breakeven" && (t.realized_pnl ?? 0) !== 0) return false;
      return true;
    });
  }, [trades, symbolFilter, sideFilter, pnlFilter]);

  if (!user) {
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Please log in to view trade history.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Trade History</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => refresh()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-1">Refresh</span>
        </Button>
      </div>

      {/* Quick Links */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" asChild>
          <Link to="/dashboard">
            <Home className="h-4 w-4 mr-1" />
            Dashboard
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/live-activity">
            <Activity className="h-4 w-4 mr-1" />
            Live Activity
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/bot-monitor">
            <BarChart2 className="h-4 w-4 mr-1" />
            Bot Monitor
          </Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.totalTrades}</p>
            <p className="text-xs text-muted-foreground">Total Trades</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{formatPercent(stats.winRate)}</p>
            <p className="text-xs text-muted-foreground">Win Rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className={`text-2xl font-bold ${stats.avgProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatMoney(stats.avgProfit)}
            </p>
            <p className="text-xs text-muted-foreground">Avg per Trade</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{formatMoney(stats.bestTrade)}</p>
            <p className="text-xs text-muted-foreground">Best Trade</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{formatMoney(stats.worstTrade)}</p>
            <p className="text-xs text-muted-foreground">Worst Trade</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className={`text-2xl font-bold ${stats.totalPnl >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatMoney(stats.totalPnl)}
            </p>
            <p className="text-xs text-muted-foreground">Total P&L</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Search className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[180px]">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                placeholder="Search symbol..."
                value={symbolFilter}
                onChange={(e) => setSymbolFilter(e.target.value)}
                className="h-8"
              />
            </div>
            <Select value={sideFilter} onValueChange={(v) => setSideFilter(v as typeof sideFilter)}>
              <SelectTrigger className="w-32 h-8">
                <SelectValue placeholder="Side" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sides</SelectItem>
                <SelectItem value="buy">Buy</SelectItem>
                <SelectItem value="sell">Sell</SelectItem>
              </SelectContent>
            </Select>
            <Select value={pnlFilter} onValueChange={(v) => setPnlFilter(v as typeof pnlFilter)}>
              <SelectTrigger className="w-36 h-8">
                <SelectValue placeholder="P&L" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All P&L</SelectItem>
                <SelectItem value="profit">Profitable</SelectItem>
                <SelectItem value="loss">Loss</SelectItem>
                <SelectItem value="breakeven">Break-even</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSymbolFilter("");
                setSideFilter("all");
                setPnlFilter("all");
              }}
            >
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Trade Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            Trades ({filteredTrades.length}{filteredTrades.length !== trades.length ? ` of ${trades.length}` : ""})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p className="text-muted-foreground">Loading trades...</p>
            </div>
          ) : filteredTrades.length === 0 ? (
            <div className="text-center py-12">
              <BarChart2 className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground">No trades found</p>
              {trades.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Trades will appear here once the bot executes orders
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-4">Symbol</th>
                    <th className="text-left py-2 pr-4">Side</th>
                    <th className="text-right py-2 pr-4">Qty</th>
                    <th className="text-right py-2 pr-4">Price</th>
                    <th className="text-right py-2 pr-4">Cost</th>
                    <th className="text-right py-2 pr-4">Fee</th>
                    <th className="text-right py-2 pr-4">P&L</th>
                    <th className="text-right py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTrades.map((trade) => (
                    <tr key={trade.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="py-2 pr-4 font-medium">{trade.pair}</td>
                      <td className="py-2 pr-4">
                        <Badge
                          variant={trade.side === "buy" ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {trade.side.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-xs">
                        {trade.volume.toFixed(6)}
                      </td>
                      <td className="py-2 pr-4 text-right">{formatMoney(trade.price)}</td>
                      <td className="py-2 pr-4 text-right">{formatMoney(trade.cost_usd)}</td>
                      <td className="py-2 pr-4 text-right text-muted-foreground text-xs">
                        {trade.fee_usd !== null ? formatMoney(trade.fee_usd) : "-"}
                      </td>
                      <td className="py-2 pr-4 text-right">
                        {trade.realized_pnl !== null ? (
                          <span
                            className={`flex items-center justify-end gap-1 font-medium ${
                              trade.realized_pnl >= 0 ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {trade.realized_pnl >= 0 ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <TrendingDown className="h-3 w-3" />
                            )}
                            {trade.realized_pnl >= 0 ? "+" : ""}
                            {formatMoney(trade.realized_pnl)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-2 text-right text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(trade.filled_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
