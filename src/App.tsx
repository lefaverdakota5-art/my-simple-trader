import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Council = lazy(() => import("./pages/Council"));
const Withdraw = lazy(() => import("./pages/Withdraw"));
const Install = lazy(() => import("./pages/Install"));
const Settings = lazy(() => import("./pages/Settings"));
const BotSettings = lazy(() => import("./pages/BotSettings"));
const CashOut = lazy(() => import("./pages/CashOut"));
const Intents = lazy(() => import("./pages/Intents"));
const IntentDetail = lazy(() => import("./pages/IntentDetail"));
const Logs = lazy(() => import("./pages/Logs"));
const TradeHistory = lazy(() => import("./pages/TradeHistory"));
const LiveActivity = lazy(() => import("./pages/LiveActivity"));
const BotMonitor = lazy(() => import("./pages/BotMonitor"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-background">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
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
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
