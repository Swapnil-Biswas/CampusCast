"use client";
import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { signIn, signUp } from "../../app/auth/actions";

export default function AuthForm({ mode, defaultEmail = "", notice = "" }) {
  const isSignUp = mode === "signup";
  const [state, action, pending] = useActionState(isSignUp ? signUp : signIn, null);

  if (state?.ok) {
    return (
      <div className="auth-done" role="status">
        <p className="thanks">Check your inbox</p>
        <p>{state.ok}</p>
      </div>
    );
  }

  const message = state?.error || notice;

  return (
    <form className="auth-form" action={action}>
      {isSignUp && (
        <label className="field">
          <span>Full name</span>
          <input name="name" autoComplete="name" required defaultValue={state?.name ?? ""} placeholder="Aditi Sharma" />
        </label>
      )}
      <label className="field">
        <span>College email</span>
        <input name="email" type="email" autoComplete="email" required
          defaultValue={state?.email ?? defaultEmail} placeholder="25ug1byai282@bmsit.in" />
        {isSignUp && <small className="field-hint">Use your college email. Personal emails like Gmail aren&apos;t accepted.</small>}
      </label>
      <label className="field">
        <span>Password</span>
        <input name="password" type="password" required minLength={isSignUp ? 8 : undefined}
          autoComplete={isSignUp ? "new-password" : "current-password"}
          placeholder={isSignUp ? "At least 8 characters" : "Your password"} />
        {!isSignUp && <Link href="/forgot-password" className="forgot-link">Forgot password?</Link>}
      </label>

      {message && <p className="form-msg" role="alert">{message}</p>}

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "One moment…" : isSignUp ? "Create account" : "Sign in"}
        {!pending && <ArrowRight size={17} />}
      </button>

      <p className="auth-alt">
        {isSignUp ? "Already have an account? " : "New to CampusCast? "}
        <Link href={isSignUp ? "/signin" : "/signup"}>{isSignUp ? "Sign in" : "Create an account"}</Link>
      </p>
    </form>
  );
}
