import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";
import type { RecentFill } from '@/hooks/usePortfolioSnapshot';

interface FillsListProps {
  fills: RecentFill[];
}

export function FillsList({ fills }: FillsListProps) {
  const formatMoney = (value: number | null) => {
    if (value === null) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  if (fills.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Recent Fills
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">No recent fills</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Recent Fills ({fills.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {fills.map((fill) => (
            <div 
              key={fill.id}
              className="p-2 bg-muted/50 rounded-lg"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Badge variant={fill.side === 'buy' ? 'default' : 'secondary'}>
                    {fill.side.toUpperCase()}
                  </Badge>
                  <span className="font-medium">{fill.pair}</span>
                </div>
                <span className="font-semibold">{formatMoney(fill.cost_usd)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {fill.volume.toFixed(6)} @ {formatMoney(fill.price)}
                </span>
                <div className="flex items-center gap-2">
                  {fill.fee_usd !== null && (
                    <span className="text-xs">Fee: {formatMoney(fill.fee_usd)}</span>
                  )}
                  {fill.realized_pnl !== null && (
                    <span className={fill.realized_pnl >= 0 ? 'text-green-600' : 'text-red-600'}>
                      P&L: {fill.realized_pnl >= 0 ? '+' : ''}{formatMoney(fill.realized_pnl)}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {fill.filled_at ? new Date(fill.filled_at).toLocaleString() : ''}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
