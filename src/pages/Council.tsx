import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTraderState } from '@/hooks/useTraderState';

const DEFAULT_AI_NAMES = [
  'Momentum Analyst',
  'Risk Manager', 
  'Technical Analyst',
  'Volatility Guard',
  'Portfolio Guardian',
  'Top Trader Analyst',
  'OpenAI Strategist',
];

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

  // Get reasons from state - parse AI name from reason string
  const reasons = state?.council_reasons || [];
  const parsedVotes = reasons.map((reason, index) => {
    // Parse format: "YES: AI Name • explanation" or "NO: AI Name • explanation"
    const isYes = reason.toUpperCase().startsWith('YES');
    const parts = reason.split('•');
    const nameMatch = reason.match(/^(YES|NO):\s*([^•]+)/i);
    const aiName = nameMatch ? nameMatch[2].trim() : DEFAULT_AI_NAMES[index] || `AI ${index + 1}`;
    const explanation = parts.length > 1 ? parts.slice(1).join('•').trim() : reason;
    
    return { aiName, isYes, explanation, fullReason: reason };
  });

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
        {parsedVotes.length > 0 ? parsedVotes.map((vote, index) => (
          <div 
            key={index} 
            style={{ 
              padding: '12px', 
              borderBottom: '1px solid hsl(var(--border))',
              marginBottom: '8px' 
            }}
          >
            <p style={{ fontWeight: '600', marginBottom: '4px' }}>
              {vote.aiName}: <span style={{ color: vote.isYes ? 'hsl(var(--success))' : 'hsl(var(--destructive))' }}>
                {vote.isYes ? 'YES' : 'NO'}
              </span>
            </p>
            <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem' }}>
              {vote.explanation}
            </p>
          </div>
        )) : (
          <p style={{ color: 'hsl(var(--muted-foreground))' }}>
            Awaiting council analysis... Enable the swarm to see AI votes.
          </p>
        )}
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

      <p style={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.875rem', marginTop: '12px' }}>
        Council includes: 5 core AIs + Top Trader Analyst (follows profitable traders) + OpenAI Strategist (if enabled)
      </p>

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