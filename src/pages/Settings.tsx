import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
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

