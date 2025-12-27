import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft, 
  Check, 
  X, 
  Clock, 
  AlertTriangle, 
  PlayCircle, 
  Ban, 
  RefreshCw,
  User,
  Bot,
  Loader2
} from "lucide-react";
import { toast } from "sonner";

interface TradeIntent {
  id: string;
  user_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  order_type: string;
  quantity: number | null;
  notional_usd: number | null;
  limit_price: number | null;
  status: string;
  approve_threshold: number;
  approve_votes: number;
  deny_votes: number;
  created_by: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  executed_at: string | null;
}

interface IntentVote {
  id: string;
  intent_id: string;
  user_id: string;
  vote: 'approve' | 'deny';
  confidence: number | null;
  rationale: string | null;
  voter_type: string | null;
  created_at: string;
}

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
    case "approved":
      return <Badge className="gap-1 bg-green-600"><Check className="h-3 w-3" />Approved</Badge>;
    case "denied":
    case "rejected":
      return <Badge variant="destructive" className="gap-1"><X className="h-3 w-3" />Rejected</Badge>;
    case "executing":
      return <Badge className="gap-1 bg-blue-600"><PlayCircle className="h-3 w-3" />Executing</Badge>;
    case "executed":
      return <Badge className="gap-1 bg-green-700"><Check className="h-3 w-3" />Executed</Badge>;
    case "failed":
      return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Failed</Badge>;
    case "cancelled":
      return <Badge variant="outline" className="gap-1"><Ban className="h-3 w-3" />Cancelled</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function IntentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [intent, setIntent] = useState<TradeIntent | null>(null);
  const [votes, setVotes] = useState<IntentVote[]>([]);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIntent = async () => {
    if (!id || !user) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      
      if (!accessToken) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }
      
      // Fetch intent
      const intentResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/trade_intents?id=eq.${id}&select=*`,
        {
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );
      
      if (intentResponse.ok) {
        const intentData = await intentResponse.json();
        if (intentData.length > 0) {
          setIntent(intentData[0] as TradeIntent);
        } else {
          setError("Intent not found");
        }
      } else {
        setError("Failed to fetch intent");
      }
      
      // Fetch votes
      const votesResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/trade_intent_votes?intent_id=eq.${id}&select=*&order=created_at.desc`,
        {
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );
      
      if (votesResponse.ok) {
        const votesData = await votesResponse.json();
        setVotes(votesData as IntentVote[]);
      }
    } catch (e) {
      console.error('Failed to fetch intent:', e);
      setError("Failed to load intent details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntent();
  }, [id, user]);

  const castVote = async (vote: 'approve' | 'deny', confidence: number = 1) => {
    if (!user || !intent) return;
    
    setVoting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/trade_intent_votes`,
        {
          method: 'POST',
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            intent_id: intent.id,
            user_id: user.id,
            vote,
            confidence,
            voter_type: 'user',
          }),
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to cast vote');
      }
      
      toast.success(`Vote ${vote === 'approve' ? 'approved' : 'rejected'} recorded`);
      await fetchIntent();
    } catch (e) {
      console.error('Failed to cast vote:', e);
      toast.error('Failed to cast vote: ' + (e instanceof Error ? e.message : 'Unknown error'));
    } finally {
      setVoting(false);
    }
  };

  const cancelIntent = async () => {
    if (!user || !intent) return;
    
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/trade_intents?id=eq.${intent.id}&user_id=eq.${user.id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ status: 'cancelled' }),
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to cancel intent');
      }
      
      toast.success('Intent cancelled');
      await fetchIntent();
    } catch (e) {
      console.error('Failed to cancel intent:', e);
      toast.error('Failed to cancel intent');
    }
  };

  if (!user) {
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Please log in to view intent details.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <Card>
          <CardContent className="py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
            <p className="text-muted-foreground">Loading intent details...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !intent) {
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <Card>
          <CardContent className="py-8 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-2" />
            <p className="text-destructive">{error || "Intent not found"}</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate('/intents')}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Intents
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalVotes = intent.approve_votes + intent.deny_votes;
  const approvalPercentage = totalVotes > 0 ? (intent.approve_votes / totalVotes) * 100 : 0;
  const progressToApproval = (intent.approve_votes / intent.approve_threshold) * 100;
  
  const avgConfidence = votes.length > 0 
    ? votes.reduce((sum, v) => sum + (v.confidence || 1), 0) / votes.length 
    : 0;
    
  const userVotes = votes.filter(v => v.voter_type === 'user' || !v.voter_type);
  const botVotes = votes.filter(v => v.voter_type === 'bot');

  const executionResult = intent.metadata?.execution_result as { success?: boolean; error?: string; txid?: string } | undefined;

  return (
    <div className="container mx-auto p-4 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/intents')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Intent Details</h1>
        </div>
        <Button variant="outline" size="sm" onClick={fetchIntent}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Intent Summary */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-3">
                <span className={`text-xl ${intent.side === 'buy' ? 'text-green-600' : 'text-red-600'}`}>
                  {intent.side.toUpperCase()}
                </span>
                <span className="text-xl">{intent.symbol}</span>
                {getStatusBadge(intent.status)}
              </CardTitle>
              <CardDescription className="mt-1">
                Created {new Date(intent.created_at).toLocaleString()} by {intent.created_by}
              </CardDescription>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">${intent.notional_usd?.toFixed(2) || '0.00'}</p>
              <p className="text-sm text-muted-foreground">{intent.order_type} order</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Order Details */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Symbol</p>
              <p className="font-medium">{intent.symbol}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Order Type</p>
              <p className="font-medium">{intent.order_type}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Quantity</p>
              <p className="font-medium">{intent.quantity || 'Market'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Limit Price</p>
              <p className="font-medium">{intent.limit_price ? `$${intent.limit_price}` : 'N/A'}</p>
            </div>
          </div>

          {/* Action Buttons for Pending */}
          {intent.status === 'pending' && (
            <>
              <Separator />
              <div className="flex gap-3">
                <Button
                  className="flex-1 bg-green-600 hover:bg-green-700"
                  onClick={() => castVote('approve')}
                  disabled={voting}
                >
                  {voting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => castVote('deny')}
                  disabled={voting}
                >
                  {voting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <X className="h-4 w-4 mr-1" />}
                  Reject
                </Button>
                <Button
                  variant="outline"
                  onClick={cancelIntent}
                >
                  <Ban className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Risk Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Risk Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress to Approval</span>
              <span>{intent.approve_votes} / {intent.approve_threshold} votes</span>
            </div>
            <Progress value={Math.min(progressToApproval, 100)} className="h-3" />
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-muted-foreground">Approve Votes</p>
              <p className="text-xl font-bold text-green-600">{intent.approve_votes}</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-muted-foreground">Deny Votes</p>
              <p className="text-xl font-bold text-red-600">{intent.deny_votes}</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-muted-foreground">Approval %</p>
              <p className="text-xl font-bold">{approvalPercentage.toFixed(0)}%</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-muted-foreground">Avg Confidence</p>
              <p className="text-xl font-bold">{(avgConfidence * 100).toFixed(0)}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Vote Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Vote Breakdown</CardTitle>
          <CardDescription>
            {votes.length} total votes ({userVotes.length} user, {botVotes.length} bot)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {votes.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No votes yet</p>
          ) : (
            <div className="space-y-3">
              {votes.map((vote) => (
                <div key={vote.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {vote.voter_type === 'bot' ? (
                      <Bot className="h-5 w-5 text-blue-500" />
                    ) : (
                      <User className="h-5 w-5 text-gray-500" />
                    )}
                    <div>
                      <p className="font-medium capitalize">{vote.voter_type || 'User'}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(vote.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {vote.confidence && (
                      <div className="text-sm text-muted-foreground">
                        {(vote.confidence * 100).toFixed(0)}% confidence
                      </div>
                    )}
                    <Badge variant={vote.vote === 'approve' ? 'default' : 'destructive'} className="gap-1">
                      {vote.vote === 'approve' ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      {vote.vote}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Execution Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Execution Log</CardTitle>
        </CardHeader>
        <CardContent>
          {intent.status === 'pending' ? (
            <p className="text-muted-foreground text-center py-4">Awaiting approval</p>
          ) : intent.status === 'cancelled' ? (
            <p className="text-muted-foreground text-center py-4">Intent was cancelled</p>
          ) : intent.status === 'denied' || intent.status === 'rejected' ? (
            <p className="text-muted-foreground text-center py-4">Intent was rejected</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <Check className="h-5 w-5 text-green-500" />
                <div>
                  <p className="font-medium">Approved</p>
                  <p className="text-xs text-muted-foreground">
                    Threshold of {intent.approve_threshold} votes reached
                  </p>
                </div>
              </div>
              
              {(intent.status === 'executing' || intent.status === 'executed' || intent.status === 'failed') && (
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  {intent.status === 'executing' ? (
                    <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                  ) : intent.status === 'executed' ? (
                    <Check className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">
                      {intent.status === 'executing' ? 'Executing...' : intent.status === 'executed' ? 'Executed' : 'Failed'}
                    </p>
                    {intent.executed_at && (
                      <p className="text-xs text-muted-foreground">
                        {new Date(intent.executed_at).toLocaleString()}
                      </p>
                    )}
                    {executionResult?.txid && (
                      <p className="text-xs font-mono mt-1">
                        TXID: {executionResult.txid}
                      </p>
                    )}
                    {executionResult?.error && (
                      <p className="text-xs text-red-500 mt-1">
                        Error: {executionResult.error}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex gap-3">
        <Button variant="outline" asChild>
          <Link to="/intents">All Intents</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/logs">View Logs</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/dashboard">Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
