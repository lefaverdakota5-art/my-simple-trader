import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePortfolioSnapshot } from '@/hooks/usePortfolioSnapshot';
import { useBotConfig } from '@/hooks/useBotConfig';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, DollarSign, ExternalLink, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function CashOut() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  
  const { snapshot, loading: snapshotLoading, refresh } = usePortfolioSnapshot(user?.id || null, { autoRefreshMs: 5000 });
  const { config, updateConfig } = useBotConfig(user?.id || null);
  
  const [pullAmount, setPullAmount] = useState('');
  const [keepForBots, setKeepForBots] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [cashoutStatus, setCashoutStatus] = useState<'idle' | 'preparing' | 'ready'>('idle');

  useEffect(() => {
    if (!authLoading && !user) navigate('/');
  }, [authLoading, user, navigate]);

  // Set default keep for bots from reserve
  useEffect(() => {
    if (config && !keepForBots) {
      setKeepForBots(config.keep_usd_reserve.toFixed(2));
    }
  }, [config, keepForBots]);

  // Check if ready to withdraw
  useEffect(() => {
    if (cashoutStatus !== 'preparing') return;
    
    const pull = parseFloat(pullAmount) || 0;
    const keep = parseFloat(keepForBots) || 0;
    const available = snapshot?.balance?.available_usd || 0;
    
    if (available >= pull + keep) {
      setCashoutStatus('ready');
      toast.success('Cash Out ready! You can now withdraw.');
    }
  }, [snapshot, pullAmount, keepForBots, cashoutStatus]);

  if (authLoading || snapshotLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-foreground"></div>
      </div>
    );
  }

  const formatMoney = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value || 0);
  };

  const balance = snapshot?.balance;
  const totalUsd = balance?.total_usd || 0;
  const availableUsd = balance?.available_usd || 0;

  const handlePrepareCashOut = async () => {
    const pull = parseFloat(pullAmount);
    const keep = parseFloat(keepForBots) || 0;
    
    if (isNaN(pull) || pull <= 0) {
      toast.error('Please enter a valid pull amount');
      return;
    }
    
    if (pull + keep > totalUsd) {
      toast.error('Not enough total balance for this cash out');
      return;
    }
    
    setPreparing(true);
    
    try {
      // Insert cashout plan
      const { error: planError } = await supabase
        .from('cashout_plans')
        .insert({
          user_id: user?.id,
          pull_amount_usd: pull,
          keep_for_bots_usd: keep,
          status: 'pending',
        });
      
      if (planError) {
        toast.error('Failed to create cashout plan: ' + planError.message);
        return;
      }
      
      // Update bot config to sell mode
      await updateConfig({
        mode: 'sell_to_target_usd',
        sell_target_usd: pull,
        kill_switch: false,
      });
      
      setCashoutStatus('preparing');
      toast.success('Cash Out initiated! Selling positions...');
      
    } catch (e) {
      toast.error('Failed to start cash out');
    } finally {
      setPreparing(false);
    }
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
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <DollarSign className="h-6 w-6" />
          Cash Out
        </h1>
      </div>

      {/* Ready Banner */}
      {cashoutStatus === 'ready' && (
        <div className="mb-6 p-4 rounded-lg bg-green-100 dark:bg-green-950 border-2 border-green-500">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-8 w-8 text-green-600" />
            <div>
              <h3 className="text-lg font-bold text-green-700 dark:text-green-300">
                READY TO WITHDRAW
              </h3>
              <p className="text-sm text-green-600 dark:text-green-400">
                Available: {formatMoney(availableUsd)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Preparing Status */}
      {cashoutStatus === 'preparing' && (
        <div className="mb-6 p-4 rounded-lg bg-yellow-100 dark:bg-yellow-950 border-2 border-yellow-500">
          <div className="flex items-center gap-3">
            <Loader2 className="h-8 w-8 text-yellow-600 animate-spin" />
            <div>
              <h3 className="text-lg font-bold text-yellow-700 dark:text-yellow-300">
                Preparing Cash Out...
              </h3>
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                Selling positions. Available: {formatMoney(availableUsd)} / Target: {formatMoney(parseFloat(pullAmount) + parseFloat(keepForBots || '0'))}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Balance Summary */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">Current Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-sm text-muted-foreground">Total USD</span>
              <p className="text-2xl font-bold">{formatMoney(totalUsd)}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Available</span>
              <p className="text-2xl font-bold text-green-600">{formatMoney(availableUsd)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cash Out Form */}
      {cashoutStatus === 'idle' && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm">Cash Out Amount</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Pull Amount (USD)</label>
              <div className="relative mt-1">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={pullAmount}
                  onChange={(e) => setPullAmount(e.target.value)}
                  placeholder="100"
                  className="w-full pl-9 p-3 rounded border border-border bg-background"
                />
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium">Keep for Bots (USD)</label>
              <div className="relative mt-1">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={keepForBots}
                  onChange={(e) => setKeepForBots(e.target.value)}
                  className="w-full pl-9 p-3 rounded border border-border bg-background"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Reserve for continued trading
              </p>
            </div>
            
            <button
              onClick={handlePrepareCashOut}
              disabled={preparing || !pullAmount}
              className="w-full p-4 rounded-lg bg-orange-500 text-white font-semibold disabled:opacity-50"
            >
              {preparing ? 'Preparing...' : 'Prepare Cash Out (Sell to Target)'}
            </button>
          </CardContent>
        </Card>
      )}

      {/* Withdraw Actions */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">Withdraw via Kraken</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Once your funds are in USD, withdraw to your bank account.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate('/withdraw')}
              className="flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-600 font-semibold hover:bg-blue-100 transition-colors"
            >
              <DollarSign className="h-4 w-4" />
              Withdraw to Bank
            </button>
            <a
              href="https://www.kraken.com/u/funding"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 p-3 rounded-lg border border-border hover:bg-muted transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Open Kraken
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Important Note */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <Badge variant="outline" className="mb-2">How it works</Badge>
          <p className="text-sm text-muted-foreground">
            After selling your positions, use the Banking page to withdraw USD directly to your bank account 
            via the Kraken API. Make sure your withdrawal key is configured in Settings.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
