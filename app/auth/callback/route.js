import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "../../../lib/supabase/server";

// Links in Supabase emails land here: sign-up confirmations and password resets.
// Swap the one-time code for a session, then send the user to the right next step.
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const jar = await cookies();
  // Set by requestPasswordReset() in app/auth/actions.js.
  const isReset = type === "recovery" || Boolean(jar.get("cc_reset_requested"));

  const supabase = await createClient();
  if (supabase && (code || (tokenHash && type))) {
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      if (isReset) {
        jar.delete("cc_reset_requested");
        // Lets /reset-password change the password for the next 15 minutes.
        jar.set("cc_recovery", "1", {
          httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 15 * 60,
        });
        return NextResponse.redirect(`${origin}/reset-password`);
      }
      // Email confirmed: next step is ID verification.
      return NextResponse.redirect(`${origin}/verify`);
    }
  }
  return NextResponse.redirect(`${origin}/${isReset ? "forgot-password?error=link" : "signin?error=link"}`);
}
