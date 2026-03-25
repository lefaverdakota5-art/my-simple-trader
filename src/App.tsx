import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Council from "./pages/Council";
import Withdraw from "./pages/Withdraw";
import Install from "./pages/Install";
import Settings from "./pages/Settings";
import BotSettings from "./pages/BotSettings";
import CashOut from "./pages/CashOut";
import Intents from "./pages/Intents";
import IntentDetail from "./pages/IntentDetail";
import Logs from "./pages/Logs";
import TradeHistory from "./pages/TradeHistory";
import LiveActivity from "./pages/LiveActivity";
import BotMonitor from "./pages/BotMonitor";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/council" element={<Council />} />
          <Route path="/withdraw" element={<Withdraw />} />
          <Route path="/install" element={<Install />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/bot-settings" element={<BotSettings />} />
          <Route path="/cashout" element={<CashOut />} />
          <Route path="/intents" element={<Intents />} />
          <Route path="/intents/:id" element={<IntentDetail />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/trade-history" element={<TradeHistory />} />
          <Route path="/live-activity" element={<LiveActivity />} />
          <Route path="/bot-monitor" element={<BotMonitor />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
