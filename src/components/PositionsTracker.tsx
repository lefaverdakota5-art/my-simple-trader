import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Target, AlertTriangle, RefreshCw, Briefcase } from "lucide-react";

interface Position {
  id: string;
  symbol: string;
  pair: string;
  side: string;
  quantity: number;
  entry_price: number;
  current_price: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_percent: number | null;
  take_profit_percent: number | null;
  stop_loss_percent: number | null;
  status: string;
  created_at: string;
}

interface PositionsTrackerProps {
  userId: string | null;
}

export function PositionsTracker({ userId }: PositionsTrackerProps) {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPositions = async (isManual = false) => {
    if (!userId) return;
    if (isManual) setRefreshing(true);

    try {
      const { data, error } = await supabase
        .from("positions" as any)
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setPositions(data as unknown as Position[]);
      }
    } catch (error) {
      console.error("Failed to fetch positions:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPositions();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("positions-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "positions",
        },
        () => {
          fetchPositions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const formatPrice = (price: number) => {
    if (price >= 1000) {
      return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (price >= 1) {
      return `$${price.toFixed(4)}`;
    }
    return `$${price.toFixed(6)}`;
  };

  const openPositions = positions.filter(p => p.status === "open");
  const closedPositions = positions.filter(p => p.status === "closed").slice(0, 10);

  const totalUnrealizedPnl = openPositions.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0);
  const totalValue = openPositions.reduce((sum, p) => sum + (p.quantity * (p.current_price || p.entry_price)), 0);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Positions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5" />
            Positions
            {openPositions.length > 0 && (
              <Badge variant="default">{openPositions.length} Open</Badge>
            )}
          </CardTitle>
          <button
            onClick={() => fetchPositions(true)}
            disabled={refreshing}
            className="p-2 rounded-md hover:bg-muted transition-colors disabled:opacity-50"
            title="Refresh positions"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        {openPositions.length > 0 && (
          <div className="flex gap-4 mt-3 text-sm">
            <div>
              <span className="text-muted-foreground">Total Value:</span>{" "}
              <span className="font-semibold">${totalValue.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Unrealized P&L:</span>{" "}
              <span className={`font-semibold ${totalUnrealizedPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                {totalUnrealizedPnl >= 0 ? "+" : ""}{totalUnrealizedPnl.toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {positions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No positions yet. Enable the swarm to start trading.
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            {/* Open Positions */}
            {openPositions.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">Open Positions</h4>
                <div className="space-y-3">
                  {openPositions.map((position) => {
                    const pnlPercent = position.unrealized_pnl_percent || 0;
                    const isPositive = pnlPercent >= 0;
                    const takeProfitPercent = position.take_profit_percent || 10;
                    const stopLossPercent = position.stop_loss_percent || 5;

                    // Progress towards TP/SL
                    const tpProgress = Math.min((pnlPercent / takeProfitPercent) * 100, 100);
                    const slProgress = pnlPercent < 0 ? Math.min((Math.abs(pnlPercent) / stopLossPercent) * 100, 100) : 0;

                    return (
                      <div
                        key={position.id}
                        className="p-4 rounded-lg border border-border bg-card"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <span className="font-bold text-lg">{position.symbol}</span>
                            <Badge variant="outline" className="ml-2 text-xs">
                              {position.side.toUpperCase()}
                            </Badge>
                          </div>
                          <div className={`flex items-center gap-1 font-semibold ${isPositive ? "text-green-500" : "text-red-500"}`}>
                            {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                            {isPositive ? "+" : ""}{pnlPercent.toFixed(2)}%
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                          <div>
                            <span className="text-muted-foreground">Entry:</span>{" "}
                            <span className="font-mono">{formatPrice(position.entry_price)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Current:</span>{" "}
                            <span className="font-mono">{formatPrice(position.current_price || position.entry_price)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Qty:</span>{" "}
                            <span className="font-mono">{position.quantity.toFixed(6)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">P&L:</span>{" "}
                            <span className={`font-mono ${isPositive ? "text-green-500" : "text-red-500"}`}>
                              {isPositive ? "+" : ""}${(position.unrealized_pnl || 0).toFixed(2)}
                            </span>
                          </div>
                        </div>

                        {/* TP/SL Progress */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-xs">
                            <Target className="h-3 w-3 text-green-500" />
                            <span className="text-muted-foreground">Take Profit ({takeProfitPercent}%)</span>
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-green-500 transition-all"
                                style={{ width: `${Math.max(0, tpProgress)}%` }}
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <AlertTriangle className="h-3 w-3 text-red-500" />
                            <span className="text-muted-foreground">Stop Loss ({stopLossPercent}%)</span>
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-red-500 transition-all"
                                style={{ width: `${slProgress}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Closed Positions */}
            {closedPositions.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground mb-3">Recently Closed</h4>
                <div className="space-y-2">
                  {closedPositions.map((position) => {
                    const realizedPnl = (position as any).realized_pnl || 0;
                    const isPositive = realizedPnl >= 0;

                    return (
                      <div
                        key={position.id}
                        className="p-3 rounded-lg border border-border bg-muted/30 opacity-75"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{position.symbol}</span>
                            <Badge variant="secondary" className="text-xs">CLOSED</Badge>
                          </div>
                          <span className={`font-semibold ${isPositive ? "text-green-500" : "text-red-500"}`}>
                            {isPositive ? "+" : ""}${realizedPnl.toFixed(2)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {formatPrice(position.entry_price)} → {formatPrice((position as any).exit_price || 0)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}