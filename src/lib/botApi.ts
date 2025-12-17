import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "bot_api_url";
const KRAKEN_WITHDRAW_KEY_KEY = "kraken_withdraw_key_usd";
const KRAKEN_WITHDRAW_ASSET_KEY = "kraken_withdraw_asset";

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

export function getKrakenWithdrawKeyUsd(): string {
  return localStorage.getItem(KRAKEN_WITHDRAW_KEY_KEY)?.trim() || "";
}

export function setKrakenWithdrawKeyUsd(key: string) {
  const v = key.trim();
  if (!v) localStorage.removeItem(KRAKEN_WITHDRAW_KEY_KEY);
  else localStorage.setItem(KRAKEN_WITHDRAW_KEY_KEY, v);
}

export function getKrakenWithdrawAsset(): string {
  return localStorage.getItem(KRAKEN_WITHDRAW_ASSET_KEY)?.trim() || "ZUSD";
}

export function setKrakenWithdrawAsset(asset: string) {
  const v = asset.trim();
  if (!v) localStorage.removeItem(KRAKEN_WITHDRAW_ASSET_KEY);
  else localStorage.setItem(KRAKEN_WITHDRAW_ASSET_KEY, v);
}

export async function getSupabaseAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}

