import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  type LinkTokenCreateRequest,
  type Products,
  type CountryCode,
} from "https://esm.sh/plaid@18.3.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function getPlaidClient() {
  const plaidClientId = Deno.env.get("PLAID_CLIENT_ID");
  const plaidSecret = Deno.env.get("PLAID_SECRET");
  const plaidEnv = (Deno.env.get("PLAID_ENV") || "sandbox").toLowerCase();

  if (!plaidClientId || !plaidSecret) {
    throw new Error("Missing PLAID_CLIENT_ID / PLAID_SECRET");
  }

  const env =
    plaidEnv === "production"
      ? PlaidEnvironments.production
      : plaidEnv === "development"
        ? PlaidEnvironments.development
        : PlaidEnvironments.sandbox;

  const config = new Configuration({
    basePath: env,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": plaidClientId,
        "PLAID-SECRET": plaidSecret,
      },
    },
  });

  return new PlaidApi(config);
}

function getProducts(): string[] {
  const products = (Deno.env.get("PLAID_PRODUCTS") || "auth")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return products.length ? products : ["auth"];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }

    const token = getBearerToken(req);
    if (!token) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string | undefined;

    if (!action) {
      return jsonResponse({ error: "Missing action" }, 400);
    }

    const plaid = getPlaidClient();

    if (action === "create_link_token") {
      const redirectUri = Deno.env.get("PLAID_REDIRECT_URI") || undefined;

      const req: LinkTokenCreateRequest = {
        user: { client_user_id: userId },
        client_name: "AI Trader",
        products: getProducts() as unknown as Products[],
        country_codes: ["US"] as unknown as CountryCode[],
        language: "en",
        redirect_uri: redirectUri,
      };
      const resp = await plaid.linkTokenCreate(req);

      return jsonResponse({ link_token: resp.data.link_token });
    }

    if (action === "exchange_public_token") {
      const publicToken = body?.public_token as string | undefined;
      const institutionName = (body?.institution_name as string | undefined) ?? "";
      const accounts = (body?.accounts as unknown[] | undefined) ?? [];

      if (!publicToken) return jsonResponse({ error: "public_token is required" }, 400);

      const exchange = await plaid.itemPublicTokenExchange({ public_token: publicToken });
      const accessToken = exchange.data.access_token;
      const itemId = exchange.data.item_id;

      const { error: upsertErr } = await supabaseAdmin
        .from("plaid_items")
        .upsert(
          {
            user_id: userId,
            item_id: itemId,
            access_token: accessToken,
            institution_name: institutionName,
          },
          { onConflict: "user_id" },
        );
      if (upsertErr) return jsonResponse({ error: "Failed to save item" }, 500);

      if (accounts.length) {
        // Mark all previous as non-primary, then set first account as primary by default.
        await supabaseAdmin.from("plaid_accounts").update({ is_primary: false }).eq("user_id", userId);

        const rows = accounts.map((aRaw, idx) => {
          const a = (aRaw ?? {}) as Record<string, unknown>;
          return {
          user_id: userId,
          item_id: itemId,
          account_id: String((a["id"] as string | undefined) ?? (a["account_id"] as string | undefined) ?? ""),
          name: String((a["name"] as string | undefined) ?? ""),
          mask: String((a["mask"] as string | undefined) ?? ""),
          type: String((a["type"] as string | undefined) ?? ""),
          subtype: String((a["subtype"] as string | undefined) ?? ""),
          is_primary: idx === 0,
          };
        }).filter((r) => r.account_id);

        if (rows.length) {
          await supabaseAdmin.from("plaid_accounts").upsert(rows, { onConflict: "user_id,account_id" });
        }
      }

      return jsonResponse({ success: true });
    }

    if (action === "get_accounts") {
      const { data: item, error } = await supabaseAdmin
        .from("plaid_items")
        .select("access_token,institution_name")
        .eq("user_id", userId)
        .maybeSingle();

      if (error || !item?.access_token) {
        return jsonResponse({ connected: false, accounts: [] });
      }

      const accountsResp = await plaid.accountsBalanceGet({ access_token: item.access_token });
      const accountsOut = (accountsResp.data.accounts || []).map((a) => ({
        account_id: a.account_id,
        name: a.name,
        mask: a.mask,
        type: a.type,
        subtype: a.subtype,
        balances: a.balances,
      }));

      return jsonResponse({ connected: true, institution_name: item.institution_name, accounts: accountsOut });
    }

    if (action === "create_transfer") {
      // Plaid Transfer requires special product enablement and a platform funding account.
      // This endpoint is intentionally guarded.
      const enabled = (Deno.env.get("PLAID_ENABLE_TRANSFERS") || "").toLowerCase() === "true";
      if (!enabled) {
        return jsonResponse(
          {
            error:
              "Transfers are not enabled. Set PLAID_ENABLE_TRANSFERS=true and configure Plaid Transfer product + funding account.",
          },
          501,
        );
      }
      return jsonResponse({ error: "Not implemented in this build." }, 501);
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: "Internal server error", details: message }, 500);
  }
});

