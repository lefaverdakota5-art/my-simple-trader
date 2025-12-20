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

interface PlaidBalance {
  available: number | null;
  current: number | null;
  limit: number | null;
}

interface PlaidAccount {
  account_id: string;
  name: string;
  mask: string;
  type: string;
  subtype: string;
  balances: PlaidBalance;
}

export default function Withdraw() {
  const { user, loading: authLoading } = useAuth();
  const { state, loading: stateLoading } = useTraderState(user?.id || null);
  const navigate = useNavigate();
  const botApiBase = getBotApiBaseUrl();
  
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [withdrawType, setWithdrawType] = useState('chime_direct');
  const [submitting, setSubmitting] = useState(false);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [krakenKey, setKrakenKey] = useState("");
  const [krakenAsset, setKrakenAsset] = useState("ZUSD");
  const [chimeDetails, setChimeDetails] = useState<ChimeDetails | null>(null);
  const [loadingChime, setLoadingChime] = useState(true);
  const [chimeBalance, setChimeBalance] = useState<number | null>(null);
  const [plaidAccounts, setPlaidAccounts] = useState<PlaidAccount[]>([]);

  interface WithdrawalRequest {
    id: string;
    amount: number;
    status: string;
    created_at: string;
    withdraw_type?: string;
    bank_name?: string;
  }

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  // Fetch Plaid/Chime balance
  useEffect(() => {
    if (!user || !botApiBase) return;

    const fetchChimeBalance = async () => {
      try {
        const token = await getSupabaseAccessToken();
        if (!token) return;

        const response = await fetch(`${botApiBase}/plaid/accounts`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.connected && data.accounts && data.accounts.length > 0) {
            setPlaidAccounts(data.accounts);
            // Use the first account's balance
            const primaryAccount = data.accounts[0];
            const balance = primaryAccount.balances?.available ?? primaryAccount.balances?.current ?? null;
            setChimeBalance(balance);
          }
        }
      } catch (error) {
        console.error('Failed to fetch Chime balance:', error);
      }
    };

    fetchChimeBalance();
  }, [user, botApiBase]);

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
    if (!user || !botApiBase) return;
    
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

    // Check against Chime balance if available
    if (chimeBalance === null) {
      toast({
        title: 'Error',
        description: 'Chime balance is still loading. Please wait a moment and try again.',
        variant: 'destructive',
      });
      return;
    }
    
    if (numAmount > chimeBalance) {
      toast({
        title: 'Error',
        description: `Insufficient Chime balance. Available: $${chimeBalance.toFixed(2)}`,
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);

    try {
      const token = await getAccessToken();
      if (!token) {
        toast({
          title: 'Error',
          description: 'Authentication failed',
          variant: 'destructive',
        });
        setSubmitting(false);
        return;
      }

      const response = await fetch(`${botApiBase}/deposit/from_chime`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount: numAmount }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast({
          title: 'Error',
          description: data.error || 'Deposit failed',
          variant: 'destructive',
        });
      } else {
        toast({
          title: '✅ Deposit Successful!',
          description: `$${numAmount.toFixed(2)} deposited from Chime to trading account`,
        });
        setAmount('');
        
        // Refresh withdrawals list (the trader_state will update via realtime subscription)
        const { data: withdrawalData } = await supabase
          .from('withdrawal_requests')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10);
        
        if (withdrawalData) setWithdrawals(withdrawalData);
      }
    } catch (error) {
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

  const handleWithdraw = async () => {
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

    if (numAmount > (state?.balance || 0)) {
      toast({
        title: 'Error',
        description: 'Insufficient balance',
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
        withdraw_type: withdrawType,
        bank_name: withdrawType === 'chime' ? 'Chime' : '',
      });

    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Success',
        description: 'Withdrawal request submitted',
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
          background: 'hsl(var(--muted))', 
          borderRadius: '8px',
          border: '1px solid hsl(var(--border))'
        }}>
          <p style={{ fontSize: '0.875rem', color: 'hsl(var(--muted-foreground))', marginBottom: '4px' }}>
            Chime Balance
          </p>
          <p style={{ fontSize: '1.5rem', fontWeight: '600' }}>
            {chimeBalance !== null ? formatMoney(chimeBalance) : '—'}
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
                {mode === 'deposit' 
                  ? `Available in Chime: ${chimeBalance !== null ? formatMoney(chimeBalance) : 'Loading...'}`
                  : `Available in Trading: ${formatMoney(state?.balance || 0)}`}
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
            style={{ marginBottom: '8px', fontWeight: '600', width: '100%' }}
          >
            {submitting ? 'Please wait...' : 'Withdraw USD via Kraken'}
          </button>

          <button
            className="plain-button"
            onClick={handleWithdraw}
            disabled={submitting}
            style={{ fontWeight: '600', width: '100%' }}
          >
            {submitting ? 'Processing...' : 'Submit Withdrawal Request'}
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