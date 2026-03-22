import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function createSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireUser(req: Request) {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const supabaseAdmin = createSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    throw new Error("Unauthorized");
  }
  return { user: data.user, token, supabaseAdmin };
}

export function requireServiceKey(req: Request) {
  const expected = Deno.env.get("EDGE_SERVICE_SECRET");
  if (!expected) {
    throw new Error("EDGE_SERVICE_SECRET is not configured");
  }
  const provided = req.headers.get("x-service-key") || "";
  if (!provided || provided !== expected) {
    throw new Error("Forbidden");
  }
}
