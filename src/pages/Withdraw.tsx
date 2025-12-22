import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTraderState } from '@/hooks/useTraderState';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { getBotApiBaseUrl, getKrakenWithdrawAsset, getKrakenWithdrawKeyUsd, getSupabaseAccessToken } from "@/lib/botApi";

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
  const [krakenKey, setKrakenKey] = useState("");
  const [krakenAsset, setKrakenAsset] = useState("ZUSD");
  const [chimeDetails, setChimeDetails] = useState<ChimeDetails | null>(null);
  const [loadingChime, setLoadingChime] = useState(true);

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
      
      // Fetch Chime details
      setLoadingChime(true);
      const { data: keysData } = await supabase
        .from('user_exchange_keys')
        .select('chime_routing_number, chime_account_number, chime_account_name')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (keysData) {
        setChimeDetails(keysData);
      }
      setLoadingChime(false);
    };

    fetchData();
  }, [user]);

  useEffect(() => {
    setKrakenKey(getKrakenWithdrawKeyUsd());
    setKrakenAsset(getKrakenWithdrawAsset());
  }, []);

  const getAccessToken = async () => getSupabaseAccessToken();

  // Deposit money from Chime to trading account
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
      // Create a completed deposit record
      const { error: depositError } = await supabase
        .from('withdrawal_requests')
        .insert({
          user_id: user.id,
          amount: numAmount,
          status: 'completed',
          withdraw_type: 'deposit',
          bank_name: chimeDetails.chime_account_name || 'Chime',
        });

      if (depositError) {
        toast({
          title: 'Error',
          description: depositError.message,
          variant: 'destructive',
        });
        setSubmitting(false);
        return;
      }

      // Update trader_state balance - add the deposit amount
      const currentBalance = state?.balance || 0;
      const newBalance = currentBalance + numAmount;
      
      const { error: balanceError } = await supabase
        .from('trader_state')
        .update({ 
          balance: newBalance,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      if (balanceError) {
        console.error('Failed to update balance:', balanceError);
        toast({
          title: 'Warning',
          description: 'Deposit recorded but balance update failed. Please refresh.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: '✅ Deposit Complete!',
          description: `$${numAmount.toFixed(2)} added to your trading balance from ${chimeDetails.chime_account_name || 'Chime'}`,
        });
      }
      
      setAmount('');
      
      // Refresh list
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
        description: 'Failed to process deposit',
        variant: 'destructive',
      });
    }

    setSubmitting(false);
  };

  // Chime Direct withdrawal - creates a withdrawal request with Chime details
  const handleChimeDirectWithdraw = async () => {
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

    // Check against trading balance for withdrawals
    if (numAmount > (state?.balance || 0)) {
      toast({
        title: 'Error',
        description: `Insufficient trading balance. Available: $${(state?.balance || 0).toFixed(2)}`,
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);

    const { error } = await supabase
      .from('withdrawal_requests')
      .insert({
        user_id: user.id,
        amount: numAmount,
        status: 'pending',
        withdraw_type: 'chime_direct',
        bank_name: chimeDetails.chime_account_name || 'Chime',
      });

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: '✅ Withdrawal Submitted!',
        description: `$${numAmount.toFixed(2)} will be sent to your Chime account (${chimeDetails.chime_account_name || 'Chime'})`,
      });
      setAmount('');
      
      // Refresh withdrawals list
      const { data } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (data) setWithdrawals(data);
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

  const handleWithdrawViaKraken = async () => {
    if (!botApiBase) {
      toast({
        title: "Backend not configured",
        description: "Set Bot Backend URL in Settings.",
        variant: "destructive",
      });
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast({ title: "Error", description: "Enter a valid amount", variant: "destructive" });
      return;
    }
    if (!krakenKey.trim()) {
      toast({ title: "Missing Kraken withdraw key", description: "Set it in Settings.", variant: "destructive" });
      return;
    }
    const token = await getAccessToken();
    if (!token) return;

    setSubmitting(true);
    try {
      const r = await fetch(`${botApiBase}/kraken/withdraw_fiat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount: numAmount, asset: krakenAsset, key: krakenKey }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: "Kraken withdraw failed", description: data?.error || "Unknown error", variant: "destructive" });
      } else {
        toast({ title: "Kraken withdraw submitted", description: "Check Kraken withdraw status." });
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
                {mode === 'withdraw' && `Available in Trading: ${formatMoney(state?.balance || 0)}`}
              </p>
            </div>
            
            <button
              className="plain-button"
              onClick={mode === 'deposit' ? handleChimeDeposit : handleChimeDirectWithdraw}
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
