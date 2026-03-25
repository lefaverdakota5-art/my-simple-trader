import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePortfolioSnapshot } from "@/hooks/usePortfolioSnapshot";
import { useBotConfig } from "@/hooks/useBotConfig";
import { useTradeIntents } from "@/hooks/useTradeIntents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BotOnOffSwitch } from "@/components/BotOnOffSwitch";
import {
  ArrowLeft,
  RefreshCw,
  Home,
  History,
  Activity,
  Clock,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Timer,
  Cpu,
  Loader2,
} from "lucide-react";

export default function BotMonitor() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { snapshot, loading: snapshotLoading, refresh, isLive } = usePortfolioSnapshot(
    user?.id ?? null,
    { autoRefreshMs: 10000, showNotifications: false }
  );
  const { config, loading: configLoading, toggleKillSwitch, saving } = useBotConfig(user?.id ?? null);
  const { intents, loading: intentsLoading } = useTradeIntents(user?.id ?? null);

  const formatMoney = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value ?? 0);

  const loading = snapshotLoading || configLoading;
  const health = snapshot?.health;
  const balance = snapshot?.balance;
  const botsOn = config && !config.kill_switch;

  const pendingIntents = intents.filter((i) => i.status === "pending");
  const executingIntents = intents.filter((i) => ["approved", "executing"].includes(i.status));

  const recentAlerts = intents
    .filter((i) => ["executed", "failed", "denied", "cancelled"].includes(i.status))
    .slice(0, 10);

  // Uptime display (we can estimate from last_tick_at if executor is online)
  const lastTickAt = health?.last_tick_at ? new Date(health.last_tick_at) : null;
  const lastTickAgo = lastTickAt ? Math.round((Date.now() - lastTickAt.getTime()) / 1000) : null;

  if (!user) {
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Please log in to view the bot monitor.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Bot Monitor</h1>
            <p className="text-sm text-muted-foreground">Real-time bot health & activity</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refresh(false)}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-1">Refresh</span>
        </Button>
      </div>

      {/* Quick Links */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" asChild>
          <Link to="/dashboard"><Home className="h-4 w-4 mr-1" />Dashboard</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/trade-history"><History className="h-4 w-4 mr-1" />Trade History</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/live-activity"><Activity className="h-4 w-4 mr-1" />Live Activity</Link>
        </Button>
      </div>

      {/* Bot ON/OFF */}
      <BotOnOffSwitch isOn={botsOn ?? false} onToggle={toggleKillSwitch} disabled={saving} />

      {/* Status Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={isLive ? "border-green-300 bg-green-50 dark:bg-green-950" : "border-red-300 bg-red-50 dark:bg-red-950"}>
          <CardContent className="p-4 text-center">
            {isLive ? (
              <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-1" />
            ) : (
              <XCircle className="h-8 w-8 text-red-600 mx-auto mb-1" />
            )}
            <p className={`text-sm font-bold ${isLive ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
              {isLive ? "ONLINE" : "OFFLINE"}
            </p>
            <p className="text-xs text-muted-foreground">Executor Status</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <Cpu className="h-8 w-8 text-muted-foreground mx-auto mb-1" />
            <p className="text-sm font-bold capitalize">{config?.mode ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Mode</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <Timer className="h-8 w-8 text-muted-foreground mx-auto mb-1" />
            <p className="text-sm font-bold">
              {lastTickAgo !== null ? (lastTickAgo < 60 ? `${lastTickAgo}s ago` : `${Math.round(lastTickAgo / 60)}m ago`) : "Never"}
            </p>
            <p className="text-xs text-muted-foreground">Last Tick</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <Zap className="h-8 w-8 text-muted-foreground mx-auto mb-1" />
            <p className="text-sm font-bold">{balance?.open_orders_count ?? 0}</p>
            <p className="text-xs text-muted-foreground">Open Orders</p>
          </CardContent>
        </Card>
      </div>

      {/* Current Cycle */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Current Cycle
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="p-3 border rounded-lg text-center">
              <p className="text-2xl font-bold text-yellow-600">{pendingIntents.length}</p>
              <p className="text-sm text-muted-foreground">Pending Decisions</p>
            </div>
            <div className="p-3 border rounded-lg text-center">
              <p className="text-2xl font-bold text-blue-600">{executingIntents.length}</p>
              <p className="text-sm text-muted-foreground">Executing Trades</p>
            </div>
            <div className="p-3 border rounded-lg text-center">
              <p className="text-2xl font-bold">{intents.filter((i) => i.status === "executed").length}</p>
              <p className="text-sm text-muted-foreground">Executed Total</p>
            </div>
          </div>

          {loading ? null : (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Executor Online:</span>
                  <Badge variant={health?.executor_online ? "default" : "destructive"}>
                    {health?.executor_online ? "Yes" : "No"}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kill Switch:</span>
                  <Badge variant={config?.kill_switch ? "destructive" : "default"}>
                    {config?.kill_switch ? "ON (paused)" : "OFF (active)"}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Trade Size:</span>
                  <span>{config?.trade_size_pct ?? 0}% of balance</span>
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Balance:</span>
                  <span className="font-medium">{formatMoney(balance?.total_usd ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Available:</span>
                  <span className="text-green-600">{formatMoney(balance?.available_usd ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Last Sync:</span>
                  <span className="text-xs">
                    {health?.last_balance_sync_at
                      ? new Date(health.last_balance_sync_at).toLocaleTimeString()
                      : "Never"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {health?.kraken_error_count_15m && health.kraken_error_count_15m > 0 ? (
            <div className="mt-3 p-2 rounded-lg bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Kraken errors in last 15m: {health.kraken_error_count_15m}
            </div>
          ) : null}

          {health?.last_error ? (
            <div className="mt-2 p-2 rounded-lg bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 text-xs flex items-start gap-2">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              <span className="truncate">Last error: {health.last_error}</span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Alerts & Notifications */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {intentsLoading ? (
            <div className="text-center py-6">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          ) : recentAlerts.length === 0 ? (
            <div className="text-center py-6">
              <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-2 opacity-50" />
              <p className="text-muted-foreground text-sm">No recent alerts</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentAlerts.map((intent) => (
                <div
                  key={intent.id}
                  className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/intents/${intent.id}`)}
                >
                  <div className="shrink-0">
                    {intent.status === "executed" ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : intent.status === "failed" ? (
                      <AlertTriangle className="h-5 w-5 text-red-500" />
                    ) : intent.status === "denied" ? (
                      <XCircle className="h-5 w-5 text-red-400" />
                    ) : (
                      <XCircle className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {intent.status === "executed"
                        ? `✅ Trade executed: ${intent.side.toUpperCase()} ${intent.notional_usd ? formatMoney(intent.notional_usd) : ""} ${intent.symbol}`
                        : intent.status === "failed"
                        ? `❌ Trade failed: ${intent.side.toUpperCase()} ${intent.symbol}`
                        : intent.status === "denied"
                        ? `⛔ Trade denied: ${intent.side.toUpperCase()} ${intent.symbol}`
                        : `🚫 Trade cancelled: ${intent.side.toUpperCase()} ${intent.symbol}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {intent.executed_at
                        ? new Date(intent.executed_at).toLocaleString()
                        : new Date(intent.updated_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trade Pairs being watched */}
      {config?.pairs && config.pairs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Watched Pairs ({config.pairs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {config.pairs.map((pair) => (
                <Badge key={pair} variant="secondary" className="text-sm">
                  {pair}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
