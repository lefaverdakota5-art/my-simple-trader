import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";

// Validation schema - Exchange keys
const apiKeysSchema = z.object({
  krakenKey: z.string().trim(),
  krakenSecret: z.string().trim(),
  alpacaApiKey: z.string().trim(),
  alpacaSecret: z.string().trim(),
}).refine(
  (data) => {
    const partialKraken = (data.krakenKey.length > 0) !== (data.krakenSecret.length > 0);
    const partialAlpaca = (data.alpacaApiKey.length > 0) !== (data.alpacaSecret.length > 0);
    return !partialKraken && !partialAlpaca;
  },
  { message: "Please provide both key and secret for each exchange, or leave both empty" }
);

export default function Settings() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [krakenKey, setKrakenKey] = useState("");
  const [krakenSecret, setKrakenSecret] = useState("");
  const [krakenWithdrawKey, setKrakenWithdrawKey] = useState("");
  const [alpacaApiKey, setAlpacaApiKey] = useState("");
  const [alpacaSecret, setAlpacaSecret] = useState("");
  const [alpacaPaper, setAlpacaPaper] = useState(true);
  const [takeProfitPercent, setTakeProfitPercent] = useState(10);
  const [stopLossPercent, setStopLossPercent] = useState(5);
  const [trailingStopPercent, setTrailingStopPercent] = useState(3);
  const [trailingStopEnabled, setTrailingStopEnabled] = useState(false);
  const [maxPositionPercent, setMaxPositionPercent] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [submittingTpSl, setSubmittingTpSl] = useState(false);
  const [status, setStatus] = useState<{
    krakenOk?: boolean;
    alpacaOk?: boolean;
    takeProfitPercent?: number;
    stopLossPercent?: number;
    trailingStopPercent?: number;
    maxPositionPercent?: number;
  } | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem("notificationSoundEnabled");
    return saved !== null ? saved === "true" : true;
  });
  const [soundVolume, setSoundVolume] = useState(() => {
    const saved = localStorage.getItem("notificationSoundVolume");
    return saved !== null ? parseFloat(saved) : 0.5;
  });

  useEffect(() => {
    if (!authLoading && !user) navigate("/");
  }, [authLoading, user, navigate]);


  // Load current status
  useEffect(() => {
    async function loadStatus() {
      if (!user) return;
      setLoadingStatus(true);
      try {
        const { data, error } = await supabase.functions.invoke("bot-actions", {
          body: { action: "status" },
        });
        if (!error && data?.success) {
          setStatus(data);
          if (data.takeProfitPercent != null) setTakeProfitPercent(data.takeProfitPercent);
          if (data.stopLossPercent != null) setStopLossPercent(data.stopLossPercent);
          if (data.trailingStopPercent != null) setTrailingStopPercent(data.trailingStopPercent);
          if (data.maxPositionPercent != null) setMaxPositionPercent(data.maxPositionPercent);
        }
      } catch (e) {
        console.error("Failed to load status:", e);
      } finally {
        setLoadingStatus(false);
      }
    }
    loadStatus();
  }, [user]);

  return (
    <div className="app-container">
      <button
        className="plain-button"
        onClick={() => navigate("/dashboard")}
        style={{ marginBottom: "24px" }}
      >
        ← Back to Dashboard
      </button>

      <h1 className="big-text" style={{ marginBottom: "16px" }}>
        Settings
      </h1>

      {/* Kraken Funding Info */}
      <div style={{ 
        marginBottom: "24px",
        padding: "20px",
        background: "linear-gradient(135deg, hsl(280, 84%, 50%, 0.15), hsl(280, 84%, 50%, 0.05))",
        borderRadius: "12px",
        border: "2px solid hsl(280, 84%, 50%, 0.4)"
      }}>
        <h2 className="medium-text" style={{ fontWeight: 600, marginBottom: "8px", color: "hsl(280, 84%, 50%)" }}>
          🏦 Fund Your Trading Account
        </h2>
        <p style={{ color: "hsl(var(--muted-foreground))", fontSize: "0.9rem", marginBottom: "16px" }}>
          Deposit and withdraw funds directly through Kraken. This gives you full control over your money.
        </p>
        
        <div style={{ 
          padding: "16px", 
          background: "hsl(var(--muted) / 0.5)",
          borderRadius: "8px",
          marginBottom: "12px"
        }}>
          <p style={{ fontWeight: 600, marginBottom: "8px" }}>💰 To Deposit:</p>
          <ol style={{ margin: 0, paddingLeft: "20px", color: "hsl(var(--muted-foreground))", fontSize: "0.9rem" }}>
            <li>Open the Kraken app or website</li>
            <li>Go to Portfolio → Deposit → USD</li>
            <li>Choose your deposit method (bank transfer, etc.)</li>
            <li>Once funded, the app will use your Kraken balance for trading</li>
          </ol>
        </div>
        
        <div style={{ 
          padding: "16px", 
          background: "hsl(var(--muted) / 0.5)",
          borderRadius: "8px"
        }}>
          <p style={{ fontWeight: 600, marginBottom: "8px" }}>💸 To Withdraw:</p>
          <ol style={{ margin: 0, paddingLeft: "20px", color: "hsl(var(--muted-foreground))", fontSize: "0.9rem" }}>
            <li>Open the Kraken app or website</li>
            <li>Go to Portfolio → Withdraw → USD</li>
            <li>Add your bank account as a withdrawal destination</li>
            <li>Withdraw funds to your bank (1-3 business days)</li>
          </ol>
        </div>
        
        <a 
          href="https://www.kraken.com/sign-in" 
          target="_blank" 
          rel="noopener noreferrer"
          className="plain-button"
          style={{ 
            display: "inline-block",
            fontWeight: 600, 
            background: "hsl(280, 84%, 50%)", 
            color: "white", 
            padding: "14px 24px",
            marginTop: "16px",
            textDecoration: "none"
          }}
        >
          Open Kraken →
        </a>
      </div>

      {/* AI Council Info */}
      <div style={{ 
        padding: "16px", 
        marginBottom: "24px",
        background: "linear-gradient(135deg, hsl(var(--primary) / 0.1), hsl(var(--accent) / 0.1))",
        borderRadius: "12px",
        border: "1px solid hsl(var(--primary) / 0.2)"
      }}>
        <h3 style={{ fontWeight: 600, marginBottom: "8px", color: "hsl(var(--primary))" }}>
          ✨ AI Council Powered by Supabase
        </h3>
        <p style={{ color: "hsl(var(--muted-foreground))", fontSize: "0.9rem", margin: 0 }}>
          Your trading decisions are analyzed by 21 AI council members using AI and Perplexity for real-time news. No API keys required!
        </p>
      </div>

      <div style={{ marginBottom: "24px" }}>
        <h2 className="medium-text" style={{ fontWeight: 600, marginBottom: "12px" }}>
          Notifications
        </h2>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
          <input
            type="checkbox"
            checked={soundEnabled}
            onChange={(e) => {
              setSoundEnabled(e.target.checked);
              localStorage.setItem("notificationSoundEnabled", String(e.target.checked));
            }}
            style={{ width: "18px", height: "18px" }}
          />
          <span>Play sound on new trade notifications</span>
        </div>
        {soundEnabled && (
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", marginBottom: "8px", fontWeight: 500 }}>
              Volume: {Math.round(soundVolume * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={soundVolume}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setSoundVolume(val);
                localStorage.setItem("notificationSoundVolume", String(val));
              }}
              style={{ width: "100%", maxWidth: "300px" }}
            />
          </div>
        )}
      </div>

      {/* Position Sizing & Risk Management */}
      <div style={{ marginBottom: "24px" }}>
        <h2 className="medium-text" style={{ fontWeight: 600, marginBottom: "12px" }}>
          Risk Management
        </h2>
        <p style={{ color: "hsl(var(--muted-foreground))", fontSize: "0.9rem", marginBottom: "12px" }}>
          Configure position sizing and auto-sell rules to limit risk per trade.
        </p>
        
        {/* Max Position Size */}
        <div style={{ 
          padding: "16px", 
          marginBottom: "16px",
          background: "hsl(var(--muted) / 0.5)",
          borderRadius: "8px",
          border: "1px solid hsl(var(--border))"
        }}>
          <label style={{ display: "block", marginBottom: "8px", fontWeight: 600 }}>
            Max Position Size (% of Portfolio)
          </label>
          <p style={{ color: "hsl(var(--muted-foreground))", fontSize: "0.85rem", marginBottom: "12px" }}>
            Limits each trade to a maximum percentage of your portfolio value. Helps prevent over-concentration in a single position.
          </p>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <input
              className="plain-input"
              type="number"
              min="1"
              max="100"
              step="1"
              value={maxPositionPercent}
              onChange={(e) => setMaxPositionPercent(parseFloat(e.target.value) || 10)}
              style={{ width: "100px" }}
            />
            <span style={{ color: "hsl(var(--muted-foreground))" }}>% per trade</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "12px" }}>
          <div style={{ flex: "1", minWidth: "140px" }}>
            <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>
              Take Profit %
            </label>
            <input
              className="plain-input"
              type="number"
              min="1"
              max="100"
              step="0.5"
              value={takeProfitPercent}
              onChange={(e) => setTakeProfitPercent(parseFloat(e.target.value) || 10)}
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ flex: "1", minWidth: "140px" }}>
            <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>
              Stop Loss %
            </label>
            <input
              className="plain-input"
              type="number"
              min="1"
              max="100"
              step="0.5"
              value={stopLossPercent}
              onChange={(e) => setStopLossPercent(parseFloat(e.target.value) || 5)}
              style={{ width: "100%" }}
            />
          </div>
        </div>

        {/* Trailing Stop-Loss Section */}
        <div style={{ 
          marginTop: "16px",
          padding: "16px", 
          background: "hsl(var(--muted) / 0.5)",
          borderRadius: "8px",
          border: "1px solid hsl(var(--border))"
        }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
            <input
              type="checkbox"
              checked={trailingStopEnabled}
              onChange={(e) => setTrailingStopEnabled(e.target.checked)}
              style={{ width: "18px", height: "18px" }}
            />
            <span style={{ fontWeight: 500 }}>Enable Trailing Stop-Loss</span>
          </div>
          <p style={{ color: "hsl(var(--muted-foreground))", fontSize: "0.85rem", marginBottom: "12px" }}>
            Trailing stop follows the price up and locks in profits. As the price rises, the stop-loss 
            moves up to stay a fixed percentage below the highest price reached.
          </p>
          {trailingStopEnabled && (
            <div style={{ maxWidth: "200px" }}>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>
                Trail Distance %
              </label>
              <input
                className="plain-input"
                type="number"
                min="0.5"
                max="50"
                step="0.5"
                value={trailingStopPercent}
                onChange={(e) => setTrailingStopPercent(parseFloat(e.target.value) || 3)}
                style={{ width: "100%" }}
              />
              <p style={{ color: "hsl(var(--muted-foreground))", fontSize: "0.8rem", marginTop: "4px" }}>
                Stop triggers when price drops this % from peak
              </p>
            </div>
          )}
        </div>

        <button
          className="plain-button"
          disabled={submittingTpSl}
          onClick={async () => {
            setSubmittingTpSl(true);
            try {
              const { data: resp, error } = await supabase.functions.invoke("bot-actions", {
                body: {
                  action: "set_tp_sl",
                  take_profit_percent: takeProfitPercent,
                  stop_loss_percent: stopLossPercent,
                  trailing_stop_percent: trailingStopEnabled ? trailingStopPercent : null,
                  max_position_percent: maxPositionPercent,
                },
              });
              if (error) {
                toast({ title: "Failed", description: error.message, variant: "destructive" });
              } else if (resp?.error) {
                toast({ title: "Failed", description: String(resp.error), variant: "destructive" });
              } else {
                toast({ title: "Saved", description: "Auto sell settings updated." });
              }
            } finally {
              setSubmittingTpSl(false);
            }
          }}
          style={{ fontWeight: 600, marginTop: "16px" }}
        >
          {submittingTpSl ? "Saving..." : "Save Auto Sell Settings"}
        </button>
      </div>

      <div style={{ marginBottom: "24px" }}>
        <h2 className="medium-text" style={{ fontWeight: 600, marginBottom: "12px" }}>
          Exchange Keys
        </h2>
        
        {/* Status indicators */}
        {loadingStatus ? (
          <p style={{ color: "hsl(var(--muted-foreground))", marginBottom: "12px" }}>Loading status...</p>
        ) : status && (
          <div style={{ 
            display: "flex", 
            gap: "16px", 
            flexWrap: "wrap",
            marginBottom: "16px",
            padding: "12px",
            background: "hsl(var(--muted))",
            borderRadius: "8px"
          }}>
            <span style={{ color: status.krakenOk ? "hsl(142, 76%, 36%)" : "hsl(var(--muted-foreground))" }}>
              {status.krakenOk ? "✓" : "○"} Kraken (Crypto)
            </span>
            <span style={{ color: status.alpacaOk ? "hsl(142, 76%, 36%)" : "hsl(var(--muted-foreground))" }}>
              {status.alpacaOk ? "✓" : "○"} Alpaca (Stocks)
            </span>
          </div>
        )}

        {/* Alpaca Section - Stocks */}
        <div style={{ 
          padding: "16px", 
          marginBottom: "16px",
          background: "linear-gradient(135deg, hsl(217, 91%, 60%, 0.15), hsl(217, 91%, 60%, 0.05))",
          borderRadius: "12px",
          border: "2px solid hsl(217, 91%, 60%, 0.4)"
        }}>
          <h3 style={{ fontWeight: 600, marginBottom: "8px", color: "hsl(217, 91%, 60%)" }}>
            📈 Alpaca (Stocks) - Penny Trades Supported
          </h3>
          <p style={{ color: "hsl(var(--muted-foreground))", fontSize: "0.9rem", marginBottom: "12px" }}>
            Commission-free US stock trading with fractional shares. Supports micro transactions as low as $1!
          </p>
          
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>Alpaca API Key</label>
            <input
              className="plain-input"
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={alpacaApiKey}
              onChange={(e) => setAlpacaApiKey(e.target.value)}
              placeholder="Paste your Alpaca API key"
            />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>Alpaca Secret</label>
            <input
              className="plain-input"
              type="password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={alpacaSecret}
              onChange={(e) => setAlpacaSecret(e.target.value)}
              placeholder="Paste your Alpaca secret"
            />
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={alpacaPaper}
              onChange={(e) => setAlpacaPaper(e.target.checked)}
              style={{ width: "18px", height: "18px" }}
            />
            <span style={{ fontWeight: 500 }}>Paper Trading Mode</span>
            <span style={{ color: "hsl(var(--muted-foreground))", fontSize: "0.85rem" }}>
              (Use sandbox - recommended for testing)
            </span>
          </div>
        </div>

        {/* Kraken Section - Crypto */}
        <div style={{ 
          padding: "16px", 
          marginBottom: "16px",
          background: "hsl(var(--muted) / 0.5)",
          borderRadius: "12px",
          border: "1px solid hsl(var(--border))"
        }}>
          <h3 style={{ fontWeight: 600, marginBottom: "8px" }}>
            🪙 Kraken (Crypto)
          </h3>
          <p style={{ color: "hsl(var(--muted-foreground))", fontSize: "0.9rem", marginBottom: "12px" }}>
            For live crypto trading. Supports BTC, ETH, and many other pairs.
          </p>
          
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>Kraken API Key</label>
            <input
              className="plain-input"
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={krakenKey}
              onChange={(e) => setKrakenKey(e.target.value)}
              placeholder="Paste your Kraken API key"
            />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>Kraken Secret</label>
            <input
              className="plain-input"
              type="password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={krakenSecret}
              onChange={(e) => setKrakenSecret(e.target.value)}
              placeholder="Paste your Kraken secret"
            />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>Kraken Withdrawal Key</label>
            <input
              className="plain-input"
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={krakenWithdrawKey}
              onChange={(e) => setKrakenWithdrawKey(e.target.value)}
              placeholder="Name of your bank withdrawal address in Kraken"
            />
            <p style={{ color: "hsl(var(--muted-foreground))", fontSize: "0.8rem", marginTop: "4px" }}>
              The name of the withdrawal address you configured in Kraken (e.g., 'My Bank'). Required for withdrawals.
            </p>
          </div>
        </div>

        {validationError && (
          <div style={{
            padding: "12px",
            marginBottom: "12px",
            background: "hsl(0, 84%, 60%, 0.1)",
            border: "1px solid hsl(0, 84%, 60%)",
            borderRadius: "8px",
            color: "hsl(0, 84%, 60%)",
            fontSize: "0.9rem"
          }}>
            {validationError}
          </div>
        )}

        <button
          className="plain-button"
          disabled={submitting}
          onClick={async () => {
            setValidationError(null);
            
            const validationResult = apiKeysSchema.safeParse({
              krakenKey,
              krakenSecret,
              alpacaApiKey,
              alpacaSecret,
            });
            
            if (!validationResult.success) {
              setValidationError(validationResult.error.errors[0]?.message || "Validation failed");
              return;
            }
            
            const { data } = await supabase.auth.getSession();
            const token = data.session?.access_token;
            if (!token) {
              toast({ title: "Error", description: "Not authenticated", variant: "destructive" });
              return;
            }
            setSubmitting(true);
            try {
              const { data: resp, error } = await supabase.functions.invoke("bot-actions", {
                body: {
                  action: "set_keys",
                  kraken_key: krakenKey.trim() || null,
                  kraken_secret: krakenSecret.trim() || null,
                  kraken_withdraw_key: krakenWithdrawKey.trim() || null,
                  alpaca_api_key: alpacaApiKey.trim() || null,
                  alpaca_secret: alpacaSecret.trim() || null,
                  alpaca_paper: alpacaPaper,
                },
              });
              if (error) {
                toast({ title: "Failed", description: error.message, variant: "destructive" });
              } else if (resp?.error) {
                toast({ title: "Failed", description: String(resp.error), variant: "destructive" });
              } else {
                toast({ title: "Saved", description: "Exchange keys stored securely." });
                setKrakenKey("");
                setKrakenSecret("");
                setKrakenWithdrawKey("");
                setAlpacaApiKey("");
                setAlpacaSecret("");
                // Refresh status
                const { data: statusData } = await supabase.functions.invoke("bot-actions", {
                  body: { action: "status" },
                });
                if (statusData?.success) setStatus(statusData);
              }
            } finally {
              setSubmitting(false);
            }
          }}
          style={{ fontWeight: 600 }}
        >
          {submitting ? "Saving..." : "Save Exchange Keys"}
        </button>
      </div>


      {/* App Version */}
      <div style={{ marginTop: "32px", paddingTop: "16px", borderTop: "1px solid hsl(var(--border))" }}>
        <p style={{ color: "hsl(var(--muted-foreground))", fontSize: "0.75rem", textAlign: "center" }}>
          AI Trader v1.5 • Build {import.meta.env.MODE === 'production' ? 'Release' : 'Dev'}
        </p>
      </div>
    </div>
  );
}
