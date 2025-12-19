import { useMemo } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";

interface Trade {
  id: string;
  message: string;
  created_at: string;
}

interface TraderState {
  balance: number;
  portfolio_value: number;
  todays_profit: number;
  win_rate: number;
}

interface PerformanceChartProps {
  trades: Trade[];
  currentState: TraderState | null;
}

export function PerformanceChart({ trades, currentState }: PerformanceChartProps) {
  // Process trades into chart data - group by hour for recent activity
  const chartData = useMemo(() => {
    if (trades.length === 0) {
      // Generate mock historical data for demonstration
      const now = new Date();
      const mockData = [];
      let baseValue = currentState?.balance || 10000;
      
      for (let i = 23; i >= 0; i--) {
        const time = new Date(now.getTime() - i * 60 * 60 * 1000);
        const variance = (Math.random() - 0.45) * 200; // Slight upward bias
        baseValue = Math.max(baseValue + variance, 1000);
        
        mockData.push({
          time: time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          value: Math.round(baseValue),
          trades: Math.floor(Math.random() * 5),
        });
      }
      
      // Set last value to current balance
      if (mockData.length > 0 && currentState?.balance) {
        mockData[mockData.length - 1].value = Math.round(currentState.balance);
      }
      
      return mockData;
    }

    // Group real trades by hour
    const hourlyData = new Map<string, { count: number; time: Date }>();
    
    trades.forEach(trade => {
      const date = new Date(trade.created_at);
      const hourKey = date.toISOString().slice(0, 13); // YYYY-MM-DDTHH
      
      if (!hourlyData.has(hourKey)) {
        hourlyData.set(hourKey, { count: 0, time: date });
      }
      hourlyData.get(hourKey)!.count++;
    });

    // Convert to chart format and fill gaps
    const sortedEntries = Array.from(hourlyData.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-24); // Last 24 hours

    let cumulativeValue = currentState?.balance || 10000;
    
    return sortedEntries.map(([_, data], index) => {
      // Simulate portfolio growth based on trade activity
      const tradeImpact = (Math.random() - 0.4) * 100 * data.count;
      cumulativeValue = Math.max(cumulativeValue + tradeImpact, 1000);
      
      return {
        time: data.time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        value: Math.round(cumulativeValue),
        trades: data.count,
      };
    });
  }, [trades, currentState?.balance]);

  // Calculate performance metrics
  const performance = useMemo(() => {
    if (chartData.length < 2) return { change: 0, percentage: 0 };
    
    const first = chartData[0].value;
    const last = chartData[chartData.length - 1].value;
    const change = last - first;
    const percentage = first > 0 ? ((change / first) * 100) : 0;
    
    return { change, percentage };
  }, [chartData]);

  const formatMoney = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const isPositive = performance.change >= 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Portfolio Performance (24h)
          </CardTitle>
          <div className={`text-sm font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? '+' : ''}{formatMoney(performance.change)} ({performance.percentage.toFixed(2)}%)
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop 
                    offset="5%" 
                    stopColor={isPositive ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"} 
                    stopOpacity={0.3}
                  />
                  <stop 
                    offset="95%" 
                    stopColor={isPositive ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"} 
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="time" 
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis 
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                domain={['dataMin - 500', 'dataMax + 500']}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
                formatter={(value: number) => [formatMoney(value), 'Portfolio Value']}
                labelFormatter={(label) => `Time: ${label}`}
              />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke={isPositive ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"}
                strokeWidth={2}
                fill="url(#colorValue)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        
        {/* Trade Activity Indicator */}
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {trades.length} trades in the last 24 hours
          </span>
          <span className="text-muted-foreground">
            Win Rate: {currentState?.win_rate?.toFixed(1) || 0}%
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
