import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTraderState } from '@/hooks/useTraderState';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Wallet, ArrowDownCircle, ArrowUpCircle, RefreshCw, ExternalLink, DollarSign } from "lucide-react";

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
  const { state, loading: stateLoading, krakenBalance, loadingKraken, refreshKrakenBalance } = useTraderState(user?.id || null);
  const navigate = useNavigate();
  
  const [submitting, setSubmitting] = useState(false);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [depositAmount, setDepositAmount] = useState('');

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

  const handleSellAllToCash = async () => {
    if (submitting) return;
    setSubmitting(true);
    
    try {
      // Get all open positions from database
      const { data: positions, error: posError } = await supabase
        .from('positions')
        .select('*')
        .eq('user_id', user?.id)
        .eq('status', 'open');
      
      if (posError) {
        toast.error("Failed to fetch positions: " + posError.message);
        setSubmitting(false);
        return;
      }
      
      if (!positions || positions.length === 0) {
        toast.info("No open positions to sell");
        setSubmitting(false);
        return;
      }
      
      // Sell each position
      let successCount = 0;
      let failCount = 0;
      
      for (const pos of positions) {
        const { data, error } = await supabase.functions.invoke('kraken-withdraw', {
          body: {
            action: 'sell_crypto',
            pair: pos.pair,
            volume: pos.quantity,
            position_id: pos.id,
          },
        });
        
        if (error || data?.error) {
          console.error("Sell failed for", pos.symbol, error || data?.error);
          failCount++;
        } else {
          successCount++;
        }
      }
      
      if (successCount > 0) {
        toast.success(`Sold ${successCount} position(s) successfully!`);
        refreshKrakenBalance();
      }
      if (failCount > 0) {
        toast.error(`Failed to sell ${failCount} position(s)`);
      }
      
    } catch (e) {
      toast.error("Sell to cash failed: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdrawToBank = async () => {
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    
    if (amount > (krakenBalance || 0)) {
      toast.error("Insufficient balance");
      return;
    }
    
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('kraken-withdraw', {
        body: {
          action: 'withdraw_to_bank',
          amount: amount,
        },
      });
      
      if (error) {
        toast.error("Withdrawal failed: " + error.message);
        return;
      }
      
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      
      toast.success(data.message || "Withdrawal initiated!");
      setWithdrawAmount('');
      refreshKrakenBalance();
      
      // Refresh withdrawal history
      const { data: withdrawalData } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (withdrawalData) setWithdrawals(withdrawalData);
      
    } catch (e) {
      toast.error("Withdrawal failed: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordDeposit = async () => {
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    
    setSubmitting(true);
    try {
      // Record the pending deposit
      const { error } = await supabase
        .from('withdrawal_requests')
        .insert({
          user_id: user?.id,
          amount: amount,
          status: 'pending',
          withdraw_type: 'deposit',
          bank_name: 'ACH Deposit',
        });
      
      if (error) {
        toast.error("Failed to record deposit: " + error.message);
        return;
      }
      
      toast.success(`Deposit of $${amount.toFixed(2)} recorded! Complete the deposit in Kraken.`);
      setDepositAmount('');
      
      // Refresh history
      const { data: withdrawalData } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (withdrawalData) setWithdrawals(withdrawalData);
      
    } catch (e) {
      toast.error("Failed: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || stateLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-foreground mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
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
    <div className="min-h-screen bg-background p-4 md:p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/dashboard')}
          className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold">Banking</h1>
      </div>

      {/* Kraken Balance Card */}
      <Card className="mb-6 border-2 border-primary/30 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-primary flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Kraken USD Balance (Real Money)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <p className="text-3xl font-bold">
              {loadingKraken ? 'Loading...' : formatMoney(krakenBalance ?? 0)}
            </p>
            <button
              onClick={() => refreshKrakenBalance(true)}
              disabled={loadingKraken}
              className="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-5 w-5 ${loadingKraken ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            This is your real USD balance in Kraken. The trading bot uses this for all trades.
          </p>
        </CardContent>
      </Card>

      {/* Deposit Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-600">
            <ArrowDownCircle className="h-5 w-5" />
            Deposit Funds
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Deposit money from your bank to Kraken to fund your trading account.
          </p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Amount to Deposit</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="100"
                    className="w-full pl-9 pr-4 py-3 rounded-lg border border-border bg-background focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={handleRecordDeposit}
                disabled={submitting || !depositAmount}
                className="flex-1 py-3 px-4 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Processing...' : 'Record Deposit'}
              </button>
              <a
                href="https://www.kraken.com/u/funding"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 py-3 px-4 rounded-lg border border-border hover:bg-muted transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                Open Kraken
              </a>
            </div>
            
            <p className="text-xs text-muted-foreground">
              After recording here, complete the ACH deposit in the Kraken app. Deposits take 1-3 business days.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Withdraw Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-600">
            <ArrowUpCircle className="h-5 w-5" />
            Withdraw Funds
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Withdraw USD from Kraken to your bank account.
          </p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Amount to Withdraw</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="number"
                    min="1"
                    step="1"
                    max={krakenBalance || 0}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="50"
                    className="w-full pl-9 pr-4 py-3 rounded-lg border border-border bg-background focus:border-primary focus:outline-none"
                  />
                </div>
                <button
                  onClick={() => setWithdrawAmount(String(krakenBalance || 0))}
                  className="px-4 py-3 rounded-lg border border-border hover:bg-muted transition-colors text-sm font-medium"
                >
                  Max
                </button>
              </div>
            </div>
            
            <button
              onClick={handleWithdrawToBank}
              disabled={submitting || !withdrawAmount}
              className="w-full py-3 px-4 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Processing...' : 'Withdraw to Bank'}
            </button>
            
            <p className="text-xs text-muted-foreground">
              Make sure you have a withdrawal address configured in Kraken Settings. Withdrawals take 1-3 business days.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Sell All to Cash */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Convert Positions to Cash
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Sell all open crypto positions and convert to USD in your Kraken account.
          </p>
          <button
            onClick={handleSellAllToCash}
            disabled={submitting}
            className="w-full py-3 px-4 rounded-lg border-2 border-orange-500 text-orange-600 font-semibold hover:bg-orange-50 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Selling...' : 'Sell All Positions to Cash'}
          </button>
        </CardContent>
      </Card>

      {/* How It Works */}
      <Card className="mb-6 bg-muted/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            🏦 How Banking Works
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-4">
          <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
            <p className="font-semibold text-green-700 dark:text-green-300 mb-2">💰 To Deposit:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Open the Kraken app or website</li>
              <li>Go to Funding → Deposit → USD</li>
              <li>Choose ACH (free) or wire transfer</li>
              <li>Link your bank and initiate transfer</li>
            </ol>
          </div>
          
          <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
            <p className="font-semibold text-blue-700 dark:text-blue-300 mb-2">💸 To Withdraw:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Add your bank as a withdrawal address in Kraken</li>
              <li>Use the withdraw form above or the Kraken app</li>
              <li>Funds arrive in 1-3 business days</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Withdrawal Status */}
      {state?.withdraw_status && (
        <div className="mb-6 p-4 rounded-lg bg-muted">
          <p className="text-sm">
            <span className="font-medium">Status:</span> {state.withdraw_status}
          </p>
        </div>
      )}

      {/* Recent Transactions */}
      {withdrawals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {withdrawals.map((w) => {
                const isDeposit = w.withdraw_type === 'deposit';
                return (
                  <div 
                    key={w.id} 
                    className={`p-3 rounded-lg border ${isDeposit ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950' : 'border-border bg-muted/50'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isDeposit ? (
                          <ArrowDownCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <ArrowUpCircle className="h-4 w-4 text-blue-600" />
                        )}
                        <span className="font-medium">
                          {isDeposit ? 'Deposit' : 'Withdrawal'}
                        </span>
                        <Badge variant={w.status === 'completed' ? 'default' : 'secondary'} className="text-xs">
                          {w.status}
                        </Badge>
                      </div>
                      <span className={`font-semibold ${isDeposit ? 'text-green-600' : 'text-blue-600'}`}>
                        {isDeposit ? '+' : '-'}{formatMoney(w.amount)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(w.created_at).toLocaleDateString()} at {new Date(w.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
