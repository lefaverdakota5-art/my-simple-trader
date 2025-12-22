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
  
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [krakenBalance, setKrakenBalance] = useState<number | null>(null);
  const [loadingKrakenBalance, setLoadingKrakenBalance] = useState(false);
  const [krakenWithdrawKey, setKrakenWithdrawKey] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  // Fetch existing withdrawal requests and settings
  useEffect(() => {
    if (!user) return;
    
    const fetchData = async () => {
      // Fetch withdrawals
      const { data: withdrawalData } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (withdrawalData) setWithdrawals(withdrawalData);
      
      // Fetch Kraken withdrawal key
      const { data: keysData } = await supabase
        .from('user_exchange_keys')
        .select('kraken_withdraw_key')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (keysData?.kraken_withdraw_key) {
        setKrakenWithdrawKey(keysData.kraken_withdraw_key);
      }
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

  // Withdraw from Kraken to bank
  const handleWithdrawToBank = async () => {
    if (!user) return;
    
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast({
        title: 'Error',
        description: 'Please enter a valid amount',
        variant: 'destructive',
      });
      return;
    }

    if (!krakenWithdrawKey.trim()) {
      toast({
        title: 'Missing Kraken Withdrawal Key',
        description: 'Please add your bank as a withdrawal address in Kraken, then enter the key name in Settings.',
        variant: 'destructive',
      });
      navigate('/settings');
      return;
    }

    // Check against Kraken balance
    if (krakenBalance !== null && numAmount > krakenBalance) {
      toast({
        title: 'Insufficient Kraken Balance',
        description: `Your Kraken USD balance is $${krakenBalance.toFixed(2)}.`,
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke('kraken-withdraw', {
        body: { 
          action: 'withdraw_to_bank',
          amount: numAmount,
          withdraw_key: krakenWithdrawKey,
          asset: 'USD'
        }
      });

      if (error || !data?.success) {
        toast({
          title: 'Withdrawal Failed',
          description: data?.error || error?.message || 'Failed to initiate withdrawal',
          variant: 'destructive',
        });
      } else {
        toast({
          title: '✅ Withdrawal Initiated!',
          description: data.message || `$${numAmount.toFixed(2)} will be sent to your bank`,
        });
        setAmount('');
        
        // Refresh Kraken balance and withdrawal list
        fetchKrakenBalance();
        const { data: withdrawalData } = await supabase
          .from('withdrawal_requests')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10);
        
        if (withdrawalData) setWithdrawals(withdrawalData);
      }
    } catch (error) {
      console.error('Withdrawal error:', error);
      toast({
        title: 'Error',
        description: 'Failed to process withdrawal request',
        variant: 'destructive',
      });
    }

    setSubmitting(false);
  };

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
            🏦 Kraken USD Balance
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

      {/* Deposit Section */}
      <div style={{ 
        padding: '20px', 
        marginBottom: '24px',
        background: 'linear-gradient(135deg, hsl(160, 84%, 39%, 0.15), hsl(160, 84%, 39%, 0.05))',
        borderRadius: '12px',
        border: '2px solid hsl(160, 84%, 39%, 0.4)'
      }}>
        <h2 style={{ fontWeight: '600', marginBottom: '8px', color: 'hsl(160, 84%, 39%)' }}>
          💰 Deposit Funds
        </h2>
        <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.9rem', marginBottom: '16px' }}>
          Deposit money directly to your Kraken account through the Kraken app or website.
          Once funded, the trading bot will use your Kraken balance.
        </p>
        
        <div style={{ 
          padding: '12px', 
          background: 'hsl(var(--muted) / 0.5)',
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem' }}>
            <li>Open Kraken app or website</li>
            <li>Go to Portfolio → Deposit → USD</li>
            <li>Choose deposit method (bank, wire, etc.)</li>
            <li>Complete the transfer</li>
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
            background: 'hsl(160, 84%, 39%)', 
            color: 'white', 
            padding: '14px 24px',
            textDecoration: 'none'
          }}
        >
          Open Kraken to Deposit →
        </a>
      </div>

      {/* Withdraw Section */}
      <div style={{ 
        padding: '20px', 
        marginBottom: '24px',
        background: 'linear-gradient(135deg, hsl(220, 84%, 50%, 0.15), hsl(220, 84%, 50%, 0.05))',
        borderRadius: '12px',
        border: '2px solid hsl(220, 84%, 50%, 0.4)'
      }}>
        <h2 style={{ fontWeight: '600', marginBottom: '8px', color: 'hsl(220, 84%, 50%)' }}>
          💸 Withdraw to Bank
        </h2>
        <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.9rem', marginBottom: '16px' }}>
          {krakenWithdrawKey 
            ? `Withdraw USD from Kraken to your saved bank (${krakenWithdrawKey})`
            : 'Set up a withdrawal destination in Kraken first, then configure it in Settings.'
          }
        </p>
        
        {krakenWithdrawKey ? (
          <>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                Amount to Withdraw
              </label>
              <input
                type="number"
                className="plain-input"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                style={{ fontSize: '1.2rem', padding: '12px' }}
              />
              <p style={{ fontSize: '0.75rem', color: 'hsl(var(--muted-foreground))', marginTop: '4px' }}>
                Available: {formatMoney(krakenBalance || 0)}
              </p>
            </div>
            
            <button
              className="plain-button"
              onClick={handleWithdrawToBank}
              disabled={submitting || !amount}
              style={{ 
                fontWeight: '600', 
                background: 'hsl(220, 84%, 50%)', 
                color: 'white',
                padding: '14px 24px',
                fontSize: '1rem'
              }}
            >
              {submitting ? 'Processing...' : 'Withdraw to Bank'}
            </button>
          </>
        ) : (
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <a 
              href="https://www.kraken.com/sign-in" 
              target="_blank" 
              rel="noopener noreferrer"
              className="plain-button"
              style={{ 
                display: 'inline-block',
                fontWeight: '600', 
                background: 'hsl(220, 84%, 50%)', 
                color: 'white', 
                padding: '14px 24px',
                textDecoration: 'none'
              }}
            >
              Open Kraken to Withdraw →
            </a>
            <button
              className="plain-button"
              onClick={() => navigate('/settings')}
              style={{ fontWeight: '600' }}
            >
              Configure in Settings
            </button>
          </div>
        )}
      </div>

      {/* Other Options */}
      <details style={{ marginBottom: '24px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: '600', marginBottom: '12px' }}>
          Other Options
        </summary>
        
        <div style={{ padding: '16px', background: 'hsl(var(--muted))', borderRadius: '8px', marginTop: '12px' }}>
          <button
            className="plain-button"
            onClick={handleSellToCash}
            disabled={submitting}
            style={{ marginBottom: '8px', fontWeight: '600', width: '100%' }}
          >
            {submitting ? 'Please wait...' : 'Sell All Positions to Cash'}
          </button>
          <p style={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))' }}>
            Converts all open positions to USD in Kraken
          </p>
        </div>
      </details>

      {/* Withdrawal Status */}
      {state?.withdraw_status && (
        <p style={{ marginTop: '16px' }}>
          Status: {state.withdraw_status}
        </p>
      )}

      {/* Recent Transactions */}
      {withdrawals.length > 0 && (
        <div style={{ marginTop: '32px' }}>
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
                      {w.bank_name || 'Bank'} • {w.status} • {new Date(w.created_at).toLocaleDateString()}
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
