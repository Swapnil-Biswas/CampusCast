import { createBrowserClient } from "@supabase/ssr";
import { supabaseUrl, supabaseKey } from "./config";

// Supabase client for the browser (live notifications, file uploads). One instance per page.
let client;
export function browserClient() {
  if (!client) client = createBrowserClient(supabaseUrl, supabaseKey);
  return client;
}
