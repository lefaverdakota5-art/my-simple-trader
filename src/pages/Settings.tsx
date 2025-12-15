import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  getBotApiBaseUrl,
  getKrakenWithdrawAsset,
  getKrakenWithdrawKeyUsd,
  setBotApiBaseUrl,
  setKrakenWithdrawAsset,
  setKrakenWithdrawKeyUsd,
} from "@/lib/botApi";

export default function Settings() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [botUrl, setBotUrl] = useState("");
  const [krakenWithdrawKey, setKrakenWithdrawKey] = useState("");
  const [krakenWithdrawAsset, setKrakenWithdrawAssetState] = useState("ZUSD");
  const [alpacaKey, setAlpacaKey] = useState("");
  const [alpacaSecret, setAlpacaSecret] = useState("");
  const [krakenKey, setKrakenKey] = useState("");
  const [krakenSecret, setKrakenSecret] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    setBotUrl(getBotApiBaseUrl());
    setKrakenWithdrawKey(getKrakenWithdrawKeyUsd());
    setKrakenWithdrawAssetState(getKrakenWithdrawAsset());
  }, []);

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
          Trading API Keys (sent to your backend)
        </h2>
        <p style={{ color: "hsl(var(--muted-foreground))", fontSize: "0.9rem", marginBottom: "12px" }}>
          Paste keys here and press “Send to Backend”. Keys are stored on your backend (SQLite), not on the phone.
          Your backend must be reachable and configured in “Bot Backend URL”.
        </p>

        <div style={{ marginBottom: "12px" }}>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>Alpaca API Key</label>
          <input className="plain-input" value={alpacaKey} onChange={(e) => setAlpacaKey(e.target.value)} />
        </div>
        <div style={{ marginBottom: "12px" }}>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>Alpaca Secret</label>
          <input className="plain-input" value={alpacaSecret} onChange={(e) => setAlpacaSecret(e.target.value)} />
        </div>

        <div style={{ marginBottom: "12px" }}>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>Kraken API Key</label>
          <input className="plain-input" value={krakenKey} onChange={(e) => setKrakenKey(e.target.value)} />
        </div>
        <div style={{ marginBottom: "12px" }}>
          <label style={{ display: "block", marginBottom: "4px", fontWeight: 500 }}>Kraken Secret</label>
          <input className="plain-input" value={krakenSecret} onChange={(e) => setKrakenSecret(e.target.value)} />
        </div>

        <button
          className="plain-button"
          disabled={submitting || !botUrl}
          onClick={async () => {
            if (!botUrl) {
              toast({ title: "Missing backend URL", description: "Set Bot Backend URL first.", variant: "destructive" });
              return;
            }
            const { data } = await supabase.auth.getSession();
            const token = data.session?.access_token;
            if (!token) return;
            setSubmitting(true);
            try {
              const r = await fetch(`${botUrl.replace(/\/+$/, "")}/config/set_keys`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                  alpaca_api_key: alpacaKey,
                  alpaca_secret: alpacaSecret,
                  kraken_key: krakenKey,
                  kraken_secret: krakenSecret,
                }),
              });
              const resp = await r.json();
              if (!r.ok) {
                toast({ title: "Failed", description: resp?.error || "Could not save keys", variant: "destructive" });
              } else {
                toast({ title: "Saved", description: "Keys stored on backend. Restart backend to apply to bots." });
                setAlpacaKey("");
                setAlpacaSecret("");
                setKrakenKey("");
                setKrakenSecret("");
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

