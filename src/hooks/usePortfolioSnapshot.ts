import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface BalanceSnapshot {
  total_usd: number;
  available_usd: number;
  reserved_usd: number;
  holdings: Record<string, { quantity: number; usd_value: number }>;
  open_orders_count: number;
  snapshot_at: string | null;
}

export interface BotConfig {
  kill_switch: boolean;
  mode: string;
  trade_size_pct: number;
  max_orders_per_tick: number;
  take_profit_pct: number;
  stop_loss_pct: number;
  keep_usd_reserve: number;
  sell_target_usd: number;
  pairs: string[];
  updated_at: string | null;
}

export interface SystemHealth {
  executor_online: boolean;
  last_tick_at: string | null;
  last_exec_at: string | null;
  last_balance_sync_at: string | null;
  kraken_error_count_15m: number;
  last_error: string | null;
}

export interface OpenOrder {
  id: string;
  pair: string;
  side: string;
  order_type: string;
  status: string;
  volume: number;
  price: number | null;
  cost_usd: number | null;
  created_at: string;
}

export interface RecentFill {
  id: string;
  pair: string;
  side: string;
  volume: number;
  price: number;
  cost_usd: number;
  fee_usd: number | null;
  realized_pnl: number | null;
  filled_at: string;
}

export interface PortfolioSnapshot {
  balance: BalanceSnapshot;
  bot: BotConfig;
  health: SystemHealth;
  open_orders: OpenOrder[];
  recent_fills: RecentFill[];
}

interface UsePortfolioSnapshotOptions {
  autoRefreshMs?: number;
  showNotifications?: boolean;
}

export function usePortfolioSnapshot(
  userId: string | null,
  options: UsePortfolioSnapshotOptions = {}
) {
  const { autoRefreshMs = 15000, showNotifications = true } = options;
  
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchSnapshot = useCallback(async (showLoadingToast = false) => {
    if (!userId) return;
    
    if (showLoadingToast && showNotifications) {
      toast.info('Syncing portfolio...');
    }
    
    try {
      const { data, error: rpcError } = await supabase.rpc('get_portfolio_snapshot', {
        p_user_id: userId
      });
      
      if (rpcError) {
        console.error('Portfolio snapshot error:', rpcError);
        setError(rpcError.message);
        return;
      }
      
      if (data) {
        setSnapshot(data as unknown as PortfolioSnapshot);
        setError(null);
        setLastRefresh(new Date());
      }
    } catch (e) {
      console.error('Failed to fetch portfolio snapshot:', e);
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [userId, showNotifications]);

  // Initial fetch
  useEffect(() => {
    if (userId) {
      fetchSnapshot();
    } else {
      setLoading(false);
    }
  }, [userId, fetchSnapshot]);

  // Auto-refresh
  useEffect(() => {
    if (!userId || autoRefreshMs <= 0) return;
    
    const interval = setInterval(() => {
      fetchSnapshot();
    }, autoRefreshMs);
    
    return () => clearInterval(interval);
  }, [userId, autoRefreshMs, fetchSnapshot]);

  // Subscribe to realtime updates for orders and fills
  useEffect(() => {
    if (!userId) return;

    const ordersChannel = supabase
      .channel('trading-orders-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trading_orders',
          filter: `user_id=eq.${userId}`
        },
        () => {
          // Refresh on order changes
          fetchSnapshot();
        }
      )
      .subscribe();

    const fillsChannel = supabase
      .channel('trading-fills-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trading_fills',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          // Refresh on new fills
          fetchSnapshot();
          
          if (showNotifications && payload.new) {
            const fill = payload.new as RecentFill;
            const pnlStr = fill.realized_pnl 
              ? ` (P&L: ${fill.realized_pnl >= 0 ? '+' : ''}$${fill.realized_pnl.toFixed(2)})`
              : '';
            toast.success(`${fill.side.toUpperCase()} ${fill.volume} ${fill.pair} @ $${fill.price.toFixed(2)}${pnlStr}`);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(fillsChannel);
    };
  }, [userId, fetchSnapshot, showNotifications]);

  // Check if system is live (healthy)
  const isLive = useCallback(() => {
    if (!snapshot?.health) return false;
    
    const { executor_online, last_tick_at, last_balance_sync_at } = snapshot.health;
    
    if (!executor_online) return false;
    
    const now = Date.now();
    const twoMinutes = 2 * 60 * 1000;
    
    const tickOk = last_tick_at 
      ? (now - new Date(last_tick_at).getTime()) < twoMinutes 
      : false;
    
    const syncOk = last_balance_sync_at 
      ? (now - new Date(last_balance_sync_at).getTime()) < twoMinutes 
      : false;
    
    return tickOk && syncOk;
  }, [snapshot]);

  return {
    snapshot,
    loading,
    error,
    lastRefresh,
    refresh: fetchSnapshot,
    isLive: isLive(),
  };
}
