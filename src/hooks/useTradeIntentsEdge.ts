import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface TradeIntentEdge {
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

export function useTradeIntentsEdge(userId: string | null) {
  const [intents, setIntents] = useState<TradeIntentEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const fetchIntents = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(`${functionsBaseUrl()}/api-intents`, {
        headers: await authHeaders(),
      });
      if (!response.ok) throw new Error(`Failed to fetch intents (${response.status})`);
      const data = await response.json();
      setIntents((data.intents || []) as TradeIntentEdge[]);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load trade intents');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchIntents();
  }, [fetchIntents]);

  const createIntent = useCallback(async (intent: {
    symbol: string;
    side: 'buy' | 'sell';
    order_type?: string;
    quantity?: number;
    notional_usd?: number;
    limit_price?: number;
  }) => {
    if (!userId) return null;
    setCreating(true);
    try {
      const response = await fetch(`${functionsBaseUrl()}/api-intents`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify(intent),
      });
      if (!response.ok) throw new Error(`Failed to create intent (${response.status})`);
      const data = await response.json();
      toast.success('Trade intent created');
      await fetchIntents();
      return data.intent as TradeIntentEdge;
    } catch (error) {
      console.error(error);
      toast.error('Failed to create trade intent');
      return null;
    } finally {
      setCreating(false);
    }
  }, [userId, fetchIntents]);

  return {
    intents,
    loading,
    creating,
    createIntent,
    refresh: fetchIntents,
  };
}
