import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLink, ArrowDownCircle, RefreshCw, ArrowUpCircle, TrendingUp } from "lucide-react";

export function KrakenLinks() {
  const links = [
    {
      label: 'Deposit',
      url: 'https://www.kraken.com/u/funding',
      icon: ArrowDownCircle,
      color: 'text-green-600 hover:bg-green-50',
    },
    {
      label: 'Convert',
      url: 'https://pro.kraken.com/app/trade',
      icon: RefreshCw,
      color: 'text-blue-600 hover:bg-blue-50',
    },
    {
      label: 'Withdraw',
      url: 'https://www.kraken.com/u/funding',
      icon: ArrowUpCircle,
      color: 'text-orange-600 hover:bg-orange-50',
    },
    {
      label: 'Markets',
      url: 'https://pro.kraken.com/app/trade',
      icon: TrendingUp,
      color: 'text-purple-600 hover:bg-purple-50',
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ExternalLink className="h-4 w-4" />
          Quick Links
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex flex-col items-center gap-1 p-3 rounded-lg border border-border transition-colors ${link.color}`}
            >
              <link.icon className="h-5 w-5" />
              <span className="text-sm font-medium">{link.label}</span>
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
