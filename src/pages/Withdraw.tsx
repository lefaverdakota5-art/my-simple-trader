import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTraderState } from '@/hooks/useTraderState';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { getBotApiBaseUrl, getSupabaseAccessToken } from "@/lib/botApi";

interface WithdrawalRequest {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  withdraw_type?: string;
  bank_name?: string;
}

export default function Withdraw() {
  const { user, loading: authLoading } = useAuth();
  const { state, loading: stateLoading } = useTraderState(user?.id || null);
  const navigate = useNavigate();
  const botApiBase = getBotApiBaseUrl();
  
  const [submitting, setSubmitting] = useState(false);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [krakenBalance, setKrakenBalance] = useState<number | null>(null);
  const [loadingKrakenBalance, setLoadingKrakenBalance] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  // Fetch existing withdrawal requests
  useEffect(() => {
    if (!user) return;
    
    const fetchData = async () => {
      const { data: withdrawalData } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (withdrawalData) setWithdrawals(withdrawalData);
    };

    fetchData();
  }, [user]);

  // Fetch Kraken balance
  const fetchKrakenBalance = async () => {
    if (!user) return;
    setLoadingKrakenBalance(true);
    try {
      const { data, error } = await supabase.functions.invoke('kraken-withdraw', {
        body: { action: 'get_balance' }
      });
      if (error) {
        console.error('Kraken balance error:', error);
      } else if (data?.success) {
        setKrakenBalance(data.balance);
      }
    } catch (e) {
      console.error('Failed to fetch Kraken balance:', e);
    }
    setLoadingKrakenBalance(false);
  };

  useEffect(() => {
    if (user) {
      fetchKrakenBalance();
    }
  }, [user]);

  const getAccessToken = async () => getSupabaseAccessToken();

  const handleSellToCash = async () => {
    if (!botApiBase) {
      toast({
        title: "Backend not configured",
        description: "Set VITE_BOT_API_URL so the app can reach your bot service.",
        variant: "destructive",
      });
      return;
    }
    const token = await getAccessToken();
    if (!token) return;

    setSubmitting(true);
    try {
      const r = await fetch(`${botApiBase}/actions/sell_to_cash`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: "Sell to cash failed", description: data?.error || "Unknown error", variant: "destructive" });
      } else {
        toast({ title: "Sell to cash started", description: "Check Recent Trades / broker for fills." });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || stateLoading) {
    return (
      <div className="app-container">
        <p className="big-text">Loading...</p>
      </div>
    );
  }

  const formatMoney = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value || 0);
  };

  return (
    <div className="app-container">
      <button
        className="plain-button"
        onClick={() => navigate('/dashboard')}
        style={{ marginBottom: '24px' }}
      >
        ← Back to Dashboard
      </button>

      <h1 className="big-text" style={{ marginBottom: '16px' }}>Banking</h1>
      
      {/* Balance Display */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 1fr', 
        gap: '16px', 
        marginBottom: '24px' 
      }}>
        <div style={{ 
          padding: '16px', 
          background: 'hsl(var(--muted))', 
          borderRadius: '8px',
          border: '1px solid hsl(var(--border))'
        }}>
          <p style={{ fontSize: '0.875rem', color: 'hsl(var(--muted-foreground))', marginBottom: '4px' }}>
            Trading Balance
          </p>
          <p style={{ fontSize: '1.5rem', fontWeight: '600' }}>
            {formatMoney(state?.balance || 0)}
          </p>
        </div>
        <div style={{ 
          padding: '16px', 
          background: 'linear-gradient(135deg, hsl(280, 84%, 50%, 0.1), hsl(280, 84%, 50%, 0.05))', 
          borderRadius: '8px',
          border: '1px solid hsl(280, 84%, 50%, 0.3)'
        }}>
          <p style={{ fontSize: '0.875rem', color: 'hsl(280, 84%, 50%)', marginBottom: '4px' }}>
            🏦 Kraken USD
          </p>
          <p style={{ fontSize: '1.5rem', fontWeight: '600' }}>
            {loadingKrakenBalance ? 'Loading...' : formatMoney(krakenBalance || 0)}
          </p>
          <button
            className="plain-button"
            onClick={fetchKrakenBalance}
            disabled={loadingKrakenBalance}
            style={{ marginTop: '8px', fontSize: '0.75rem', padding: '4px 8px' }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* How It Works */}
      <div style={{ 
        padding: '20px', 
        marginBottom: '24px',
        background: 'linear-gradient(135deg, hsl(280, 84%, 50%, 0.15), hsl(280, 84%, 50%, 0.05))',
        borderRadius: '12px',
        border: '2px solid hsl(280, 84%, 50%, 0.4)'
      }}>
        <h2 style={{ fontWeight: '600', marginBottom: '12px', color: 'hsl(280, 84%, 50%)' }}>
          🏦 How Banking Works
        </h2>
        <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.9rem', marginBottom: '16px' }}>
          All deposits and withdrawals are handled through the Kraken app. This gives you full control over your money.
        </p>
        
        <div style={{ 
          padding: '16px', 
          background: 'hsl(var(--muted) / 0.5)',
          borderRadius: '8px',
          marginBottom: '12px'
        }}>
          <p style={{ fontWeight: '600', marginBottom: '8px', color: 'hsl(160, 84%, 39%)' }}>💰 To Add Funds:</p>
          <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem' }}>
            <li>Open the Kraken app</li>
            <li>Go to Portfolio → Deposit → USD</li>
            <li>Choose your deposit method</li>
            <li>Once funded, the bot uses your Kraken balance for trading</li>
          </ol>
        </div>
        
        <div style={{ 
          padding: '16px', 
          background: 'hsl(var(--muted) / 0.5)',
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          <p style={{ fontWeight: '600', marginBottom: '8px', color: 'hsl(220, 84%, 50%)' }}>💸 To Withdraw:</p>
          <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem' }}>
            <li>Open the Kraken app</li>
            <li>Go to Portfolio → Withdraw → USD</li>
            <li>Send to your Chime or other bank</li>
            <li>Funds arrive in 1-3 business days</li>
          </ol>
        </div>
        
        <a 
          href="https://www.kraken.com/sign-in" 
          target="_blank" 
          rel="noopener noreferrer"
          className="plain-button"
          style={{ 
            display: 'inline-block',
            fontWeight: '600', 
            background: 'hsl(280, 84%, 50%)', 
            color: 'white', 
            padding: '14px 24px',
            textDecoration: 'none'
          }}
        >
          Open Kraken App →
        </a>
      </div>

      {/* Sell to Cash Option */}
      <div style={{ 
        padding: '16px', 
        marginBottom: '24px',
        background: 'hsl(var(--muted))', 
        borderRadius: '8px'
      }}>
        <h3 style={{ fontWeight: '600', marginBottom: '8px' }}>
          Convert Positions to Cash
        </h3>
        <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.9rem', marginBottom: '12px' }}>
          Sell all open crypto positions and convert to USD in Kraken.
        </p>
        <button
          className="plain-button"
          onClick={handleSellToCash}
          disabled={submitting}
          style={{ fontWeight: '600' }}
        >
          {submitting ? 'Please wait...' : 'Sell All to Cash'}
        </button>
      </div>

      {/* Withdrawal Status */}
      {state?.withdraw_status && (
        <p style={{ marginTop: '16px' }}>
          Status: {state.withdraw_status}
        </p>
      )}

      {/* Recent Transactions */}
      {withdrawals.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <h2 className="medium-text" style={{ fontWeight: '600', marginBottom: '12px' }}>
            Recent Transactions
          </h2>
          {withdrawals.map((w) => {
            const isDeposit = w.withdraw_type === 'deposit';
            return (
              <div 
                key={w.id} 
                style={{ 
                  padding: '12px', 
                  borderBottom: '1px solid hsl(var(--border))',
                  marginBottom: '8px',
                  background: isDeposit ? 'hsl(160, 84%, 39%, 0.05)' : 'transparent'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontWeight: '500' }}>
                      {isDeposit ? '💰 ' : '💸 '}
                      {isDeposit ? 'Deposit' : 'Withdrawal'}: {formatMoney(w.amount)}
                    </p>
                    <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem' }}>
                      {w.status} • {new Date(w.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <p style={{ 
                    fontSize: '0.875rem', 
                    fontWeight: '600',
                    color: isDeposit ? 'hsl(160, 84%, 39%)' : 'hsl(220, 84%, 50%)'
                  }}>
                    {isDeposit ? '↓ In' : '↑ Out'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
