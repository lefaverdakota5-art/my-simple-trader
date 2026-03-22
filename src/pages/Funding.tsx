import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Wallet, Landmark, Smartphone, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface FundingEntry {
  id: string;
  method: "bank" | "apple_pay" | "google_wallet";
  amount: number;
  status: "queued" | "processed";
  createdAt: string;
}

export default function Funding() {
  const [amount, setAmount] = useState(50);
  const [bankName, setBankName] = useState("");
  const [entries, setEntries] = useState<FundingEntry[]>([]);

  const totalQueued = useMemo(
    () => entries.filter((entry) => entry.status === "queued").reduce((sum, entry) => sum + entry.amount, 0),
    [entries],
  );

  const addEntry = (method: FundingEntry["method"]) => {
    if (!amount || amount <= 0) {
      toast.error("Enter an amount greater than zero");
      return;
    }
    if (method === "bank" && !bankName.trim()) {
      toast.error("Enter a bank name");
      return;
    }

    const next: FundingEntry = {
      id: crypto.randomUUID(),
      method,
      amount,
      status: "queued",
      createdAt: new Date().toISOString(),
    };

    setEntries((prev) => [next, ...prev]);
    toast.success(`${labelForMethod(method)} funding request queued`);
  };

  const processEntry = (id: string) => {
    setEntries((prev) => prev.map((entry) => (entry.id === id ? { ...entry, status: "processed" } : entry)));
    toast.success("Funding request marked processed");
  };

  return (
    <div className="container mx-auto max-w-5xl p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Funding</h1>
        <p className="text-muted-foreground">Manage bank and wallet top-up flows inside the app.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader>
            <CardTitle>Add funds</CardTitle>
            <CardDescription>
              This screen gives you one place for bank transfer, Apple Pay style, and Google Wallet style funding flows.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (USD)</Label>
              <Input
                id="amount"
                type="number"
                min={1}
                step={1}
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              />
            </div>

            <Tabs defaultValue="bank" className="space-y-4">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="bank">Bank</TabsTrigger>
                <TabsTrigger value="apple">Apple Pay</TabsTrigger>
                <TabsTrigger value="wallet">Google Wallet</TabsTrigger>
              </TabsList>

              <TabsContent value="bank" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="bankName">Bank name</Label>
                  <Input
                    id="bankName"
                    placeholder="Chase, Chime, Wells Fargo, etc."
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                  />
                </div>
                <div className="rounded-lg border p-4 flex items-start gap-3">
                  <Landmark className="h-5 w-5 mt-0.5" />
                  <div>
                    <p className="font-medium">Universal bank entry</p>
                    <p className="text-sm text-muted-foreground">
                      Use this flow to queue a funding request for any checking or savings source you want to track in-app.
                    </p>
                  </div>
                </div>
                <Button onClick={() => addEntry("bank")} className="w-full">Queue bank funding</Button>
              </TabsContent>

              <TabsContent value="apple" className="space-y-4">
                <div className="rounded-lg border p-4 flex items-start gap-3">
                  <Smartphone className="h-5 w-5 mt-0.5" />
                  <div>
                    <p className="font-medium">Apple Pay style flow</p>
                    <p className="text-sm text-muted-foreground">
                      This app screen gives you a wallet-style entry point and records funding actions consistently with the rest of the UI.
                    </p>
                  </div>
                </div>
                <Button onClick={() => addEntry("apple_pay")} className="w-full">Queue Apple Pay funding</Button>
              </TabsContent>

              <TabsContent value="wallet" className="space-y-4">
                <div className="rounded-lg border p-4 flex items-start gap-3">
                  <Wallet className="h-5 w-5 mt-0.5" />
                  <div>
                    <p className="font-medium">Google Wallet style flow</p>
                    <p className="text-sm text-muted-foreground">
                      Use a wallet-style top-up entry and keep the status history visible directly in the app.
                    </p>
                  </div>
                </div>
                <Button onClick={() => addEntry("google_wallet")} className="w-full">Queue Google Wallet funding</Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Funding status</CardTitle>
            <CardDescription>Review funding requests and mark them complete.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4 flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 mt-0.5 text-green-600" />
              <div>
                <p className="font-medium">Queued total</p>
                <p className="text-2xl font-bold">${totalQueued.toFixed(2)}</p>
              </div>
            </div>

            <div className="space-y-3">
              {entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No funding requests yet.</p>
              ) : (
                entries.map((entry) => (
                  <div key={entry.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium">{labelForMethod(entry.method)}</p>
                        <p className="text-sm text-muted-foreground">${entry.amount.toFixed(2)} • {new Date(entry.createdAt).toLocaleString()}</p>
                      </div>
                      <Badge variant={entry.status === "processed" ? "default" : "secondary"}>
                        {entry.status}
                      </Badge>
                    </div>
                    {entry.status === "queued" && (
                      <Button size="sm" variant="outline" onClick={() => processEntry(entry.id)}>
                        Mark processed
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function labelForMethod(method: FundingEntry["method"]) {
  if (method === "bank") return "Bank funding";
  if (method === "apple_pay") return "Apple Pay";
  return "Google Wallet";
}
