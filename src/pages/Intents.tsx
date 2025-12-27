import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTradeIntents } from "@/hooks/useTradeIntents";
import { useBotConfig } from "@/hooks/useBotConfig";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X, Clock, AlertTriangle, PlayCircle, Ban, RefreshCw, Plus, Settings, Home, FileText, Eye } from "lucide-react";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
    case "approved":
      return <Badge className="gap-1 bg-green-600"><Check className="h-3 w-3" />Approved</Badge>;
    case "denied":
      return <Badge variant="destructive" className="gap-1"><X className="h-3 w-3" />Denied</Badge>;
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

export default function Intents() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { intents, loading, voting, castVote, createIntent, cancelIntent, refresh } = useTradeIntents(user?.id || null);
  const { config, loading: configLoading, updateConfig, saving } = useBotConfig(user?.id || null);
  
  const [newIntentOpen, setNewIntentOpen] = useState(false);
  const [newIntent, setNewIntent] = useState({
    symbol: "BTC/USD",
    side: "buy" as "buy" | "sell",
    notional_usd: 10,
  });

  const handleCreateIntent = async () => {
    const result = await createIntent({
      symbol: newIntent.symbol,
      side: newIntent.side,
      notional_usd: newIntent.notional_usd,
    });
    if (result) {
      setNewIntentOpen(false);
      setNewIntent({ symbol: "BTC/USD", side: "buy", notional_usd: 10 });
    }
  };

  const pendingIntents = intents.filter(i => i.status === "pending");
  const activeIntents = intents.filter(i => ["approved", "executing"].includes(i.status));
  const completedIntents = intents.filter(i => ["executed", "failed", "denied", "cancelled"].includes(i.status));

  if (!user) {
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Please log in to view trade intents.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trade Intents</h1>
          <p className="text-muted-foreground">Vote on and manage trading decisions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Dialog open={newIntentOpen} onOpenChange={setNewIntentOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                New Intent
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Trade Intent</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Symbol</Label>
                  <Input
                    value={newIntent.symbol}
                    onChange={e => setNewIntent(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                    placeholder="BTC/USD"
                  />
                </div>
                <div>
                  <Label>Side</Label>
                  <Select value={newIntent.side} onValueChange={v => setNewIntent(prev => ({ ...prev, side: v as "buy" | "sell" }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buy">Buy</SelectItem>
                      <SelectItem value="sell">Sell</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Amount (USD)</Label>
                  <Input
                    type="number"
                    value={newIntent.notional_usd}
                    onChange={e => setNewIntent(prev => ({ ...prev, notional_usd: parseFloat(e.target.value) || 0 }))}
                    min={1}
                    step={1}
                  />
                </div>
                <Button className="w-full" onClick={handleCreateIntent}>
                  Create Intent
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link to="/dashboard"><Home className="h-4 w-4 mr-1" />Dashboard</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/logs"><FileText className="h-4 w-4 mr-1" />Logs</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/settings"><Settings className="h-4 w-4 mr-1" />Settings</Link>
        </Button>
      </div>

      {/* Bot Config Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Trading Settings
          </CardTitle>
          <CardDescription>Configure voting and execution preferences</CardDescription>
        </CardHeader>
        <CardContent>
          {configLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : config ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">Voting Enabled</p>
                  <p className="text-sm text-muted-foreground">Require approval for trades</p>
                </div>
                <Switch
                  checked={(config as any).voting_enabled ?? true}
                  onCheckedChange={v => updateConfig({ voting_enabled: v } as any)}
                  disabled={saving}
                />
              </div>
              
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">Auto-Approve</p>
                  <p className="text-sm text-muted-foreground">Auto-approve bot intents</p>
                </div>
                <Switch
                  checked={(config as any).auto_approve_enabled ?? false}
                  onCheckedChange={v => updateConfig({ auto_approve_enabled: v } as any)}
                  disabled={saving}
                />
              </div>
              
              <div className="flex items-center justify-between p-3 border rounded-lg bg-amber-50 dark:bg-amber-950">
                <div>
                  <p className="font-medium text-amber-700 dark:text-amber-300">Dry Run Mode</p>
                  <p className="text-sm text-amber-600 dark:text-amber-400">Simulate trades only</p>
                </div>
                <Switch
                  checked={(config as any).dry_run ?? true}
                  onCheckedChange={v => updateConfig({ dry_run: v } as any)}
                  disabled={saving}
                />
              </div>
              
              <div className="p-3 border rounded-lg">
                <Label>Max Notional per Order ($)</Label>
                <Input
                  type="number"
                  value={(config as any).max_notional_per_order_usd ?? 100}
                  onChange={e => updateConfig({ max_notional_per_order_usd: parseFloat(e.target.value) } as any)}
                  min={1}
                  step={10}
                  className="mt-1"
                />
              </div>
              
              <div className="p-3 border rounded-lg">
                <Label>Max Open Orders</Label>
                <Input
                  type="number"
                  value={(config as any).max_open_orders ?? 5}
                  onChange={e => updateConfig({ max_open_orders: parseInt(e.target.value) } as any)}
                  min={1}
                  max={20}
                  className="mt-1"
                />
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">No configuration found</p>
          )}
        </CardContent>
      </Card>

      {/* Intents Tabs */}
      <Tabs defaultValue="pending">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending" className="gap-1">
            Pending {pendingIntents.length > 0 && <Badge variant="secondary">{pendingIntents.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="active" className="gap-1">
            Active {activeIntents.length > 0 && <Badge variant="secondary">{activeIntents.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-3">
          {loading ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Loading...</CardContent></Card>
          ) : pendingIntents.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No pending intents</CardContent></Card>
          ) : (
            pendingIntents.map(intent => (
                <Card key={intent.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(`/intents/${intent.id}`)}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${intent.side === 'buy' ? 'text-green-600' : 'text-red-600'}`}>
                          {intent.side.toUpperCase()}
                        </span>
                        <span className="font-medium">{intent.symbol}</span>
                        {getStatusBadge(intent.status)}
                        <Badge variant="outline">{intent.created_by}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        ${intent.notional_usd?.toFixed(2) || '0.00'} • {intent.order_type}
                        {intent.limit_price && ` @ $${intent.limit_price}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Votes: {intent.approve_votes} approve / {intent.deny_votes} deny (need {intent.approve_threshold})
                      </p>
                    </div>
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600 border-green-600 hover:bg-green-50"
                        onClick={() => castVote(intent.id, 'approve')}
                        disabled={voting === intent.id}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-600 hover:bg-red-50"
                        onClick={() => castVote(intent.id, 'deny')}
                        disabled={voting === intent.id}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Deny
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cancelIntent(intent.id)}
                      >
                        <Ban className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="active" className="space-y-3">
          {activeIntents.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No active intents</CardContent></Card>
          ) : (
            activeIntents.map(intent => (
              <Card key={intent.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${intent.side === 'buy' ? 'text-green-600' : 'text-red-600'}`}>
                          {intent.side.toUpperCase()}
                        </span>
                        <span className="font-medium">{intent.symbol}</span>
                        {getStatusBadge(intent.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        ${intent.notional_usd?.toFixed(2) || '0.00'} • {intent.order_type}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-3">
          {completedIntents.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">No history</CardContent></Card>
          ) : (
            completedIntents.slice(0, 20).map(intent => (
              <Card key={intent.id} className="opacity-75">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${intent.side === 'buy' ? 'text-green-600' : 'text-red-600'}`}>
                          {intent.side.toUpperCase()}
                        </span>
                        <span className="font-medium">{intent.symbol}</span>
                        {getStatusBadge(intent.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        ${intent.notional_usd?.toFixed(2) || '0.00'} • 
                        {intent.executed_at && ` Executed: ${new Date(intent.executed_at).toLocaleString()}`}
                      </p>
                      {intent.status === 'failed' && intent.metadata?.execution_result && (
                        <p className="text-xs text-red-500">
                          Error: {(intent.metadata.execution_result as any)?.error || 'Unknown'}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
