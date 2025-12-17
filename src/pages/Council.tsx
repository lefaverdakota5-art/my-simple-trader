import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTraderState } from '@/hooks/useTraderState';

const DEFAULT_AI_NAMES = ['AI 1', 'AI 2', 'AI 3', 'AI 4', 'AI 5', 'AI 6', 'AI 7', 'AI 8', 'AI 9', 'AI 10'];

export default function Council() {
  const { user, loading: authLoading } = useAuth();
  const { state, loading: stateLoading } = useTraderState(user?.id || null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  if (authLoading || stateLoading) {
    return (
      <div className="app-container">
        <p className="big-text">Loading...</p>
      </div>
    );
  }

  // Parse council votes (e.g., "4/5" or "6/7")
  const votesStr = state?.council_votes || '0/5';
  const [yesVotesRaw, totalVotesRaw] = votesStr.split('/').map(Number);
  const yesVotes = Number.isFinite(yesVotesRaw) ? yesVotesRaw : 0;
  const totalVotes = Number.isFinite(totalVotesRaw) && totalVotesRaw > 0 ? totalVotesRaw : 5;
  const threshold = Math.ceil(totalVotes * 0.8); // 80% YES required
  const isApproved = yesVotes >= threshold;

  // Get reasons from state (variable length)
  const reasons = state?.council_reasons || [];
  const aiNames = Array.from({ length: Math.max(reasons.length, totalVotes) }).map(
    (_, i) => DEFAULT_AI_NAMES[i] || `AI ${i + 1}`,
  );

  return (
    <div className="app-container">
      <button
        className="plain-button"
        onClick={() => navigate('/dashboard')}
        style={{ marginBottom: '24px' }}
      >
        ← Back to Dashboard
      </button>

      <h1 className="big-text" style={{ marginBottom: '24px' }}>AI Council</h1>

      {/* AI Votes List */}
      <div style={{ marginBottom: '24px' }}>
        {aiNames.map((name, index) => {
          const reason = reasons[index] || 'Awaiting analysis...';
          const isYes = reason.toLowerCase().includes('yes') || 
                        reason.toLowerCase().startsWith('buy') ||
                        reason.toLowerCase().includes('bullish');
          
          return (
            <div 
              key={name} 
              style={{ 
                padding: '12px', 
                borderBottom: '1px solid hsl(var(--border))',
                marginBottom: '8px' 
              }}
            >
              <p style={{ fontWeight: '600', marginBottom: '4px' }}>
                {name}: <span style={{ color: isYes ? 'hsl(var(--success))' : 'hsl(var(--destructive))' }}>
                  {isYes ? 'YES' : 'NO'}
                </span>
              </p>
              <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem' }}>
                {reason || 'No reason provided'}
              </p>
            </div>
          );
        })}
      </div>

      {/* Council Vote Summary */}
      <p 
        className="big-text" 
        style={{ 
          color: isApproved ? 'hsl(var(--success))' : 'hsl(var(--destructive))',
          marginBottom: '16px'
        }}
      >
        Council Vote: {votesStr} YES
      </p>

      <p style={{ color: 'hsl(var(--muted-foreground))' }}>
        Trade only executes if {threshold}/{totalVotes} or higher YES (≥80%)
      </p>
    </div>
  );
}