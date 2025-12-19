import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTraderState } from '@/hooks/useTraderState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  TrendingDown, 
  Brain, 
  Newspaper, 
  Anchor, 
  Layers, 
  RefreshCw,
  Grid3X3,
  Zap,
  Activity,
  Heart,
  Globe,
  DollarSign,
  Rocket,
  Bot,
  Shield,
  Target,
  BarChart3,
  ArrowLeft
} from 'lucide-react';

const AI_COUNCIL_CONFIG = [
  // Core Analysts
  { name: 'Momentum Analyst', icon: TrendingUp, category: 'Core', color: 'text-blue-500' },
  { name: 'Risk Manager', icon: Shield, category: 'Core', color: 'text-red-500' },
  { name: 'Technical Analyst', icon: BarChart3, category: 'Core', color: 'text-purple-500' },
  { name: 'Volatility Guard', icon: Activity, category: 'Core', color: 'text-orange-500' },
  { name: 'Portfolio Guardian', icon: Target, category: 'Core', color: 'text-green-500' },
  // AI Analysts (Lovable AI powered)
  { name: 'Top Trader Analyst', icon: Brain, category: 'AI', color: 'text-yellow-500' },
  { name: 'News Sentiment AI', icon: Newspaper, category: 'AI', color: 'text-cyan-500' },
  { name: 'Whale Tracker AI', icon: Anchor, category: 'AI', color: 'text-indigo-500' },
  { name: 'DeFi Protocol AI', icon: Layers, category: 'AI', color: 'text-pink-500' },
  { name: 'Contrarian Analyst', icon: RefreshCw, category: 'AI', color: 'text-amber-500' },
  { name: 'Fear & Greed Index', icon: Heart, category: 'AI', color: 'text-red-400' },
  { name: 'Macro Economist', icon: Globe, category: 'AI', color: 'text-blue-400' },
  // Trading Bots
  { name: 'Grid Trading Bot', icon: Grid3X3, category: 'Bot', color: 'text-emerald-500' },
  { name: 'Scalping Bot', icon: Zap, category: 'Bot', color: 'text-rose-500' },
  { name: 'Mean Reversion Bot', icon: Activity, category: 'Bot', color: 'text-violet-500' },
  { name: 'DCA Bot', icon: DollarSign, category: 'Bot', color: 'text-green-400' },
  { name: 'Momentum Breakout', icon: Rocket, category: 'Bot', color: 'text-orange-400' },
  // Pro-Level AI (Gemini 2.5 Pro powered)
  { name: 'Master Strategist', icon: Brain, category: 'Pro', color: 'text-gradient-to-r from-purple-500 to-pink-500' },
  { name: 'AI Risk Assessor', icon: Shield, category: 'Pro', color: 'text-gradient-to-r from-red-500 to-orange-500' },
  { name: 'Pattern Recognition', icon: BarChart3, category: 'Pro', color: 'text-gradient-to-r from-blue-500 to-cyan-500' },
  // Real-time Search (Perplexity powered)
  { name: 'Live News Search', icon: Globe, category: 'Search', color: 'text-teal-400' },
  // Final Strategist
  { name: 'AI Strategist', icon: Bot, category: 'AI', color: 'text-teal-500' },
];

