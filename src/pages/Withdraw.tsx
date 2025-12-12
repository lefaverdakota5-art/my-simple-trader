import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTraderState } from '@/hooks/useTraderState';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export default function Withdraw() {
  const { user, loading: authLoading } = useAuth();
  const { state, loading: stateLoading } = useTraderState(user?.id || null);
  const navigate = useNavigate();
  
  const [amount, setAmount] = useState('');
  const [withdrawType, setWithdrawType] = useState('bank');
  const [submitting, setSubmitting] = useState(false);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  // Fetch existing withdrawal requests
  useEffect(() => {
    if (!user) return;
    
    const fetchWithdrawals = async () => {
      const { data } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (data) setWithdrawals(data);
    };

    fetchWithdrawals();
  }, [user]);

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

      <h1 className="big-text" style={{ marginBottom: '16px' }}>Withdraw Money</h1>
      
      <p className="medium-text" style={{ marginBottom: '24px' }}>
        Available Balance: {formatMoney(state?.balance || 0)}
      </p>

      {/* Amount Input */}
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

      {/* Withdraw Type */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', marginBottom: '4px', fontWeight: '500' }}>
          Withdraw To
        </label>
        <select
          className="plain-input"
          value={withdrawType}
          onChange={(e) => setWithdrawType(e.target.value)}
        >
          <option value="chime">Chime Account</option>
          <option value="bank">Other Bank (cash)</option>
          <option value="convert">Convert Crypto to USD first</option>
        </select>
      </div>

      <button
        className="plain-button"
        onClick={handleWithdraw}
        disabled={submitting}
        style={{ fontWeight: '600' }}
      >
        {submitting ? 'Processing...' : 'Confirm Withdraw'}
      </button>

      {/* Withdrawal Status */}
      {state?.withdraw_status && (
        <p style={{ marginTop: '16px' }}>
          Status: {state.withdraw_status}
        </p>
      )}

      {/* Recent Withdrawals */}
      {withdrawals.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <h2 className="medium-text" style={{ fontWeight: '600', marginBottom: '12px' }}>
            Recent Withdrawals
          </h2>
          {withdrawals.map((w) => (
            <div 
              key={w.id} 
              style={{ 
                padding: '12px', 
                borderBottom: '1px solid hsl(var(--border))',
                marginBottom: '8px' 
              }}
            >
              <p style={{ fontWeight: '500' }}>{formatMoney(w.amount)}</p>
              <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem' }}>
                Status: {w.status} • {new Date(w.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}