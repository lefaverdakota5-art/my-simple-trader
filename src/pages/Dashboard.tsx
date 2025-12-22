import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTraderState } from '@/hooks/useTraderState';
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PerformanceChart } from "@/components/PerformanceChart";
import { CryptoPriceTicker } from "@/components/CryptoPriceTicker";
import { CryptoMarketGrid } from "@/components/CryptoMarketGrid";
import { PositionsTracker } from "@/components/PositionsTracker";
import { GoalTracker10M } from "@/components/GoalTracker10M";
import { toast } from "sonner";
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Activity, 
  Target, 
  Award,
  Settings,
  LogOut,
  Landmark,
  Users,
  ArrowDownCircle,
  Zap
} from "lucide-react";

export default function Dashboard() {
  const { user, loading: authLoading, signOut, initializeTraderState } = useAuth();
  const { state, trades, loading: stateLoading, toggleSwarm, toggleAutonomy, krakenBalance, loadingKraken, refreshKrakenBalance } = useTraderState(user?.id || null);
  const navigate = useNavigate();
  const [keyStatus, setKeyStatus] = useState<
    null | { ok: boolean; krakenOk?: boolean; plaidOk?: boolean; openaiOk?: boolean }
  >(null);
  const [tradingLoading, setTradingLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      initializeTraderState(user.id);
    }
  }, [user, initializeTraderState]);

  useEffect(() => {
    (async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase.functions.invoke("bot-actions", {
          body: { action: "status" },
        });
        if (error) {
          setKeyStatus({ ok: false });
          return;
        }
        setKeyStatus({
          ok: true,
          krakenOk: Boolean(data?.krakenOk),
          plaidOk: Boolean(data?.plaidOk),
          openaiOk: Boolean(data?.openaiOk),
        });
      } catch {
        setKeyStatus({ ok: false });
      }
    })();
  }, [user]);

  if (authLoading || stateLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-foreground mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const formatMoney = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value || 0);
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const handleTestRealTrade = async () => {
    if (!user) return;
    
    setTradingLoading(true);
    try {
      // Try XRP first (lower minimum), then fall back to others
      const pairs = ["XXRPZUSD", "ADAUSD", "XDGUSD"];
      let tradeResult = null;
      let lastError = "";
      
      for (const pair of pairs) {
        const { data, error } = await supabase.functions.invoke("kraken-withdraw", {
          body: { 
            action: "buy_crypto",
            pair: pair,
            amount_usd: 1.0
          },
        });
        
        if (error) {
          lastError = error.message;
          continue;
        }
        
        if (data?.error) {
          lastError = data.error;
          // If it's a minimum order error, try next pair
          if (data.error.includes("below minimum")) {
            continue;
          }
          toast.error(data.error);
          return;
        }
        
        tradeResult = data;
        break;
      }
      
      if (!tradeResult) {
        toast.error(lastError || "Could not execute trade - minimum order requirements not met with $1");
        return;
      }
      
      toast.success(tradeResult.message || "Trade executed successfully!");
      console.log("Trade result:", tradeResult);
      
      // Refresh Kraken balance after trade
      refreshKrakenBalance();
      
    } catch (err) {
      toast.error("Trade failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setTradingLoading(false);
    }
  };

  const profitIsPositive = (state?.todays_profit || 0) >= 0;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Trading Dashboard</h1>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/settings')}
            className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
            title="Settings"
          >
            <Settings className="h-5 w-5" />
          </button>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Crypto Price Ticker */}
      <div className="mb-6">
        <CryptoPriceTicker />
      </div>

      {/* Bot Status Bar */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Badge variant={state?.swarm_active ? "default" : "secondary"} className="text-sm">
          <Activity className="h-3 w-3 mr-1" />
          Swarm {state?.swarm_active ? 'Active' : 'Inactive'}
        </Badge>
        <Badge variant={state?.autonomy_mode ? "default" : "secondary"} className="text-sm">
          Autonomy {state?.autonomy_mode ? 'ON' : 'OFF'}
        </Badge>
        {keyStatus && (
          <>
            <Badge variant={keyStatus.krakenOk ? "default" : "outline"} className="text-sm">
              Kraken {keyStatus.krakenOk ? "✓" : "✗"}
            </Badge>
            <Badge variant={keyStatus.plaidOk ? "default" : "outline"} className="text-sm">
              Plaid {keyStatus.plaidOk ? "✓" : "✗"}
            </Badge>
            <Badge variant={keyStatus.openaiOk ? "default" : "outline"} className="text-sm">
              OpenAI {keyStatus.openaiOk ? "✓" : "○"}
            </Badge>
          </>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Card className="border-2 border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-primary flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Kraken Balance (Real $)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {loadingKraken ? 'Loading...' : formatMoney(krakenBalance ?? 0)}
            </p>
            <button 
              onClick={refreshKrakenBalance}
              disabled={loadingKraken}
              className="text-xs text-muted-foreground hover:text-foreground mt-1"
            >
              ↻ Refresh
            </button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              {profitIsPositive ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
              Today's P/L
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${profitIsPositive ? 'text-green-600' : 'text-red-600'}`}>
              {profitIsPositive ? '+' : ''}{formatMoney(state?.todays_profit || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Portfolio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(state?.portfolio_value || 0)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4" />
              Progress to $1M
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{(state?.progress_percent || 0).toFixed(2)}%</p>
            <div className="w-full bg-muted rounded-full h-2 mt-2">
              <div 
                className="bg-foreground rounded-full h-2 transition-all" 
                style={{ width: `${Math.min(state?.progress_percent || 0, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Award className="h-4 w-4" />
              Win Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{(state?.win_rate || 0).toFixed(1)}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Last Update
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">
              {state?.updated_at ? new Date(state.updated_at).toLocaleTimeString() : 'Never'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* $10M Goal Tracker */}
      <div className="mb-6">
        <GoalTracker10M 
          portfolioValue={state?.portfolio_value || state?.balance || 0}
          dailyProfit={state?.todays_profit || 0}
          winRate={state?.win_rate || 0}
        />
      </div>

      {/* Performance Chart */}
      <div className="mb-6">
        <PerformanceChart 
          trades={trades} 
          currentState={state ? {
            balance: state.balance,
            portfolio_value: state.portfolio_value,
            todays_profit: state.todays_profit,
            win_rate: state.win_rate,
          } : null} 
        />
      </div>

      {/* Positions Tracker */}
      <div className="mb-6">
        <PositionsTracker userId={user?.id || null} />
      </div>

      {/* Crypto Market Grid */}
      <div className="mb-6">
        <CryptoMarketGrid />
      </div>

      {/* Control Buttons */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <button
          onClick={handleTestRealTrade}
          disabled={tradingLoading}
          className="p-4 rounded-lg border-2 border-primary bg-primary/10 hover:bg-primary/20 text-primary font-semibold transition-all disabled:opacity-50"
        >
          <Zap className="h-5 w-5 mx-auto mb-1" />
          {tradingLoading ? 'Trading...' : 'Test Trade $1'}
        </button>

        <button
          onClick={toggleSwarm}
          className={`p-4 rounded-lg border-2 font-semibold transition-all ${
            state?.swarm_active 
              ? 'border-green-600 bg-green-50 text-green-700' 
              : 'border-border bg-background hover:bg-muted'
          }`}
        >
          <Activity className="h-5 w-5 mx-auto mb-1" />
          Swarm {state?.swarm_active ? 'ON' : 'OFF'}
        </button>

        <button
          onClick={toggleAutonomy}
          className={`p-4 rounded-lg border-2 font-semibold transition-all ${
            state?.autonomy_mode 
              ? 'border-green-600 bg-green-50 text-green-700' 
              : 'border-border bg-background hover:bg-muted'
          }`}
        >
          <Target className="h-5 w-5 mx-auto mb-1" />
          Autonomy {state?.autonomy_mode ? 'ON' : 'OFF'}
        </button>

        <button
          onClick={() => navigate('/council')}
          className="p-4 rounded-lg border-2 border-border bg-background hover:bg-muted font-semibold transition-all"
        >
          <Users className="h-5 w-5 mx-auto mb-1" />
          AI Council
        </button>

        <button
          onClick={() => navigate('/withdraw')}
          className="p-4 rounded-lg border-2 border-border bg-background hover:bg-muted font-semibold transition-all"
        >
          <ArrowDownCircle className="h-5 w-5 mx-auto mb-1" />
          Withdraw
        </button>
      </div>

      {/* Additional Actions */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          onClick={() => navigate('/bank')}
          className="p-4 rounded-lg border-2 border-border bg-background hover:bg-muted font-semibold transition-all"
        >
          <Landmark className="h-5 w-5 mx-auto mb-1" />
          Banking (Plaid)
        </button>

        <button
          onClick={() => navigate('/settings')}
          className="p-4 rounded-lg border-2 border-border bg-background hover:bg-muted font-semibold transition-all"
        >
          <Settings className="h-5 w-5 mx-auto mb-1" />
          Settings
        </button>
      </div>

      {/* Recent Trades */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Trades
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {trades.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No trades yet. Enable the swarm to start trading.
              </p>
            ) : (
              trades.map((trade) => (
                <div 
                  key={trade.id} 
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <span className="text-sm font-medium">{trade.message}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(trade.created_at).toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
