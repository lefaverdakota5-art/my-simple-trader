import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList } from "lucide-react";
import type { OpenOrder } from '@/hooks/usePortfolioSnapshot';

interface OrdersListProps {
  orders: OpenOrder[];
}

export function OrdersList({ orders }: OrdersListProps) {
  const formatMoney = (value: number | null) => {
    if (value === null) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  if (orders.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            Open Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">No open orders</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          Open Orders ({orders.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {orders.map((order) => (
            <div 
              key={order.id}
              className="flex items-center justify-between p-2 bg-muted/50 rounded-lg"
            >
              <div className="flex items-center gap-2">
                <Badge variant={order.side === 'buy' ? 'default' : 'secondary'}>
                  {order.side.toUpperCase()}
                </Badge>
                <span className="font-medium">{order.pair}</span>
                <span className="text-sm text-muted-foreground">
                  {order.volume.toFixed(6)}
                </span>
              </div>
              <div className="text-right">
                <span className="font-semibold">{formatMoney(order.price)}</span>
                <Badge variant="outline" className="ml-2 text-xs">
                  {order.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
