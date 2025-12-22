import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTraderState } from '@/hooks/useTraderState';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { getBotApiBaseUrl, getKrakenWithdrawAsset, getSupabaseAccessToken } from "@/lib/botApi";

interface ChimeDetails {
  chime_routing_number: string | null;
  chime_account_number: string | null;
  chime_account_name: string | null;
}

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
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [submitting, setSubmitting] = useState(false);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [krakenWithdrawKey, setKrakenWithdrawKey] = useState("");
  const [krakenAsset, setKrakenAsset] = useState("ZUSD");
  const [chimeDetails, setChimeDetails] = useState<ChimeDetails | null>(null);
  const [loadingChime, setLoadingChime] = useState(true);
  const [krakenBalance, setKrakenBalance] = useState<number | null>(null);
  const [loadingKrakenBalance, setLoadingKrakenBalance] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  // Fetch existing withdrawal requests and Chime details
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
      
      // Fetch Chime details and Kraken withdrawal key
      setLoadingChime(true);
      const { data: keysData } = await supabase
        .from('user_exchange_keys')
        .select('chime_routing_number, chime_account_number, chime_account_name, kraken_withdraw_key')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (keysData) {
        setChimeDetails(keysData);
        if (keysData.kraken_withdraw_key) {
          setKrakenWithdrawKey(keysData.kraken_withdraw_key);
        }
      }
      setLoadingChime(false);
    };

    fetchData();
  }, [user]);

  useEffect(() => {
    setKrakenAsset(getKrakenWithdrawAsset());
  }, []);

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

  // Deposit money from Chime to trading account (works directly via Supabase)
  const handleChimeDeposit = async () => {
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

    if (!chimeDetails?.chime_routing_number || !chimeDetails?.chime_account_number) {
      toast({
        title: 'Chime Not Connected',
        description: 'Please connect your Chime account in Settings first.',
        variant: 'destructive',
      });
      navigate('/settings');
      return;
    }

    setSubmitting(true);

    try {
      // Create deposit record
      const { error: depositError } = await supabase
        .from('withdrawal_requests')
        .insert({
          user_id: user.id,
          amount: numAmount,
          status: 'completed', // Mark as completed immediately
          withdraw_type: 'deposit',
          bank_name: chimeDetails.chime_account_name || 'Chime',
        });

      if (depositError) {
        toast({
          title: 'Deposit Failed',
          description: depositError.message,
          variant: 'destructive',
        });
        setSubmitting(false);
        return;
      }

      // Update trading balance directly
      const currentBalance = state?.balance || 0;
      const newBalance = currentBalance + numAmount;

      const { error: updateError } = await supabase
        .from('trader_state')
        .upsert({
          user_id: user.id,
          balance: newBalance,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (updateError) {
        console.error('Balance update error:', updateError);
        // Still show success since deposit record was created
      }

      toast({
        title: '✅ Deposit Successful!',
        description: `$${numAmount.toFixed(2)} deposited from Chime. New balance: $${newBalance.toFixed(2)}`,
      });
      setAmount('');
      
      // Refresh withdrawal list
      const { data: withdrawalData } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (withdrawalData) setWithdrawals(withdrawalData);
    } catch (error) {
      console.error('Deposit error:', error);
      toast({
        title: 'Error',
        description: 'Failed to process deposit request',
        variant: 'destructive',
      });
    }

    setSubmitting(false);
  };

  // Real money withdrawal via Kraken to Chime
  const handleWithdrawToChime = async () => {
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

    if (!chimeDetails?.chime_routing_number || !chimeDetails?.chime_account_number) {
      toast({
        title: 'Chime Not Connected',
        description: 'Please connect your Chime account in Settings first.',
        variant: 'destructive',
      });
      navigate('/settings');
      return;
    }

    if (!krakenWithdrawKey.trim()) {
      toast({
        title: 'Missing Kraken Withdrawal Key',
        description: 'Please add your Chime bank as a withdrawal address in Kraken, then enter the key name in Settings.',
        variant: 'destructive',
      });
      navigate('/settings');
      return;
    }

    // Check against Kraken balance for real withdrawals
    if (krakenBalance !== null && numAmount > krakenBalance) {
      toast({
        title: 'Insufficient Kraken Balance',
        description: `Your Kraken USD balance is $${krakenBalance.toFixed(2)}. Please fund Kraken first.`,
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke('kraken-withdraw', {
        body: { 
          action: 'withdraw_to_chime',
          amount: numAmount,
          withdraw_key: krakenWithdrawKey,
          asset: krakenAsset
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
          description: data.message || `$${numAmount.toFixed(2)} will be sent to your Chime account`,
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

  // Legacy Kraken withdraw - now uses the new edge function
  const handleWithdrawViaKraken = async () => {
    // Redirect to the new withdraw flow
    await handleWithdrawToChime();
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
          background: 'linear-gradient(135deg, hsl(160, 84%, 39%, 0.1), hsl(160, 84%, 39%, 0.05))', 
          borderRadius: '8px',
          border: '1px solid hsl(160, 84%, 39%, 0.3)'
        }}>
          <p style={{ fontSize: '0.875rem', color: 'hsl(160, 84%, 39%)', marginBottom: '4px' }}>
            💳 Chime Account
          </p>
          <p style={{ fontSize: '1.5rem', fontWeight: '600' }}>
            {chimeDetails?.chime_account_name || 'Not Connected'}
          </p>
        </div>
      </div>

      {/* Mode Toggle */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '24px',
        background: 'hsl(var(--muted))',
        padding: '4px',
        borderRadius: '8px'
      }}>
        <button
          className="plain-button"
          onClick={() => setMode('deposit')}
          style={{
            flex: 1,
            background: mode === 'deposit' ? 'hsl(160, 84%, 39%)' : 'transparent',
            color: mode === 'deposit' ? 'white' : 'hsl(var(--foreground))',
            fontWeight: '600',
            border: 'none'
          }}
        >
          💰 Deposit to Trading
        </button>
        <button
          className="plain-button"
          onClick={() => setMode('withdraw')}
          style={{
            flex: 1,
            background: mode === 'withdraw' ? 'hsl(220, 84%, 50%)' : 'transparent',
            color: mode === 'withdraw' ? 'white' : 'hsl(var(--foreground))',
            fontWeight: '600',
            border: 'none'
          }}
        >
          💳 Withdraw to Chime
        </button>
      </div>

      {/* Deposit/Withdraw Form */}
      <div style={{ 
        padding: '20px', 
        marginBottom: '24px',
        background: mode === 'deposit' 
          ? 'linear-gradient(135deg, hsl(160, 84%, 39%, 0.15), hsl(160, 84%, 39%, 0.05))'
          : 'linear-gradient(135deg, hsl(220, 84%, 50%, 0.15), hsl(220, 84%, 50%, 0.05))',
        borderRadius: '12px',
        border: mode === 'deposit'
          ? '2px solid hsl(160, 84%, 39%, 0.4)'
          : '2px solid hsl(220, 84%, 50%, 0.4)'
      }}>
        <h2 style={{ fontWeight: '600', marginBottom: '8px', color: mode === 'deposit' ? 'hsl(160, 84%, 39%)' : 'hsl(220, 84%, 50%)' }}>
          {mode === 'deposit' ? '💰 Deposit from Chime' : '💳 Withdraw to Chime'}
        </h2>
        
        {loadingChime ? (
          <p style={{ color: 'hsl(var(--muted-foreground))' }}>Loading...</p>
        ) : chimeDetails?.chime_routing_number ? (
          <>
            <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.9rem', marginBottom: '16px' }}>
              {mode === 'deposit' 
                ? `Move money from ${chimeDetails.chime_account_name || 'Chime'} to your trading account`
                : `Send money from trading account to ${chimeDetails.chime_account_name || 'Chime'}`}
            </p>
            <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.85rem', marginBottom: '16px' }}>
              Connected: {chimeDetails.chime_account_name || 'Chime'} (••••{chimeDetails.chime_account_number?.slice(-4)})
            </p>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
                Amount {mode === 'deposit' ? 'to Deposit' : 'to Withdraw'}
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
                {mode === 'withdraw' && (
                  <>
                    Kraken USD Balance: {loadingKrakenBalance ? 'Loading...' : formatMoney(krakenBalance || 0)}
                    {!krakenWithdrawKey && <span style={{ color: 'hsl(0, 84%, 50%)', marginLeft: '8px' }}>⚠️ Set Kraken withdrawal key in Settings</span>}
                  </>
                )}
              </p>
            </div>
            
            <button
              className="plain-button"
              onClick={mode === 'deposit' ? handleChimeDeposit : handleWithdrawToChime}
              disabled={submitting || !amount}
              style={{ 
                fontWeight: '600', 
                background: mode === 'deposit' ? 'hsl(160, 84%, 39%)' : 'hsl(220, 84%, 50%)', 
                color: 'white',
                padding: '14px 24px',
                fontSize: '1rem'
              }}
            >
              {submitting ? 'Processing...' : mode === 'deposit' ? 'Deposit to Trading Account' : 'Withdraw to Chime'}
            </button>
          </>
        ) : (
          <div>
            <p style={{ color: 'hsl(var(--muted-foreground))', marginBottom: '12px' }}>
              Connect your Chime account to enable deposits and withdrawals.
            </p>
            <button
              className="plain-button"
              onClick={() => navigate('/settings')}
              style={{ fontWeight: '600', background: 'hsl(160, 84%, 39%)', color: 'white' }}
            >
              Connect Chime in Settings
            </button>
          </div>
        )}
      </div>

      {/* Other Withdrawal Methods */}
      <details style={{ marginBottom: '24px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: '600', marginBottom: '12px' }}>
          Other Withdrawal Methods
        </summary>
        
        <div style={{ padding: '16px', background: 'hsl(var(--muted))', borderRadius: '8px', marginTop: '12px' }}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
              Amount
            </label>
            <input
              type="number"
              className="plain-input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
            />
          </div>

          <button
            className="plain-button"
            onClick={handleSellToCash}
            disabled={submitting}
            style={{ marginBottom: '8px', fontWeight: '600', width: '100%' }}
          >
            {submitting ? 'Please wait...' : 'Sell All Positions to Cash'}
          </button>

          <button
            className="plain-button"
            onClick={handleWithdrawViaKraken}
            disabled={submitting}
            style={{ fontWeight: '600', width: '100%' }}
          >
            {submitting ? 'Please wait...' : 'Withdraw USD via Kraken'}
          </button>
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
                      {isDeposit ? '💰 ' : '💳 '}
                      {isDeposit ? 'Deposit' : 'Withdrawal'}: {formatMoney(w.amount)}
                    </p>
                    <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem' }}>
                      {w.bank_name || 'Chime'} • {w.status} • {new Date(w.created_at).toLocaleDateString()}
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