function getAiConfig(name: string) {
  return AI_COUNCIL_CONFIG.find(c => 
    name.toLowerCase().includes(c.name.toLowerCase().split(' ')[0].toLowerCase())
  ) || { name, icon: Brain, category: 'Unknown', color: 'text-gray-500' };
}

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
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-foreground mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading council...</p>
        </div>
      </div>
    );
  }

  // Parse council votes (e.g., "4/5" or "14/17")
  const votesStr = state?.council_votes || '0/5';
  const [yesVotesRaw, totalVotesRaw] = votesStr.split('/').map(Number);
  const yesVotes = Number.isFinite(yesVotesRaw) ? yesVotesRaw : 0;
  const totalVotes = Number.isFinite(totalVotesRaw) && totalVotesRaw > 0 ? totalVotesRaw : 5;
  const threshold = Math.ceil(totalVotes * 0.8); // 80% YES required
  const isApproved = yesVotes >= threshold;
  const approvalPct = totalVotes > 0 ? (yesVotes / totalVotes * 100) : 0;

  // Get reasons from state - parse AI name from reason string
  const reasons = state?.council_reasons || [];
  const parsedVotes = reasons.map((reason, index) => {
    // Parse format: "YES: AI Name • explanation" or "NO: AI Name • explanation"
    const isYes = reason.toUpperCase().startsWith('YES');
    const nameMatch = reason.match(/^(YES|NO):\s*([^•]+)/i);
    const aiName = nameMatch ? nameMatch[2].trim() : `AI ${index + 1}`;
    const parts = reason.split('•');
    const explanation = parts.length > 1 ? parts.slice(1).join('•').trim() : reason;
    const config = getAiConfig(aiName);
    
    return { aiName, isYes, explanation, fullReason: reason, config };
  });

  // Group votes by category
  const coreVotes = parsedVotes.filter(v => v.config.category === 'Core');
  const aiVotes = parsedVotes.filter(v => v.config.category === 'AI');
  const botVotes = parsedVotes.filter(v => v.config.category === 'Bot');
  const optionalVotes = parsedVotes.filter(v => v.config.category === 'Optional');

  const VoteCard = ({ vote }: { vote: typeof parsedVotes[0] }) => {
    const Icon = vote.config.icon;
    return (
      <div className={`p-3 rounded-lg border ${vote.isYes ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`h-4 w-4 ${vote.config.color}`} />
          <span className="font-semibold text-sm">{vote.aiName}</span>
          <Badge variant={vote.isYes ? "default" : "destructive"} className="ml-auto text-xs">
            {vote.isYes ? 'YES' : 'NO'}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{vote.explanation}</p>
      </div>
    );
  };

  const VoteSection = ({ title, votes, icon: SectionIcon }: { title: string; votes: typeof parsedVotes; icon: typeof Brain }) => {
    if (votes.length === 0) return null;
    const yesCount = votes.filter(v => v.isYes).length;
    return (
      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <SectionIcon className="h-4 w-4" />
            {title}
            <Badge variant="outline" className="ml-auto">
              {yesCount}/{votes.length} YES
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {votes.map((vote, index) => (
            <VoteCard key={index} vote={vote} />
          ))}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/dashboard')}
          className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl md:text-3xl font-bold">AI Council</h1>
      </div>

      {/* Council Vote Summary */}
      <Card className={`mb-6 ${isApproved ? 'border-green-500/50' : 'border-red-500/50'}`}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-3xl font-bold">{votesStr}</p>
              <p className="text-muted-foreground">Council Vote</p>
            </div>
            <Badge 
              variant={isApproved ? "default" : "destructive"} 
              className="text-lg px-4 py-2"
            >
              {isApproved ? '✓ APPROVED' : '✗ REJECTED'}
            </Badge>
          </div>
          
          {/* Progress bar */}
          <div className="w-full bg-muted rounded-full h-3 mb-2">
            <div 
              className={`h-3 rounded-full transition-all ${isApproved ? 'bg-green-500' : 'bg-red-500'}`}
              style={{ width: `${approvalPct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{approvalPct.toFixed(0)}% approval</span>
            <span>Need {threshold}/{totalVotes} (≥80%)</span>
          </div>
        </CardContent>
      </Card>

      {/* AI Council Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-green-500">{parsedVotes.filter(v => v.isYes).length}</p>
            <p className="text-xs text-muted-foreground">YES Votes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-red-500">{parsedVotes.filter(v => !v.isYes).length}</p>
            <p className="text-xs text-muted-foreground">NO Votes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{totalVotes}</p>
            <p className="text-xs text-muted-foreground">Total Members</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{threshold}</p>
            <p className="text-xs text-muted-foreground">Needed for Trade</p>
          </CardContent>
        </Card>
      </div>

      {/* Vote Sections */}
      {parsedVotes.length > 0 ? (
        <>
          <VoteSection title="Core Analysts" votes={coreVotes} icon={Shield} />
          <VoteSection title="AI Analysts" votes={aiVotes} icon={Brain} />
          <VoteSection title="Trading Bots" votes={botVotes} icon={Bot} />
          <VoteSection title="Optional" votes={optionalVotes} icon={Zap} />
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              Awaiting council analysis... Enable the swarm to see AI votes.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Council Members Info */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-sm">Council Members</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {AI_COUNCIL_CONFIG.map((config, i) => {
              const Icon = config.icon;
              return (
                <Badge key={i} variant="outline" className="flex items-center gap-1">
                  <Icon className={`h-3 w-3 ${config.color}`} />
                  <span className="text-xs">{config.name}</span>
                </Badge>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            5 Core Analysts + 7 AI Analysts + 5 Trading Bots + OpenAI (if enabled) = Up to 18 council members
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
