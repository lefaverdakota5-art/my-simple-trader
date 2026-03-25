import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTradeIntents } from "@/hooks/useTradeIntents";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  RefreshCw,
  Home,
  History,
  BarChart2,
  Check,
  X,
  Clock,
  AlertTriangle,
  PlayCircle,
  Ban,
  Loader2,
  Bot,
  User,
  Zap,
} from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "pending":
      return <Badge variant="secondary" className="gap-1 text-xs"><Clock className="h-3 w-3" />Pending</Badge>;
    case "approved":
      return <Badge className="gap-1 text-xs bg-green-600"><Check className="h-3 w-3" />Approved</Badge>;
    case "denied":
      return <Badge variant="destructive" className="gap-1 text-xs"><X className="h-3 w-3" />Denied</Badge>;
    case "executing":
      return <Badge className="gap-1 text-xs bg-blue-600"><PlayCircle className="h-3 w-3" />Executing</Badge>;
    case "executed":
      return <Badge className="gap-1 text-xs bg-green-700"><Check className="h-3 w-3" />Executed</Badge>;
    case "failed":
      return <Badge variant="destructive" className="gap-1 text-xs"><AlertTriangle className="h-3 w-3" />Failed</Badge>;
    case "cancelled":
      return <Badge variant="outline" className="gap-1 text-xs"><Ban className="h-3 w-3" />Cancelled</Badge>;
    default:
      return <Badge variant="secondary" className="text-xs">{status}</Badge>;
  }
}

export default function LiveActivity() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { intents, loading, voting, castVote, cancelIntent, refresh } = useTradeIntents(user?.id ?? null);

  const formatMoney = (value: number | null) =>
    value !== null
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value)
      : "-";

  const pendingIntents = intents.filter((i) => i.status === "pending");
  const activeIntents = intents.filter((i) => ["approved", "executing"].includes(i.status));
  const recentCompleted = intents
    .filter((i) => ["executed", "failed", "denied", "cancelled"].includes(i.status))
    .slice(0, 30);

  if (!user) {
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Please log in to view live activity.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Live Activity</h1>
            <p className="text-sm text-muted-foreground">Real-time bot decisions & trade monitoring</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-1">Refresh</span>
        </Button>
      </div>

      {/* Quick Links */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" asChild>
          <Link to="/dashboard"><Home className="h-4 w-4 mr-1" />Dashboard</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/trade-history"><History className="h-4 w-4 mr-1" />Trade History</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/bot-monitor"><BarChart2 className="h-4 w-4 mr-1" />Bot Monitor</Link>
        </Button>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-yellow-300 bg-yellow-50 dark:bg-yellow-950">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-300">{pendingIntents.length}</p>
            <p className="text-xs text-yellow-600 dark:text-yellow-400">Pending Votes</p>
          </CardContent>
        </Card>
        <Card className="border-blue-300 bg-blue-50 dark:bg-blue-950">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{activeIntents.length}</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">Executing</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">
              {intents.filter((i) => i.status === "executed").length}
            </p>
            <p className="text-xs text-muted-foreground">Executed Today</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{intents.length}</p>
            <p className="text-xs text-muted-foreground">Total Intents</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending Intents - Require voting */}
      {pendingIntents.length > 0 && (
        <Card className="border-yellow-300">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300">
              <Clock className="h-5 w-5" />
              Pending Vote ({pendingIntents.length})
            </CardTitle>
            <CardDescription>These intents need your approval to execute</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingIntents.map((intent) => {
              const totalVotes = intent.approve_votes + intent.deny_votes;
              const approvalPct = totalVotes > 0 ? (intent.approve_votes / totalVotes) * 100 : 0;
              return (
                <div
                  key={intent.id}
                  className="p-4 border rounded-lg bg-background cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => navigate(`/intents/${intent.id}`)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`font-bold text-lg ${
                            intent.side === "buy" ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {intent.side.toUpperCase()}
                        </span>
                        <span className="font-semibold">{intent.symbol}</span>
                        <StatusBadge status={intent.status} />
                        <Badge variant="outline" className="text-xs gap-1">
                          {intent.created_by === "bot" ? (
                            <Bot className="h-3 w-3" />
                          ) : (
                            <User className="h-3 w-3" />
                          )}
                          {intent.created_by}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatMoney(intent.notional_usd)} notional · {intent.order_type}
                        {intent.limit_price ? ` @ ${formatMoney(intent.limit_price)}` : ""}
                      </p>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>
                            {intent.approve_votes} approve / {intent.deny_votes} deny (need{" "}
                            {intent.approve_threshold})
                          </span>
                          <span>{approvalPct.toFixed(0)}% approval</span>
                        </div>
                        <Progress value={approvalPct} className="h-1.5" />
                      </div>
                      {intent.metadata?.rationale && (
                        <p className="text-xs text-muted-foreground italic truncate">
                          AI: "{String(intent.metadata.rationale)}"
                        </p>
                      )}
                    </div>
                    <div
                      className="flex gap-2 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600 border-green-600 hover:bg-green-50"
                        onClick={() => castVote(intent.id, "approve")}
                        disabled={voting === intent.id}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-600 hover:bg-red-50"
                        onClick={() => castVote(intent.id, "deny")}
                        disabled={voting === intent.id}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cancelIntent(intent.id)}
                        disabled={voting === intent.id}
                      >
                        <Ban className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Actively Executing */}
      {activeIntents.length > 0 && (
        <Card className="border-blue-300">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
              <Zap className="h-5 w-5" />
              Executing ({activeIntents.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeIntents.map((intent) => (
              <div
                key={intent.id}
                className="p-4 border rounded-lg bg-blue-50/50 dark:bg-blue-950/30 cursor-pointer"
                onClick={() => navigate(`/intents/${intent.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${intent.side === "buy" ? "text-green-600" : "text-red-600"}`}>
                      {intent.side.toUpperCase()}
                    </span>
                    <span className="font-semibold">{intent.symbol}</span>
                    <StatusBadge status={intent.status} />
                  </div>
                  <span className="text-sm text-muted-foreground">{formatMoney(intent.notional_usd)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Activity Log */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Recent Activity (last {recentCompleted.length})
          </CardTitle>
          <CardDescription>Last 30 completed intents</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p className="text-muted-foreground">Loading activity...</p>
            </div>
          ) : recentCompleted.length === 0 ? (
            <div className="text-center py-8">
              <Bot className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground">No completed activity yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Trade executions, denials, and cancellations will appear here
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-2">
                {recentCompleted.map((intent) => (
                  <div
                    key={intent.id}
                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/intents/${intent.id}`)}
                  >
                    <div className="shrink-0">
                      {intent.status === "executed" ? (
                        <Zap className="h-4 w-4 text-green-500" />
                      ) : intent.status === "failed" ? (
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                      ) : intent.status === "denied" ? (
                        <X className="h-4 w-4 text-red-400" />
                      ) : (
                        <Ban className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-sm font-semibold ${
                            intent.side === "buy" ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {intent.side.toUpperCase()}
                        </span>
                        <span className="text-sm font-medium">{intent.symbol}</span>
                        <StatusBadge status={intent.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatMoney(intent.notional_usd)} ·{" "}
                        {intent.executed_at
                          ? new Date(intent.executed_at).toLocaleString()
                          : new Date(intent.updated_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <Badge variant="outline" className="text-xs gap-1">
                        {intent.created_by === "bot" ? (
                          <Bot className="h-3 w-3" />
                        ) : (
                          <User className="h-3 w-3" />
                        )}
                        {intent.created_by}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
