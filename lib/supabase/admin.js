import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./config";

// Supabase client with the secret "service role" key. It skips every row-level-security rule, so use it only on the
// server, only for the few things a student must not be able to do themselves (saving an AI check, publishing).
// The key has no NEXT_PUBLIC_ prefix, so it never reaches the browser.
// Returns null when the key is not set: uploads then wait for an admin.
export function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !key) return null;
  return createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
