import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { z } from "zod";
import {
  getBotApiBaseUrl,
  getKrakenWithdrawAsset,
  getKrakenWithdrawKeyUsd,
  setBotApiBaseUrl,
  setKrakenWithdrawAsset,
  setKrakenWithdrawKeyUsd,
} from "@/lib/botApi";

// Validation schema - Kraken is primary, others optional
const apiKeysSchema = z.object({
  krakenKey: z.string().trim(),
  krakenSecret: z.string().trim(),
  plaidClientId: z.string().trim(),
  plaidSecret: z.string().trim(),
  openaiEnabled: z.boolean(),
  openaiApiKey: z.string().trim(),
}).refine(
  (data) => {
    const hasKraken = data.krakenKey.length > 0 && data.krakenSecret.length > 0;
    const hasPlaid = data.plaidClientId.length > 0 && data.plaidSecret.length > 0;
    const hasOpenai = !data.openaiEnabled || data.openaiApiKey.length > 0;
    const partialKraken = (data.krakenKey.length > 0) !== (data.krakenSecret.length > 0);
    const partialPlaid = (data.plaidClientId.length > 0) !== (data.plaidSecret.length > 0);
    return !partialKraken && !partialPlaid && hasOpenai;
  },
  { message: "Please provide both key and secret for each integration, or leave both empty" }
);

