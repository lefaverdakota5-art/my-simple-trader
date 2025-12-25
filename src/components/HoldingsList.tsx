import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Coins } from "lucide-react";

interface Holding {
  quantity: number;
  usd_value: number;
}

interface HoldingsListProps {
  holdings: Record<string, Holding>;
}

export function HoldingsList({ holdings }: HoldingsListProps) {
  const entries = Object.entries(holdings).filter(([_, h]) => h.quantity > 0);
  
  const formatMoney = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value || 0);
  };

  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Coins className="h-4 w-4" />
            Holdings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">No holdings</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Coins className="h-4 w-4" />
          Holdings ({entries.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {entries.map(([symbol, holding]) => (
            <div 
              key={symbol}
              className="flex items-center justify-between p-2 bg-muted/50 rounded-lg"
            >
              <div>
                <span className="font-medium">{symbol}</span>
                <span className="text-sm text-muted-foreground ml-2">
                  {holding.quantity.toFixed(6)}
                </span>
              </div>
              <span className="font-semibold">
                {formatMoney(holding.usd_value)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
