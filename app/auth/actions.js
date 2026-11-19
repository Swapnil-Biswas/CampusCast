"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { isCollegeEmail, COLLEGE_EMAIL_ERROR } from "../../lib/college";
import { homeFor } from "../../lib/profile";

const NOT_CONFIGURED = "Sign-in isn't set up yet. Add your Supabase keys to .env.local.";

function readCredentials(formData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  return { email, password };
}

export async function signUp(_prev, formData) {
  const { email, password } = readCredentials(formData);
  const name = String(formData.get("name") || "").trim();
  if (!name) return { error: "Please enter your name.", email, name };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Please enter a valid email address.", email, name };
  if (password.length < 8) return { error: "Use at least 8 characters for your password.", email, name };

  const supabase = await createClient();
  if (!supabase) return { error: NOT_CONFIGURED, email, name };

  if (!(await isCollegeEmail(supabase, email))) return { error: COLLEGE_EMAIL_ERROR, email, name };

  const origin = (await headers()).get("origin");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name }, emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) {
    // The database trigger rejects non-college emails with a generic "Database error".
    const msg = /database error/i.test(error.message) ? COLLEGE_EMAIL_ERROR : error.message;
    return { error: msg, email, name };
  }

  // Email confirmation is turned off in Supabase: the user is signed in straight away.
  if (data.session) redirect("/verify");
  return {
    ok: `We sent a confirmation link to ${email}. Open it to confirm your email, then you'll be asked for your branch, year and student ID card.`,
  };
}

export async function signIn(_prev, formData) {
  const { email, password } = readCredentials(formData);
  if (!email || !password) return { error: "Enter your email and password.", email };

  const supabase = await createClient();
  if (!supabase) return { error: NOT_CONFIGURED, email };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const msg = error.code === "email_not_confirmed"
      ? "Please confirm your email first. Check your inbox for the link."
      : "That email and password don't match.";
    return { error: msg, email };
  }
  redirect(await homeFor(supabase, data.user.id));
}

// ---------- Forgot password ----------
// The reset link goes to /auth/callback (already in Supabase's Redirect URLs).
// This cookie tells the callback the link is a password reset, not a sign-up confirmation.
const RESET_REQUESTED = "cc_reset_requested";
const RECOVERY = "cc_recovery";
const cookieOpts = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" };

export async function requestPasswordReset(_prev, formData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Please enter a valid email address.", email };

  const supabase = await createClient();
  if (!supabase) return { error: NOT_CONFIGURED, email };
  if (!(await isCollegeEmail(supabase, email))) return { error: COLLEGE_EMAIL_ERROR, email };

  const origin = (await headers()).get("origin");
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback` });
  if (error) {
    // Supabase doesn't error for unknown emails, so any error here is a real sending problem.
    console.error("[requestPasswordReset]", error.status, error.code, error.message);
    if (error.status === 429) {
      return { error: "Too many reset emails were sent. Please wait a minute and try again.", email };
    }
    return { error: "We couldn't send the email right now. Please try again in a few minutes.", email };
  }
  (await cookies()).set(RESET_REQUESTED, "1", { ...cookieOpts, maxAge: 60 * 60 });

  // Same message whether or not the account exists, so the form can't be used to look up who has signed up.
  return { ok: true, email };
}

// Reset with the code from the email (the {{ .Token }} in the Reset Password email template).
// Works on any device, unlike the link.
export async function resetWithCode(_prev, formData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const code = String(formData.get("code") || "").replace(/\s+/g, "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (!/^\d{6,10}$/.test(code)) return { error: "Enter the code from the email (numbers only)." };
  if (password.length < 8) return { error: "Use at least 8 characters for your new password." };
  if (password !== confirm) return { error: "The two passwords don't match." };

  const supabase = await createClient();
  if (!supabase) return { error: NOT_CONFIGURED };

  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "recovery" });
  if (error || !data?.user) {
    return { error: "That code is wrong or has expired. Check the latest email, or send a new code." };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    const msg = updateError.code === "same_password"
      ? "Your new password must be different from your old one."
      : updateError.message;
    return { error: msg };
  }
  (await cookies()).delete(RESET_REQUESTED);
  redirect(await homeFor(supabase, data.user.id));
}

export async function updatePassword(_prev, formData) {
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");
  if (password.length < 8) return { error: "Use at least 8 characters for your new password." };
  if (password !== confirm) return { error: "The two passwords don't match." };

  const jar = await cookies();
  const supabase = await createClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: {} };
  if (!user || !jar.get(RECOVERY)) {
    return { error: "This reset link has expired. Please request a new one.", expired: true };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    const msg = error.code === "same_password"
      ? "Your new password must be different from your old one."
      : error.message;
    return { error: msg };
  }
  jar.delete(RECOVERY);
  redirect(await homeFor(supabase, user.id));
}

export async function signOut() {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/");
}
