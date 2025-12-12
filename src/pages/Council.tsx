import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTraderState } from '@/hooks/useTraderState';

const AI_NAMES = ['AI 1 (Local)', 'AI 2 (Grok)', 'AI 3 (Claude)', 'AI 4 (Gemini)', 'AI 5 (DeepSeek)'];

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

  // Parse council votes (e.g., "4/5")
  const votesStr = state?.council_votes || '0/5';
  const [yesVotes] = votesStr.split('/').map(Number);
  const isApproved = yesVotes >= 4;

  // Get reasons from state
  const reasons = state?.council_reasons || ['', '', '', '', ''];

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
        {AI_NAMES.map((name, index) => {
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
        Trade only executes if 4/5 or 5/5 YES
      </p>
    </div>
  );
}