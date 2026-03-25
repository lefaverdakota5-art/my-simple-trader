import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface TradeFill {
  id: string;
  pair: string;
  side: 'buy' | 'sell';
  volume: number;
  price: number;
  cost_usd: number;
  fee_usd: number | null;
  realized_pnl: number | null;
  filled_at: string;
  user_id: string;
}

export interface TradeStats {
  totalTrades: number;
  winRate: number;
  avgProfit: number;
  bestTrade: number;
  worstTrade: number;
  totalPnl: number;
  profitableTrades: number;
  lossTrades: number;
}

export function useTrades(userId: string | null) {
  const [trades, setTrades] = useState<TradeFill[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrades = useCallback(async () => {
    if (!userId) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setLoading(false);
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/trading_fills?user_id=eq.${encodeURIComponent(userId)}&select=*&order=filled_at.desc&limit=500`,
        {
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setTrades(data as TradeFill[]);
      } else {
        console.warn('Failed to fetch trades:', response.status);
      }
    } catch (e) {
      console.error('Failed to fetch trades:', e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchTrades();
    } else {
      setLoading(false);
    }
  }, [userId, fetchTrades]);

  // Realtime subscription for new fills
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('trading-fills-history')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trading_fills',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setTrades((prev) => [payload.new as TradeFill, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const stats: TradeStats = (() => {
    const closedTrades = trades.filter((t) => t.realized_pnl !== null);
    const profitable = closedTrades.filter((t) => (t.realized_pnl ?? 0) > 0);
    const loss = closedTrades.filter((t) => (t.realized_pnl ?? 0) < 0);
    const totalPnl = closedTrades.reduce((sum, t) => sum + (t.realized_pnl ?? 0), 0);
    const pnlValues = closedTrades.map((t) => t.realized_pnl ?? 0);
    return {
      totalTrades: trades.length,
      winRate: closedTrades.length > 0 ? (profitable.length / closedTrades.length) * 100 : 0,
      avgProfit: closedTrades.length > 0 ? totalPnl / closedTrades.length : 0,
      bestTrade: pnlValues.length > 0 ? Math.max(...pnlValues) : 0,
      worstTrade: pnlValues.length > 0 ? Math.min(...pnlValues) : 0,
      totalPnl,
      profitableTrades: profitable.length,
      lossTrades: loss.length,
    };
  })();

  return { trades, loading, stats, refresh: fetchTrades };
}
