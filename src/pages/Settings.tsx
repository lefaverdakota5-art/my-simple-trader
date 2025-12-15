import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { getBotApiBaseUrl, setBotApiBaseUrl } from "@/lib/botApi";

export default function Settings() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [botUrl, setBotUrl] = useState("");

  useEffect(() => {
    if (!authLoading && !user) navigate("/");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    setBotUrl(getBotApiBaseUrl());
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
          navigate("/dashboard");
        }}
        style={{ fontWeight: 600 }}
      >
        Save
      </button>
    </div>
  );
}

