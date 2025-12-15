import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTraderState } from '@/hooks/useTraderState';
import { getBotApiBaseUrl, getSupabaseAccessToken } from "@/lib/botApi";

export default function Dashboard() {
  const { user, loading: authLoading, signOut, initializeTraderState } = useAuth();
  const { state, trades, loading: stateLoading, toggleSwarm, toggleAutonomy } = useTraderState(user?.id || null);
  const navigate = useNavigate();
  const [backendStatus, setBackendStatus] = useState<
    null | { ok: boolean; botActive?: boolean; plaidLinked?: boolean; alpaca?: boolean; kraken?: boolean }
  >(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      initializeTraderState(user.id);
    }
  }, [user, initializeTraderState]);

  useEffect(() => {
    (async () => {
      const base = getBotApiBaseUrl();
      if (!base) {
        setBackendStatus(null);
        return;
      }
      const token = await getSupabaseAccessToken();
      if (!token) {
        setBackendStatus({ ok: false });
        return;
      }
      try {
        const r1 = await fetch(`${base}/me/status`, { headers: { Authorization: `Bearer ${token}` } });
        const d1 = await r1.json();
        const r2 = await fetch(`${base}/me/config`, { headers: { Authorization: `Bearer ${token}` } });
        const d2 = await r2.json();
        const ok = r1.ok && r2.ok;
        setBackendStatus({
          ok,
          botActive: Boolean(d1?.bot_active),
          plaidLinked: Boolean(d2?.plaid_linked),
          alpaca: Boolean(d2?.alpaca_configured),
          kraken: Boolean(d2?.kraken_configured),
        });
      } catch {
        setBackendStatus({ ok: false });
      }
    })();
  }, [user]);

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

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="app-container">
      <h1 className="big-text" style={{ marginBottom: '24px' }}>My Trader</h1>

      {/* Balance Display */}
      <p className="big-text">Total Balance: {formatMoney(state?.balance || 0)}</p>
      
      <p className="big-text" style={{ 
        color: (state?.todays_profit || 0) >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))' 
      }}>
        Today's P/L: {formatMoney(state?.todays_profit || 0)}
      </p>

      <p className="big-text">Portfolio Value: {formatMoney(state?.portfolio_value || 0)}</p>
      
      <p className="big-text">Progress to $1M: {(state?.progress_percent || 0).toFixed(2)}%</p>
      
      <p className="big-text">Win Rate: {(state?.win_rate || 0).toFixed(1)}%</p>
      
      <p className="medium-text" style={{ marginTop: '16px', marginBottom: '24px' }}>
        Current Strategy: Predictive Swarm {state?.swarm_active ? 'Active' : 'Inactive'}
      </p>

      <p className="medium-text" style={{ marginBottom: '16px' }}>
        Backend:{" "}
        {backendStatus === null
          ? "Not set"
          : backendStatus.ok
            ? backendStatus.botActive
              ? "Connected • Bot Active"
              : "Connected • Bot Idle"
            : "Not reachable"}
      </p>

      {backendStatus?.ok && (
        <p className="medium-text" style={{ marginBottom: '16px' }}>
          Connections: Plaid {backendStatus.plaidLinked ? "OK" : "Missing"} • Alpaca{" "}
          {backendStatus.alpaca ? "OK" : "Missing"} • Kraken {backendStatus.kraken ? "OK" : "Missing"}
        </p>
      )}

      {/* Control Buttons */}
      <button
        className="plain-button"
        onClick={toggleSwarm}
        style={{
          color: state?.swarm_active ? 'hsl(var(--success))' : 'hsl(var(--destructive))',
          fontWeight: '700',
        }}
      >
        SWARM {state?.swarm_active ? 'ON' : 'OFF'}
      </button>

      <button
        className="plain-button"
        onClick={toggleAutonomy}
        style={{
          color: state?.autonomy_mode ? 'hsl(var(--success))' : 'hsl(var(--destructive))',
        }}
      >
        Autonomy Mode {state?.autonomy_mode ? 'ON' : 'OFF'}
      </button>

      <button
        className="plain-button"
        onClick={() => navigate('/council')}
      >
        View AI Council
      </button>

      <button
        className="plain-button"
        onClick={() => navigate('/withdraw')}
      >
        Withdraw Money
      </button>

      <button
        className="plain-button"
        onClick={() => navigate('/bank')}
      >
        Banking (Plaid)
      </button>

      <button
        className="plain-button"
        onClick={() => navigate('/settings')}
      >
        Settings
      </button>

      {/* Recent Trades */}
      <h2 className="medium-text" style={{ marginTop: '24px', fontWeight: '600' }}>
        Recent Trades
      </h2>
      <div className="trade-list">
        {trades.length === 0 ? (
          <p style={{ color: 'hsl(var(--muted-foreground))' }}>No trades yet</p>
        ) : (
          trades.map((trade) => (
            <div key={trade.id} className="trade-item">
              {trade.message}
              <span style={{ color: 'hsl(var(--muted-foreground))', marginLeft: '8px' }}>
                {new Date(trade.created_at).toLocaleTimeString()}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Logout */}
      <button
        className="plain-button"
        onClick={handleLogout}
        style={{ marginTop: '24px' }}
      >
        Logout
      </button>
    </div>
  );
}