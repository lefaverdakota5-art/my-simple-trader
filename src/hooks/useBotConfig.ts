import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface BotConfigData {
  id: string;
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
  updated_at: string | null;
}

const DEFAULT_CONFIG: Omit<BotConfigData, 'id' | 'user_id' | 'updated_at'> = {
  kill_switch: true,
  mode: 'paused',
  trade_size_pct: 2,
  max_orders_per_tick: 2,
  take_profit_pct: 0.5,
  stop_loss_pct: 1,
  cooldown_seconds: 60,
  max_daily_loss_pct: 10,
  max_exposure_per_asset_pct: 25,
  keep_usd_reserve: 0.01,
  sell_target_usd: 0,
  pairs: ['XBT/USD', 'ETH/USD', 'DOGE/USD'],
};

export function useBotConfig(userId: string | null) {
  const [config, setConfig] = useState<BotConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    if (!userId) return;
    
    try {
      const { data, error } = await supabase
        .from('bot_config')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching bot config:', error);
        return;
      }
      
      if (data) {
        setConfig(data as BotConfigData);
      } else {
        // Create default config
        const { data: newConfig, error: insertError } = await supabase
          .from('bot_config')
          .insert({ user_id: userId, ...DEFAULT_CONFIG })
          .select()
          .single();
        
        if (!insertError && newConfig) {
          setConfig(newConfig as BotConfigData);
        }
      }
    } catch (e) {
      console.error('Failed to fetch bot config:', e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchConfig();
    } else {
      setLoading(false);
    }
  }, [userId, fetchConfig]);

  const updateConfig = useCallback(async (updates: Partial<BotConfigData>) => {
    if (!userId || !config) return false;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('bot_config')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      
      if (error) {
        toast.error('Failed to save: ' + error.message);
        return false;
      }
      
      setConfig(prev => prev ? { ...prev, ...updates } : null);
      toast.success('Settings saved');
      return true;
    } catch (e) {
      toast.error('Failed to save settings');
      return false;
    } finally {
      setSaving(false);
    }
  }, [userId, config]);

  const toggleKillSwitch = useCallback(async () => {
    if (!config) return;
    const newValue = !config.kill_switch;
    const newMode = newValue ? 'paused' : config.mode;
    await updateConfig({ kill_switch: newValue, mode: newMode });
  }, [config, updateConfig]);

  const setMode = useCallback(async (mode: string) => {
    await updateConfig({ mode, kill_switch: mode === 'paused' });
  }, [updateConfig]);

  // Calculate aggressive reserve: max(0.01, total_usd * 0.01)
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
