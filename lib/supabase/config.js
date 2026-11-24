// Supabase project settings, read from .env.local (see .env.example).
// Newer Supabase projects call the public key a "publishable key", older ones an "anon key". Either works.
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

// What to tell a visitor when the keys are missing: setup steps while developing, a plain notice once the site is live.
export const NOT_CONFIGURED_MESSAGE = process.env.NODE_ENV === "production"
  ? "Sign-in is being set up and will be available soon. Please check back shortly."
  : "Sign-in isn't set up yet. Add your Supabase keys to .env.local (see .env.example).";
