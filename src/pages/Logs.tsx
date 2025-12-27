import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ArrowLeft, 
  Check, 
  X, 
  Clock, 
  AlertTriangle, 
  PlayCircle, 
  RefreshCw,
  Activity,
  Vote,
  Zap,
  Home,
  Loader2
} from "lucide-react";

interface IntentLog {
  id: string;
  intent_id: string;
  event_type: 'created' | 'vote' | 'status_change' | 'executed' | 'failed';
  old_status?: string;
  new_status?: string;
  vote?: 'approve' | 'deny';
  voter_type?: string;
  details?: Record<string, unknown>;
  created_at: string;
  symbol?: string;
  side?: string;
}

interface TradeIntent {
  id: string;
  symbol: string;
  side: string;
  status: string;
  created_at: string;
  updated_at: string;
  executed_at: string | null;
  metadata: Record<string, unknown>;
  approve_votes: number;
  deny_votes: number;
}

interface IntentVote {
  id: string;
  intent_id: string;
  vote: string;
  voter_type: string | null;
  confidence: number | null;
  created_at: string;
}

export default function Logs() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [intents, setIntents] = useState<TradeIntent[]>([]);
  const [votes, setVotes] = useState<IntentVote[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");

  const fetchData = useCallback(async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      
      if (!accessToken) {
        setLoading(false);
        return;
      }
      
      // Fetch all intents
      const intentsResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/trade_intents?user_id=eq.${user.id}&select=*&order=created_at.desc&limit=100`,
        {
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );
      
      if (intentsResponse.ok) {
        const data = await intentsResponse.json();
        setIntents(data);
      }
      
      // Fetch all votes
      const votesResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/trade_intent_votes?select=*&order=created_at.desc&limit=200`,
        {
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );
      
      if (votesResponse.ok) {
        const data = await votesResponse.json();
        setVotes(data);
      }
    } catch (e) {
      console.error('Failed to fetch logs:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Build unified log from intents and votes
  const buildLogs = (): IntentLog[] => {
    const logs: IntentLog[] = [];
    
    // Add intent creation events
    for (const intent of intents) {
      logs.push({
        id: `created-${intent.id}`,
        intent_id: intent.id,
        event_type: 'created',
        new_status: 'pending',
        created_at: intent.created_at,
        symbol: intent.symbol,
        side: intent.side,
      });
      
      // Add status change if executed or failed
      if (intent.status === 'executed' && intent.executed_at) {
        logs.push({
          id: `executed-${intent.id}`,
          intent_id: intent.id,
          event_type: 'executed',
          old_status: 'approved',
          new_status: 'executed',
          created_at: intent.executed_at,
          symbol: intent.symbol,
          side: intent.side,
          details: intent.metadata?.execution_result as Record<string, unknown>,
        });
      }
      
      if (intent.status === 'failed') {
        logs.push({
          id: `failed-${intent.id}`,
          intent_id: intent.id,
          event_type: 'failed',
          old_status: 'executing',
          new_status: 'failed',
          created_at: intent.updated_at,
          symbol: intent.symbol,
          side: intent.side,
          details: intent.metadata?.execution_result as Record<string, unknown>,
        });
      }
      
      if (['approved', 'denied', 'rejected', 'cancelled'].includes(intent.status)) {
        logs.push({
          id: `status-${intent.id}`,
          intent_id: intent.id,
          event_type: 'status_change',
          old_status: 'pending',
          new_status: intent.status,
          created_at: intent.updated_at,
          symbol: intent.symbol,
          side: intent.side,
        });
      }
    }
    
    // Add vote events
    for (const vote of votes) {
      const intent = intents.find(i => i.id === vote.intent_id);
      logs.push({
        id: `vote-${vote.id}`,
        intent_id: vote.intent_id,
        event_type: 'vote',
        vote: vote.vote as 'approve' | 'deny',
        voter_type: vote.voter_type || 'user',
        created_at: vote.created_at,
        symbol: intent?.symbol,
        side: intent?.side,
        details: { confidence: vote.confidence },
      });
    }
    
    // Sort by date descending
    return logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  };

  const allLogs = buildLogs();
  const executionLogs = allLogs.filter(l => ['executed', 'failed'].includes(l.event_type));
  const voteLogs = allLogs.filter(l => l.event_type === 'vote');
  const stateChangeLogs = allLogs.filter(l => ['status_change', 'created'].includes(l.event_type));

  const getLogsForTab = () => {
    switch (activeTab) {
      case 'execution': return executionLogs;
      case 'votes': return voteLogs;
      case 'state': return stateChangeLogs;
      default: return allLogs;
    }
  };

  const getEventIcon = (log: IntentLog) => {
    switch (log.event_type) {
      case 'created':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'vote':
        return log.vote === 'approve' 
          ? <Check className="h-4 w-4 text-green-500" /> 
          : <X className="h-4 w-4 text-red-500" />;
      case 'status_change':
        if (log.new_status === 'approved') return <Check className="h-4 w-4 text-green-500" />;
        if (log.new_status === 'cancelled') return <X className="h-4 w-4 text-gray-500" />;
        return <Activity className="h-4 w-4 text-blue-500" />;
      case 'executed':
        return <Zap className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getEventTitle = (log: IntentLog) => {
    switch (log.event_type) {
      case 'created':
        return `Intent Created: ${log.side?.toUpperCase()} ${log.symbol}`;
      case 'vote':
        return `${log.voter_type === 'bot' ? 'Bot' : 'User'} voted ${log.vote}`;
      case 'status_change':
        return `Status: ${log.old_status} → ${log.new_status}`;
      case 'executed':
        return `Executed: ${log.side?.toUpperCase()} ${log.symbol}`;
      case 'failed':
        return `Failed: ${log.side?.toUpperCase()} ${log.symbol}`;
      default:
        return log.event_type;
    }
  };

  if (!user) {
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Please log in to view logs.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/intents')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Activity Logs</h1>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-1">Refresh</span>
        </Button>
      </div>

      {/* Quick Links */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link to="/dashboard"><Home className="h-4 w-4 mr-1" />Dashboard</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/intents"><Vote className="h-4 w-4 mr-1" />Intents</Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{intents.length}</p>
            <p className="text-sm text-muted-foreground">Total Intents</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">
              {intents.filter(i => i.status === 'executed').length}
            </p>
            <p className="text-sm text-muted-foreground">Executed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600">
              {intents.filter(i => i.status === 'failed').length}
            </p>
            <p className="text-sm text-muted-foreground">Failed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{votes.length}</p>
            <p className="text-sm text-muted-foreground">Total Votes</p>
          </CardContent>
        </Card>
      </div>

      {/* Logs Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>Event Log</CardTitle>
          <CardDescription>All intent state transitions, votes, and execution events</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all">All ({allLogs.length})</TabsTrigger>
              <TabsTrigger value="execution">Execution ({executionLogs.length})</TabsTrigger>
              <TabsTrigger value="votes">Votes ({voteLogs.length})</TabsTrigger>
              <TabsTrigger value="state">State ({stateChangeLogs.length})</TabsTrigger>
            </TabsList>
            
            <TabsContent value={activeTab} className="mt-4">
              {loading ? (
                <div className="text-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                  <p className="text-muted-foreground">Loading logs...</p>
                </div>
              ) : getLogsForTab().length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No events found</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {getLogsForTab().slice(0, 100).map((log) => (
                      <div 
                        key={log.id} 
                        className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                        onClick={() => navigate(`/intents/${log.intent_id}`)}
                      >
                        {getEventIcon(log)}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {getEventTitle(log)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(log.created_at).toLocaleString()}
                          </p>
                          {log.details && (log.details as { confidence?: number }).confidence !== undefined && (
                            <p className="text-xs text-muted-foreground">
                              Confidence: {((log.details as { confidence?: number }).confidence || 1) * 100}%
                            </p>
                          )}
                          {log.event_type === 'failed' && log.details && (
                            <p className="text-xs text-red-500">
                              {(log.details as { error?: string }).error || 'Unknown error'}
                            </p>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {log.event_type}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
