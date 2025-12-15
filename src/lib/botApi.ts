import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "bot_api_url";

export function getBotApiBaseUrl(): string {
  const fromStorage = localStorage.getItem(STORAGE_KEY)?.trim() || "";
  if (fromStorage) return fromStorage.replace(/\/+$/, "");
  const fromEnv = (import.meta.env.VITE_BOT_API_URL as string | undefined)?.trim() || "";
  return fromEnv.replace(/\/+$/, "");
}

export function setBotApiBaseUrl(url: string) {
  const v = url.trim().replace(/\/+$/, "");
  if (!v) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, v);
}

export async function getSupabaseAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}

