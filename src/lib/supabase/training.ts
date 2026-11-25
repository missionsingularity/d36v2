import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "./config";

export function createTrainingClient(sessionId?: string) {
  const config = getSupabaseConfig();
  if (!config) return null;
  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(sessionId ? { global: { headers: { "x-demo-session-id": sessionId } } } : {}),
  });
}
