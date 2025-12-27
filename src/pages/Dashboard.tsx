import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePortfolioSnapshot } from '@/hooks/usePortfolioSnapshot';
import { useBotConfig } from '@/hooks/useBotConfig';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LiveStatusDot } from '@/components/LiveStatusDot';
import { HoldingsList } from '@/components/HoldingsList';
import { OrdersList } from '@/components/OrdersList';
import { FillsList } from '@/components/FillsList';
import { KrakenLinks } from '@/components/KrakenLinks';
import { BotOnOffSwitch } from '@/components/BotOnOffSwitch';
import { toast } from "sonner";
import { 
  Wallet, 
  Activity, 
  Settings,
  LogOut,
  ArrowDownCircle,
  RefreshCw,
  AlertTriangle,
  Clock
} from "lucide-react";

export default function Dashboard() {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  
  const { 
    snapshot, 
    loading: snapshotLoading, 
    refresh, 
    isLive, 
    lastRefresh 
  } = usePortfolioSnapshot(user?.id || null, { autoRefreshMs: 15000 });
  
  const { 
    config, 
    loading: configLoading, 
    toggleKillSwitch,
    saving 
  } = useBotConfig(user?.id || null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  if (authLoading || snapshotLoading || configLoading) {
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

  const handleSyncNow = async () => {
    toast.info('Syncing...');
    await refresh(true);
    toast.success('Portfolio synced');
  };

  const balance = snapshot?.balance;
  const health = snapshot?.health;
  const botsOn = config && !config.kill_switch;

  // Warnings
  const warnings: string[] = [];
  if (!health?.executor_online) warnings.push('Executor offline');
  if ((health?.kraken_error_count_15m || 0) > 3) warnings.push('Kraken errors detected');
  if (config?.kill_switch) warnings.push('Bots paused');

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl md:text-3xl font-bold">Trading Dashboard</h1>
          <LiveStatusDot isLive={isLive} />
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSyncNow}
            className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
            title="Sync Now"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
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

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800">
          <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-medium">Warnings:</span>
            {warnings.map((w, i) => (
              <Badge key={i} variant="outline" className="text-yellow-700 border-yellow-300">
                {w}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Bot ON/OFF Switch */}
      <div className="mb-6">
        <BotOnOffSwitch 
          isOn={botsOn || false}
          onToggle={toggleKillSwitch}
          disabled={saving}
        />
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="border-2 border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-primary flex items-center gap-2">
              <Wallet className="h-4 w-4" />
              Total USD
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatMoney(balance?.total_usd || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Available
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-green-600">
              {formatMoney(balance?.available_usd || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Reserved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-orange-600">
              {formatMoney(balance?.reserved_usd || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Open Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">
              {balance?.open_orders_count || 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Bot Status */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Bot Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Mode:</span>
              <Badge className="ml-2" variant={config?.mode === 'paused' ? 'secondary' : 'default'}>
                {config?.mode || 'Unknown'}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Executor:</span>
              <Badge className="ml-2" variant={health?.executor_online ? 'default' : 'destructive'}>
                {health?.executor_online ? 'Online' : 'Offline'}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Last Tick:</span>
              <span className="text-xs">
                {health?.last_tick_at ? new Date(health.last_tick_at).toLocaleTimeString() : 'Never'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Last Sync:</span>
              <span className="text-xs">
                {health?.last_balance_sync_at ? new Date(health.last_balance_sync_at).toLocaleTimeString() : 'Never'}
              </span>
            </div>
          </div>
          {health?.kraken_error_count_15m && health.kraken_error_count_15m > 0 && (
            <div className="mt-2 text-sm text-red-600">
              Kraken errors (15m): {health.kraken_error_count_15m}
            </div>
          )}
          {health?.last_error && (
            <div className="mt-2 text-xs text-red-500 truncate">
              Last error: {health.last_error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div className="mb-6">
        <KrakenLinks />
      </div>

      {/* Holdings */}
      <div className="mb-6">
        <HoldingsList holdings={balance?.holdings || {}} />
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <button
          onClick={() => navigate('/intents')}
          className="p-4 rounded-lg border-2 border-primary bg-primary/10 hover:bg-primary/20 font-semibold transition-all text-primary"
        >
          <Activity className="h-5 w-5 mx-auto mb-1" />
          Trade Intents
        </button>
        <button
          onClick={() => navigate('/bot-settings')}
          className="p-4 rounded-lg border-2 border-border bg-background hover:bg-muted font-semibold transition-all"
        >
          <Settings className="h-5 w-5 mx-auto mb-1" />
          Bot Settings
        </button>
        <button
          onClick={() => navigate('/cashout')}
          className="p-4 rounded-lg border-2 border-orange-500 bg-orange-50 dark:bg-orange-950 text-orange-600 font-semibold transition-all hover:bg-orange-100"
        >
          <ArrowDownCircle className="h-5 w-5 mx-auto mb-1" />
          Cash Out
        </button>
        <button
          onClick={() => navigate('/withdraw')}
          className="p-4 rounded-lg border-2 border-border bg-background hover:bg-muted font-semibold transition-all"
        >
          <Wallet className="h-5 w-5 mx-auto mb-1" />
          Banking
        </button>
      </div>

      {/* Orders & Fills */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <OrdersList orders={snapshot?.open_orders || []} />
        <FillsList fills={snapshot?.recent_fills || []} />
      </div>

      {/* Last Refresh */}
      {lastRefresh && (
        <div className="text-center text-xs text-muted-foreground">
          Last updated: {lastRefresh.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}
