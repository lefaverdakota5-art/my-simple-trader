import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getBotApiBaseUrl, getSupabaseAccessToken } from "@/lib/botApi";

declare global {
  interface Window {
    Plaid?: PlaidLinkGlobal;
  }
}

type PlaidLinkSuccessMetadata = {
  institution?: { name?: string | null } | null;
  accounts?: Array<{
    id: string;
    name?: string | null;
    mask?: string | null;
    type?: string | null;
    subtype?: string | null;
  }> | null;
};

type PlaidLinkHandler = {
  open: () => void;
};

type PlaidLinkGlobal = {
  create: (config: {
    token: string;
    onSuccess: (public_token: string, metadata: PlaidLinkSuccessMetadata) => void | Promise<void>;
    onExit: () => void | Promise<void>;
  }) => PlaidLinkHandler;
};

type PlaidAccount = {
  account_id: string;
  name: string;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  balances: {
    available: number | null;
    current: number | null;
    iso_currency_code: string | null;
  };
};

export default function Bank() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const botApiBase = getBotApiBaseUrl();

  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [institutionName, setInstitutionName] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<PlaidAccount[]>([]);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/");
  }, [authLoading, user, navigate]);

  const formatMoney = useMemo(
    () => (value: number | null, currency: string | null) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency || "USD",
      }).format(value || 0),
    [],
  );

  const getAccessToken = useCallback(async () => getSupabaseAccessToken(), []);

  const refreshAccounts = useCallback(async () => {
    // Prefer backend direct Plaid (no Supabase edge function setup required)
    if (botApiBase) {
      const token = await getAccessToken();
      if (!token) {
        toast({ title: "Auth error", description: "No session token found", variant: "destructive" });
        return;
      }
      const r = await fetch(`${botApiBase}/plaid/accounts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: "Plaid error", description: data?.error || "Failed to load accounts", variant: "destructive" });
        return;
      }
      setConnected(Boolean(data?.connected));
      setInstitutionName(data?.institution_name ?? null);
      setAccounts((data?.accounts ?? []) as PlaidAccount[]);
      return;
    }

    // Fallback: Supabase edge function
    const { data, error } = await supabase.functions.invoke("plaid", {
      body: { action: "get_accounts" },
    });
    if (error) {
      toast({ title: "Plaid error", description: error.message, variant: "destructive" });
      return;
    }
    setConnected(Boolean(data?.connected));
    setInstitutionName(data?.institution_name ?? null);
    setAccounts((data?.accounts ?? []) as PlaidAccount[]);
  }, [botApiBase, getAccessToken]);

  const createLinkToken = useCallback(async () => {
    if (botApiBase) {
      const token = await getAccessToken();
      if (!token) return;
      const r = await fetch(`${botApiBase}/plaid/create_link_token`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: "Plaid error", description: data?.error || "Failed to create link token", variant: "destructive" });
        return;
      }
      setLinkToken(data?.link_token ?? null);
      return;
    }

    const { data, error } = await supabase.functions.invoke("plaid", {
      body: { action: "create_link_token" },
    });
    if (error) {
      toast({ title: "Plaid error", description: error.message, variant: "destructive" });
      return;
    }
    setLinkToken(data?.link_token ?? null);
  }, [botApiBase, getAccessToken]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      await refreshAccounts();
      await createLinkToken();
      setLoading(false);
    })();
  }, [user, refreshAccounts, createLinkToken]);

  // Load Plaid Link (client-side script).
  useEffect(() => {
    if (!linkToken) return;
    const existing = document.querySelector<HTMLScriptElement>('script[data-plaid-link="true"]');
    if (existing) return;

    const s = document.createElement("script");
    s.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    s.async = true;
    s.setAttribute("data-plaid-link", "true");
    document.body.appendChild(s);
  }, [linkToken]);

  const openPlaid = async () => {
    if (!linkToken) return;
    setLinkOpen(true);

    // Wait briefly for Plaid script to load.
    for (let i = 0; i < 50; i++) {
      if (window.Plaid?.create) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    const Plaid = window.Plaid;
    if (!Plaid?.create) {
      setLinkOpen(false);
      toast({
        title: "Plaid not available",
        description: "Plaid Link script failed to load. Try again.",
        variant: "destructive",
      });
      return;
    }

    const handler = Plaid.create({
      token: linkToken,
      onSuccess: async (public_token: string, metadata: PlaidLinkSuccessMetadata) => {
        const institutionName = metadata?.institution?.name ?? "";
        const accounts = (metadata?.accounts ?? []).map((a) => ({
          id: a.id,
          name: a.name ?? null,
          mask: a.mask ?? null,
          type: a.type ?? null,
          subtype: a.subtype ?? null,
        }));

        let error: { message: string } | null = null;
        if (botApiBase) {
          const token = await getAccessToken();
          if (!token) {
            error = { message: "No session token found" };
          } else {
            const r = await fetch(`${botApiBase}/plaid/exchange_public_token`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                public_token,
                institution_name: institutionName,
                accounts,
              }),
            });
            if (!r.ok) {
              const data = await r.json().catch(() => ({}));
              error = { message: data?.error || "Failed to exchange token" };
            }
          }
        } else {
          const resp = await supabase.functions.invoke("plaid", {
            body: {
              action: "exchange_public_token",
              public_token,
              institution_name: institutionName,
              accounts,
            },
          });
          error = resp.error ? { message: resp.error.message } : null;
        }

        if (error) {
          toast({ title: "Plaid error", description: error.message, variant: "destructive" });
        } else {
          toast({ title: "Bank connected", description: "Plaid link successful." });
          await refreshAccounts();
          await createLinkToken();
        }
        setLinkOpen(false);
      },
      onExit: async () => {
        setLinkOpen(false);
        await createLinkToken();
      },
    });

    handler.open();
  };

  if (authLoading || loading) {
    return (
      <div className="app-container">
        <p className="big-text">Loading...</p>
      </div>
    );
  }

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
        Banking (Plaid)
      </h1>

      <p className="medium-text" style={{ marginBottom: "16px" }}>
        Status: {connected ? `Connected${institutionName ? ` • ${institutionName}` : ""}` : "Not connected"}
      </p>

      <button className="plain-button" onClick={openPlaid} disabled={!linkToken || linkOpen}>
        {connected ? "Reconnect / Change Bank" : "Connect Bank"}
      </button>

      <div style={{ marginTop: "24px" }}>
        <h2 className="medium-text" style={{ fontWeight: 600, marginBottom: "12px" }}>
          Linked Accounts
        </h2>
        {accounts.length === 0 ? (
          <p style={{ color: "hsl(var(--muted-foreground))" }}>No accounts available</p>
        ) : (
          accounts.map((a) => (
            <div
              key={a.account_id}
              style={{
                padding: "12px",
                borderBottom: "1px solid hsl(var(--border))",
                marginBottom: "8px",
              }}
            >
              <p style={{ fontWeight: 600 }}>
                {a.name} {a.mask ? `••••${a.mask}` : ""}
              </p>
              <p style={{ color: "hsl(var(--muted-foreground))", fontSize: "0.875rem" }}>
                {a.type || "account"} {a.subtype ? `• ${a.subtype}` : ""}
              </p>
              <p style={{ marginTop: "8px" }}>
                Available: {formatMoney(a.balances.available, a.balances.iso_currency_code)} • Current:{" "}
                {formatMoney(a.balances.current, a.balances.iso_currency_code)}
              </p>
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: "24px" }}>
        <h2 className="medium-text" style={{ fontWeight: 600, marginBottom: "12px" }}>
          Transfers (important)
        </h2>
        <p style={{ color: "hsl(var(--muted-foreground))", fontSize: "0.9rem" }}>
          This build connects Plaid and shows balances. Automated “move money from bank → Alpaca/Kraken → Chime” requires
          additional approvals/products (Plaid Transfer and/or broker/exchange funding APIs) that aren’t universally
          available on personal accounts.
        </p>
      </div>
    </div>
  );
}

