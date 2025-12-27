import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface TradeIntent {
  id: string;
  user_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  order_type: string;
  quantity: number | null;
  notional_usd: number | null;
  limit_price: number | null;
  status: 'pending' | 'approved' | 'denied' | 'executing' | 'executed' | 'failed' | 'cancelled';
  approve_threshold: number;
  approve_votes: number;
  deny_votes: number;
  created_by: 'user' | 'bot' | 'system';
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  executed_at: string | null;
}

export interface IntentVote {
  id: string;
  intent_id: string;
  user_id: string;
  vote: 'approve' | 'deny';
  confidence: number | null;
  rationale: string | null;
  voter_type: string | null;
  created_at: string;
}

export function useTradeIntents(userId: string | null) {
  const [intents, setIntents] = useState<TradeIntent[]>([]);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState<string | null>(null);

  const fetchIntents = useCallback(async () => {
    if (!userId) return;
    
    try {
      // Get session for auth header
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      
      if (!accessToken) {
        console.log('No access token available');
        setLoading(false);
        return;
      }
      
      // Query the trading schema via REST API
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/trade_intents?user_id=eq.${userId}&select=*&order=created_at.desc`,
        {
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );
      
      if (response.ok) {
        const intentsData = await response.json();
        setIntents(intentsData as TradeIntent[]);
      } else {
        console.log('Failed to fetch intents:', response.status);
      }
    } catch (e) {
      console.error('Failed to fetch intents:', e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchIntents();
    } else {
      setLoading(false);
    }
  }, [userId, fetchIntents]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('trade-intents-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'trading',
          table: 'trade_intents',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchIntents();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchIntents]);

  const castVote = useCallback(async (intentId: string, vote: 'approve' | 'deny', confidence: number = 1, rationale?: string) => {
    if (!userId) return false;
    
    setVoting(intentId);
    try {
      // Insert vote into trading.trade_intent_votes
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/trade_intent_votes`,
        {
          method: 'POST',
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            intent_id: intentId,
            user_id: userId,
            vote,
            confidence,
            rationale,
            voter_type: 'user',
          }),
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to cast vote');
      }
      
      toast.success(`Vote ${vote === 'approve' ? 'approved' : 'denied'} recorded`);
      await fetchIntents();
      return true;
    } catch (e) {
      console.error('Failed to cast vote:', e);
      toast.error('Failed to cast vote: ' + (e instanceof Error ? e.message : 'Unknown error'));
      return false;
    } finally {
      setVoting(null);
    }
  }, [userId, fetchIntents]);

  const createIntent = useCallback(async (intent: {
    symbol: string;
    side: 'buy' | 'sell';
    order_type?: string;
    quantity?: number;
    notional_usd?: number;
    limit_price?: number;
  }) => {
    if (!userId) return null;
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/trade_intents`,
        {
          method: 'POST',
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({
            user_id: userId,
            symbol: intent.symbol,
            side: intent.side,
            order_type: intent.order_type || 'market',
            quantity: intent.quantity,
            notional_usd: intent.notional_usd,
            limit_price: intent.limit_price,
            created_by: 'user',
          }),
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create intent');
      }
      
      const data = await response.json();
      toast.success('Trade intent created');
      await fetchIntents();
      return data[0] as TradeIntent;
    } catch (e) {
      console.error('Failed to create intent:', e);
      toast.error('Failed to create intent: ' + (e instanceof Error ? e.message : 'Unknown error'));
      return null;
    }
  }, [userId, fetchIntents]);

  const cancelIntent = useCallback(async (intentId: string) => {
    if (!userId) return false;
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/trade_intents?id=eq.${intentId}&user_id=eq.${userId}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ status: 'cancelled' }),
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to cancel intent');
      }
      
      toast.success('Intent cancelled');
      await fetchIntents();
      return true;
    } catch (e) {
      console.error('Failed to cancel intent:', e);
      toast.error('Failed to cancel intent');
      return false;
    }
  }, [userId, fetchIntents]);

  return {
    intents,
    loading,
    voting,
    castVote,
    createIntent,
    cancelIntent,
    refresh: fetchIntents,
  };
}
