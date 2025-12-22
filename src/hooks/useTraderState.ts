import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useNotificationSound } from '@/hooks/useNotificationSound';

interface TraderState {
  id: string;
  balance: number;
  todays_profit: number;
  swarm_active: boolean;
  portfolio_value: number;
  progress_percent: number;
  win_rate: number;
  council_votes: string;
  council_reasons: string[];
  autonomy_mode: boolean;
  withdraw_status: string;
  updated_at: string;
}

interface Trade {
  id: string;
  message: string;
  created_at: string;
}

interface UseTraderStateOptions {
  showNotifications?: boolean;
}

export function useTraderState(userId: string | null, options: UseTraderStateOptions = { showNotifications: true }) {
  const [state, setState] = useState<TraderState | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [krakenBalance, setKrakenBalance] = useState<number | null>(null);
  const [loadingKraken, setLoadingKraken] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);
  const { playNotificationSound } = useNotificationSound();

  // Fetch real Kraken balance with rate limiting
  const fetchKrakenBalance = useCallback(async (force = false) => {
    if (!userId) return;
    
    // Rate limit: don't fetch more than once per 20 seconds unless forced
    const now = Date.now();
    if (!force && hasFetchedOnce && now - lastFetchTime < 20000) {
      console.log('Skipping Kraken fetch - rate limited');
      return;
    }
    
    if (loadingKraken) return; // Prevent concurrent requests
    setLoadingKraken(true);
    setLastFetchTime(now);
    
    // Add timeout to prevent stuck loading state
    const timeout = setTimeout(() => {
      console.log('Kraken balance fetch timed out');
      setLoadingKraken(false);
    }, 12000);
    
    try {
      console.log('Fetching Kraken balance...');
      const { data, error } = await supabase.functions.invoke('kraken-withdraw', {
        body: { action: 'get_balance' }
      });
      clearTimeout(timeout);
      setHasFetchedOnce(true);
      
      console.log('Kraken response:', data, error);
      
      if (error) {
        console.error('Kraken balance error:', error);
        // On error, immediately show cached balance from DB
        const { data: cached } = await supabase
          .from('trader_state')
          .select('balance')
          .eq('user_id', userId)
          .maybeSingle();
        if (cached?.balance !== undefined) {
          setKrakenBalance(cached.balance);
          console.log('Using DB cached balance:', cached.balance);
        }
      } else if (data?.success) {
        const bal = data.balance ?? 0;
        setKrakenBalance(bal);
        setState(prev => prev ? { ...prev, balance: bal } : prev);
        console.log('Kraken balance set:', bal, data.cached ? '(cached)' : '(fresh)');
      } else if (data?.error) {
        console.error('Kraken API error:', data.error);
        // Fallback to DB
        const { data: cached } = await supabase
          .from('trader_state')
          .select('balance')
          .eq('user_id', userId)
          .maybeSingle();
        if (cached?.balance !== undefined) {
          setKrakenBalance(cached.balance);
        }
      }
    } catch (e) {
      console.error('Failed to fetch Kraken balance:', e);
      clearTimeout(timeout);
      // Fallback to DB
      const { data: cached } = await supabase
        .from('trader_state')
        .select('balance')
        .eq('user_id', userId)
        .maybeSingle();
      if (cached?.balance !== undefined) {
        setKrakenBalance(cached.balance);
      }
    } finally {
      setLoadingKraken(false);
    }
  }, [userId, loadingKraken, lastFetchTime, hasFetchedOnce]);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    // Fetch initial state - IMMEDIATELY set balance from DB first
    const fetchState = async () => {
      const { data, error } = await supabase
        .from('trader_state')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching trader state:', error);
      } else if (data) {
        const traderData = data as unknown as TraderState;
        setState(traderData);
        // IMMEDIATELY set kraken balance from DB - this is the cached value
        setKrakenBalance(traderData.balance);
        console.log('Initial balance from DB:', traderData.balance);
      }
      setLoading(false);
    };

    // Fetch trades
    const fetchTrades = async () => {
      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching trades:', error);
      } else {
        setTrades(data || []);
      }
    };

    // First load DB state immediately, then try to refresh from Kraken
    fetchState().then(() => {
      // Small delay to avoid Kraken rate limits
      setTimeout(() => {
        fetchKrakenBalance();
      }, 2000);
    });
    fetchTrades();

    // Subscribe to realtime updates for trader_state
    const stateChannel = supabase
      .channel('trader-state-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trader_state',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('Trader state updated:', payload);
          if (payload.new) {
            setState(payload.new as unknown as TraderState);
          }
        }
      )
      .subscribe();

    // Subscribe to realtime updates for trades
    const tradesChannel = supabase
      .channel('trades-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trades',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          console.log('New trade:', payload);
          if (payload.new) {
            const newTrade = payload.new as Trade;
            setTrades(prev => [newTrade, ...prev].slice(0, 50));
            
            // Show toast notification for new trades
            if (options.showNotifications) {
              const soundEnabled = localStorage.getItem("notificationSoundEnabled") !== "false";
              if (soundEnabled) {
                const volume = parseFloat(localStorage.getItem("notificationSoundVolume") || "0.5");
                playNotificationSound(volume);
              }
              toast({
                title: "New Trade",
                description: newTrade.message,
                duration: 5000,
              });
            }
            
            // Refresh Kraken balance after a trade
            fetchKrakenBalance();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(stateChannel);
      supabase.removeChannel(tradesChannel);
    };
  }, [userId, options.showNotifications, playNotificationSound, fetchKrakenBalance]);

  const toggleSwarm = async () => {
    if (!userId || !state) return;
    
    const { error } = await supabase
      .from('trader_state')
      .update({ swarm_active: !state.swarm_active })
      .eq('user_id', userId);

    if (error) {
      console.error('Error toggling swarm:', error);
    }
  };

  const toggleAutonomy = async () => {
    if (!userId || !state) return;

    // Optimistic UI update
    const next = !state.autonomy_mode;
    setState((prev) => (prev ? { ...prev, autonomy_mode: next } : prev));

    const { error } = await supabase
      .from('trader_state')
      .update({ autonomy_mode: next })
      .eq('user_id', userId);

    if (error) {
      console.error('Error toggling autonomy mode:', error);
      // Revert optimistic update on failure
      setState((prev) => (prev ? { ...prev, autonomy_mode: !next } : prev));
    }
  };

  return { 
    state, 
    trades, 
    loading, 
    toggleSwarm, 
    toggleAutonomy,
    krakenBalance,
    loadingKraken,
    refreshKrakenBalance: fetchKrakenBalance
  };
}