export default function Settings() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [botUrl, setBotUrl] = useState("");
  const [krakenWithdrawKey, setKrakenWithdrawKey] = useState("");
  const [krakenWithdrawAsset, setKrakenWithdrawAssetState] = useState("ZUSD");
  const [krakenKey, setKrakenKey] = useState("");
  const [krakenSecret, setKrakenSecret] = useState("");
  const [plaidClientId, setPlaidClientId] = useState("");
  const [plaidSecret, setPlaidSecret] = useState("");
  const [plaidEnv, setPlaidEnv] = useState("production");
  const [openaiEnabled, setOpenaiEnabled] = useState(false);
  const [openaiApiKey, setOpenaiApiKey] = useState("");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{
    krakenOk?: boolean;
    plaidOk?: boolean;
    openaiOk?: boolean;
    plaidEnv?: string;
    openaiModel?: string;
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

  useEffect(() => {
    setBotUrl(getBotApiBaseUrl());
    setKrakenWithdrawKey(getKrakenWithdrawKeyUsd());
    setKrakenWithdrawAssetState(getKrakenWithdrawAsset());
  }, []);

  // Load current status from bot-actions
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
          if (data.plaidEnv) setPlaidEnv(data.plaidEnv);
          if (data.openaiModel) setOpenaiModel(data.openaiModel);
          if (data.openaiOk) setOpenaiEnabled(true);
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

      <div style={{ marginBottom: "12px" }}>
        <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>
          Bot Backend URL (FastAPI)
        </label>
        <input
          className="plain-input"
          value={botUrl}
          onChange={(e) => setBotUrl(e.target.value)}
          placeholder="http://192.168.1.50:8000"
        />
      </div>

      <button
        className="plain-button"
        onClick={() => {
          setBotApiBaseUrl(botUrl);
          setKrakenWithdrawKeyUsd(krakenWithdrawKey);
          setKrakenWithdrawAsset(krakenWithdrawAsset);
          navigate("/dashboard");
        }}
        style={{ fontWeight: 600 }}
      >
        Save
      </button>

      <div style={{ marginTop: "24px" }}>
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

      <div style={{ marginTop: "24px" }}>
        <h2 className="medium-text" style={{ fontWeight: 600, marginBottom: "12px" }}>
          Trading API Keys (sent to your backend)
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
              {status.krakenOk ? "✓" : "○"} Kraken (Trading)
            </span>
            <span style={{ color: status.plaidOk ? "hsl(142, 76%, 36%)" : "hsl(var(--muted-foreground))" }}>
              {status.plaidOk ? "✓" : "○"} Plaid (Banking)
            </span>
            <span style={{ color: status.openaiOk ? "hsl(142, 76%, 36%)" : "hsl(var(--muted-foreground))" }}>
              {status.openaiOk ? "✓" : "○"} OpenAI (AI Council)
            </span>
          </div>
        )}
        
        <p style={{ color: "hsl(var(--muted-foreground))", fontSize: "0.9rem", marginBottom: "12px" }}>
          Enter or paste your API keys directly into the text fields below, then press “Send to Backend”. Keys are stored in Supabase for the bot.
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
            placeholder="Paste or type your Kraken API key"
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
            placeholder="Paste or type your Kraken secret"
          />
        </div>

        <div style={{ marginBottom: "12px" }}>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>Plaid Client ID</label>
          <input
            className="plain-input"
            type="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={plaidClientId}
            onChange={(e) => setPlaidClientId(e.target.value)}
            placeholder="Paste or type your Plaid Client ID"
          />
        </div>
        <div style={{ marginBottom: "12px" }}>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>Plaid Secret</label>
          <input
            className="plain-input"
            type="password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={plaidSecret}
            onChange={(e) => setPlaidSecret(e.target.value)}
            placeholder="Paste or type your Plaid secret"
          />
        </div>
        <div style={{ marginBottom: "12px" }}>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>Plaid Env</label>
          <select className="plain-input" value={plaidEnv} onChange={(e) => setPlaidEnv(e.target.value)}>
            <option value="production">production</option>
            <option value="development">development</option>
            <option value="sandbox">sandbox</option>
          </select>
        </div>

        <div style={{ marginBottom: "12px" }}>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>OpenAI (optional)</label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={openaiEnabled}
              onChange={(e) => setOpenaiEnabled(e.target.checked)}
              style={{ width: "18px", height: "18px" }}
            />
            <span style={{ color: "hsl(var(--muted-foreground))" }}>Enable OpenAI council vote</span>
          </div>
        </div>
        {openaiEnabled && (
          <>
            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>OpenAI API Key</label>
              <input
                className="plain-input"
                type="password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
                placeholder="Paste or type your OpenAI API key"
              />
            </div>
            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>OpenAI Model</label>
              <input className="plain-input" value={openaiModel} onChange={(e) => setOpenaiModel(e.target.value)} />
            </div>
          </>
        )}

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
            
            // Validate inputs
            const validationResult = apiKeysSchema.safeParse({
              krakenKey,
              krakenSecret,
              plaidClientId,
              plaidSecret,
              openaiEnabled,
              openaiApiKey,
            });
            
            if (!validationResult.success) {
              setValidationError(validationResult.error.errors[0]?.message || "Validation failed");
              return;
            }
            
            // Check if OpenAI is enabled but no key provided
            if (openaiEnabled && !openaiApiKey.trim()) {
              setValidationError("OpenAI API key is required when OpenAI is enabled");
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
              // Prefer Supabase Edge Function so you don't need a separate backend server.
              const { data: resp, error } = await supabase.functions.invoke("bot-actions", {
                body: {
                  action: "set_keys",
                  kraken_key: krakenKey.trim() || null,
                  kraken_secret: krakenSecret.trim() || null,
                  plaid_client_id: plaidClientId.trim() || null,
                  plaid_secret: plaidSecret.trim() || null,
                  plaid_env: plaidEnv,
                  openai_enabled: openaiEnabled,
                  openai_api_key: openaiApiKey.trim() || null,
                  openai_model: openaiModel,
                },
              });
              if (error) {
                toast({ title: "Failed", description: error.message, variant: "destructive" });
              } else if (resp?.error) {
                toast({ title: "Failed", description: String(resp.error), variant: "destructive" });
              } else {
                toast({ title: "Saved", description: "Keys stored in Supabase for bot tick." });
                setKrakenKey("");
                setKrakenSecret("");
                setPlaidClientId("");
                setPlaidSecret("");
                setOpenaiApiKey("");
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
          {submitting ? "Sending..." : "Send to Backend"}
        </button>
      </div>

      <div style={{ marginTop: "24px" }}>
        <h2 className="medium-text" style={{ fontWeight: 600, marginBottom: "12px" }}>
          Kraken Withdrawal (optional)
        </h2>
        <div style={{ marginBottom: "12px" }}>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>
            Kraken Withdraw Asset (default: ZUSD)
          </label>
          <input
            className="plain-input"
            value={krakenWithdrawAsset}
            onChange={(e) => setKrakenWithdrawAssetState(e.target.value)}
            placeholder="ZUSD"
          />
        </div>
        <div style={{ marginBottom: "12px" }}>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>
            Kraken Withdraw Key (to your Chime/bank)
          </label>
          <input
            className="plain-input"
            value={krakenWithdrawKey}
            onChange={(e) => setKrakenWithdrawKey(e.target.value)}
            placeholder="(paste your Kraken withdrawal key)"
          />
        </div>
        <p style={{ color: "hsl(var(--muted-foreground))", fontSize: "0.9rem" }}>
          This is stored on your device (local storage). The backend will still require
          <code> KRAKEN_ENABLE_WITHDRAWALS=true</code>.
        </p>
      </div>
    </div>
  );
}

