import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useBotConfig } from '@/hooks/useBotConfig';
import { usePortfolioSnapshot } from '@/hooks/usePortfolioSnapshot';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Settings, Save, AlertTriangle, X, Plus } from "lucide-react";
import { toast } from "sonner";

// USD-only pair validation
const isValidPair = (pair: string) => /^[A-Z0-9]+x?\/USD$/.test(pair);

export default function BotSettings() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  
  const { config, loading, saving, updateConfig } = useBotConfig(user?.id || null);
  const { snapshot } = usePortfolioSnapshot(user?.id || null, { autoRefreshMs: 0 });
  
  const [localConfig, setLocalConfig] = useState<typeof config>(null);
  const [newPair, setNewPair] = useState('');
  const [reserveOverride, setReserveOverride] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate('/');
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (config) setLocalConfig(config);
  }, [config]);

  if (authLoading || loading || !localConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-foreground"></div>
      </div>
    );
  }

  const totalUsd = snapshot?.balance?.total_usd || 0;
  const calculatedReserve = Math.max(0.01, totalUsd * 0.01);

  const handleSave = async () => {
    // Validate pairs
    const invalidPairs = localConfig.pairs.filter(p => !isValidPair(p));
    if (invalidPairs.length > 0) {
      toast.error(`Invalid pairs (must be USD): ${invalidPairs.join(', ')}`);
      return;
    }

    const finalReserve = reserveOverride ? localConfig.keep_usd_reserve : calculatedReserve;
    
    await updateConfig({
      ...localConfig,
      keep_usd_reserve: finalReserve,
    });
  };

  const handleAddPair = () => {
    const pair = newPair.toUpperCase().trim();
    if (!pair) return;
    
    if (!isValidPair(pair)) {
      toast.error('Pair must be in format SYMBOL/USD (e.g., XBT/USD)');
      return;
    }
    
    if (localConfig.pairs.includes(pair)) {
      toast.error('Pair already exists');
      return;
    }
    
    setLocalConfig({ ...localConfig, pairs: [...localConfig.pairs, pair] });
    setNewPair('');
  };

  const handleRemovePair = (pair: string) => {
    setLocalConfig({ ...localConfig, pairs: localConfig.pairs.filter(p => p !== pair) });
  };

  const modes = [
    { value: 'paused', label: 'Paused', desc: 'No trading' },
    { value: 'aggressive_a', label: 'Aggressive A', desc: 'High-frequency scalping' },
    { value: 'sell_to_target_usd', label: 'Sell to Target', desc: 'Selling to reach cash target' },
  ];

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/dashboard')}
          className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6" />
          Bot Settings
        </h1>
      </div>

      {/* Kill Switch */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-lg">Kill Switch</h3>
              <p className="text-sm text-muted-foreground">
                When ON, all trading is disabled
              </p>
            </div>
            <Switch
              checked={localConfig.kill_switch}
              onCheckedChange={(val) => setLocalConfig({ ...localConfig, kill_switch: val, mode: val ? 'paused' : localConfig.mode })}
            />
          </div>
          {localConfig.kill_switch && (
            <div className="mt-3 p-2 rounded bg-yellow-50 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300 text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Trading is paused
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mode Selector */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">Trading Mode</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {modes.map((mode) => (
              <button
                key={mode.value}
                onClick={() => setLocalConfig({ ...localConfig, mode: mode.value, kill_switch: mode.value === 'paused' })}
                className={`p-3 rounded-lg border-2 text-left transition-colors ${
                  localConfig.mode === mode.value 
                    ? 'border-primary bg-primary/10' 
                    : 'border-border hover:bg-muted'
                }`}
              >
                <div className="font-medium">{mode.label}</div>
                <div className="text-sm text-muted-foreground">{mode.desc}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Trading Parameters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">Trading Parameters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Trade Size %</label>
              <input
                type="number"
                min="0.1"
                max="100"
                step="0.1"
                value={localConfig.trade_size_pct}
                onChange={(e) => setLocalConfig({ ...localConfig, trade_size_pct: parseFloat(e.target.value) || 2 })}
                className="w-full mt-1 p-2 rounded border border-border bg-background"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Max Orders/Tick</label>
              <input
                type="number"
                min="1"
                max="10"
                value={localConfig.max_orders_per_tick}
                onChange={(e) => setLocalConfig({ ...localConfig, max_orders_per_tick: parseInt(e.target.value) || 2 })}
                className="w-full mt-1 p-2 rounded border border-border bg-background"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Take Profit %</label>
              <input
                type="number"
                min="0.1"
                max="100"
                step="0.1"
                value={localConfig.take_profit_pct}
                onChange={(e) => setLocalConfig({ ...localConfig, take_profit_pct: parseFloat(e.target.value) || 0.5 })}
                className="w-full mt-1 p-2 rounded border border-border bg-background"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Stop Loss %</label>
              <input
                type="number"
                min="0.1"
                max="100"
                step="0.1"
                value={localConfig.stop_loss_pct}
                onChange={(e) => setLocalConfig({ ...localConfig, stop_loss_pct: parseFloat(e.target.value) || 1 })}
                className="w-full mt-1 p-2 rounded border border-border bg-background"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Cooldown (seconds)</label>
              <input
                type="number"
                min="1"
                max="3600"
                value={localConfig.cooldown_seconds}
                onChange={(e) => setLocalConfig({ ...localConfig, cooldown_seconds: parseInt(e.target.value) || 60 })}
                className="w-full mt-1 p-2 rounded border border-border bg-background"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Max Daily Loss %</label>
              <input
                type="number"
                min="1"
                max="100"
                value={localConfig.max_daily_loss_pct}
                onChange={(e) => setLocalConfig({ ...localConfig, max_daily_loss_pct: parseFloat(e.target.value) || 10 })}
                className="w-full mt-1 p-2 rounded border border-border bg-background"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Max Exposure/Asset %</label>
              <input
                type="number"
                min="1"
                max="100"
                value={localConfig.max_exposure_per_asset_pct}
                onChange={(e) => setLocalConfig({ ...localConfig, max_exposure_per_asset_pct: parseFloat(e.target.value) || 25 })}
                className="w-full mt-1 p-2 rounded border border-border bg-background"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reserve Settings */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">USD Reserve</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Aggressive reserve = max(0.01, total × 1%)
          </p>
          <div className="p-3 rounded bg-muted mb-3">
            <div className="flex justify-between">
              <span>Calculated Reserve:</span>
              <span className="font-semibold">${calculatedReserve.toFixed(2)}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <Switch
              checked={reserveOverride}
              onCheckedChange={setReserveOverride}
            />
            <span className="text-sm">Override with custom value</span>
          </div>
          {reserveOverride && (
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={localConfig.keep_usd_reserve}
              onChange={(e) => setLocalConfig({ ...localConfig, keep_usd_reserve: parseFloat(e.target.value) || 0.01 })}
              className="w-full p-2 rounded border border-border bg-background"
            />
          )}
        </CardContent>
      </Card>

      {/* Trading Pairs */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">Trading Pairs (USD only)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {localConfig.pairs.map((pair) => (
              <Badge key={pair} variant="secondary" className="flex items-center gap-1">
                {pair}
                <button 
                  onClick={() => handleRemovePair(pair)}
                  className="hover:text-red-500"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="XBT/USD"
              value={newPair}
              onChange={(e) => setNewPair(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleAddPair()}
              className="flex-1 p-2 rounded border border-border bg-background"
            />
            <button
              onClick={handleAddPair}
              className="p-2 rounded bg-primary text-primary-foreground"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Format: SYMBOL/USD (e.g., XBT/USD, ETH/USD, AAPLx/USD)
          </p>
        </CardContent>
      </Card>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full p-4 rounded-lg bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Save className="h-5 w-5" />
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
}
