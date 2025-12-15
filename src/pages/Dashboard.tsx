import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTraderState } from '@/hooks/useTraderState';

export default function Dashboard() {
  const { user, loading: authLoading, signOut, initializeTraderState } = useAuth();
  const { state, trades, loading: stateLoading, toggleSwarm, toggleAutonomy } = useTraderState(user?.id || null);
  const navigate = useNavigate();

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