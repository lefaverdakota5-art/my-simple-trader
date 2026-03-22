import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface BotConfigData {
  id?: string;
  user_id: string;
  kill_switch: boolean;
  mode: string;
  trade_size_pct: number;
  max_orders_per_tick: number;
  take_profit_pct: number;
  stop_loss_pct: number;
  cooldown_seconds: number;
  max_daily_loss_pct: number;
  max_exposure_per_asset_pct: number;
  keep_usd_reserve: number;
  sell_target_usd: number;
  pairs: string[];
  voting_enabled: boolean;
  auto_approve_enabled: boolean;
  dry_run: boolean;
  max_notional_per_order_usd: number;
  max_open_orders: number;
  updated_at: string | null;
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('No active session');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function functionsBaseUrl() {
  return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
}

export function useBotConfigEdge(userId: string | null) {
  const [config, setConfig] = useState<BotConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${functionsBaseUrl()}/api-bot-config`, {
        headers: await authHeaders(),
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch bot config (${response.status})`);
      }
      const data = await response.json();
      setConfig(data.config as BotConfigData);
    } catch (error) {
      console.error('Failed to fetch bot config:', error);
      toast.error('Failed to load trading settings');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const updateConfig = useCallback(async (updates: Partial<BotConfigData>) => {
    if (!userId || !config) return false;

    setSaving(true);
    try {
      const response = await fetch(`${functionsBaseUrl()}/api-bot-config`, {
        method: 'PUT',
        headers: await authHeaders(),
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        throw new Error(`Failed to update bot config (${response.status})`);
      }
      const data = await response.json();
      setConfig(data.config as BotConfigData);
      toast.success('Settings saved');
      return true;
    } catch (error) {
      console.error('Failed to save bot config:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save settings');
      return false;
    } finally {
      setSaving(false);
    }
  }, [userId, config]);

  const toggleKillSwitch = useCallback(async () => {
    if (!config) return;
    const nextKillSwitch = !config.kill_switch;
    const nextMode = nextKillSwitch ? 'paused' : config.mode;
    await updateConfig({ kill_switch: nextKillSwitch, mode: nextMode });
  }, [config, updateConfig]);

  const setMode = useCallback(async (mode: string) => {
    await updateConfig({ mode, kill_switch: mode === 'paused' });
  }, [updateConfig]);

  const calculateReserve = useCallback((totalUsd: number) => {
    return Math.max(0.01, totalUsd * 0.01);
  }, []);

  return {
    config,
    loading,
    saving,
    updateConfig,
    toggleKillSwitch,
    setMode,
    calculateReserve,
    refresh: fetchConfig,
  };
}
