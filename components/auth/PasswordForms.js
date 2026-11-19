"use client";
import { useActionState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requestPasswordReset, resetWithCode, updatePassword } from "../../app/auth/actions";

// Step 2: the code from the email plus the new password, in one go.
function ResetCodeForm({ email, resend, resending }) {
  const [state, action, pending] = useActionState(resetWithCode, null);
  return (
    <>
      <p className="form-ok" role="status">
        If <b>{email}</b> has a CampusCast account, we&apos;ve emailed it a reset code.
        It can take a minute to arrive, so check spam too.
      </p>
      <form className="auth-form" action={action}>
        <input type="hidden" name="email" value={email} />
        <label className="field">
          <span>Code from the email</span>
          <input name="code" inputMode="numeric" autoComplete="one-time-code" required
            pattern="[0-9 ]{6,12}" maxLength={12} placeholder="123456" className="code-input" />
        </label>
        <label className="field">
          <span>New password</span>
          <input name="password" type="password" autoComplete="new-password" required minLength={8}
            placeholder="At least 8 characters" />
        </label>
        <label className="field">
          <span>Confirm new password</span>
          <input name="confirm" type="password" autoComplete="new-password" required minLength={8}
            placeholder="Type it again" />
        </label>
        {state?.error && <p className="form-msg" role="alert">{state.error}</p>}
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Reset password"}
          {!pending && <ArrowRight size={17} />}
        </button>
      </form>
      <form action={resend} className="auth-alt">
        <input type="hidden" name="email" value={email} />
        Didn&apos;t get it?{" "}
        <button type="submit" className="link-btn" disabled={resending}>{resending ? "Sending…" : "Send a new code"}</button>
      </form>
    </>
  );
}

export function ForgotPasswordForm({ notice = "" }) {
  const [state, action, pending] = useActionState(requestPasswordReset, null);

  if (state?.ok) return <ResetCodeForm email={state.email} resend={action} resending={pending} />;

  const message = state?.error || notice;
  return (
    <form className="auth-form" action={action}>
      <label className="field">
        <span>College email</span>
        <input name="email" type="email" autoComplete="email" required
          defaultValue={state?.email ?? ""} placeholder="25ug1byai282@bmsit.in" />
      </label>
      {message && <p className="form-msg" role="alert">{message}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send code"}
        {!pending && <ArrowRight size={17} />}
      </button>
      <p className="auth-alt">Remembered it? <Link href="/signin">Sign in</Link></p>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, null);
  return (
    <form className="auth-form" action={action}>
      <label className="field">
        <span>New password</span>
        <input name="password" type="password" autoComplete="new-password" required minLength={8}
          placeholder="At least 8 characters" />
      </label>
      <label className="field">
        <span>Confirm new password</span>
        <input name="confirm" type="password" autoComplete="new-password" required minLength={8}
          placeholder="Type it again" />
      </label>
      {state?.error && (
        <p className="form-msg" role="alert">
          {state.error}{state.expired && <> <Link href="/forgot-password">Request a new link</Link>.</>}
        </p>
      )}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
        {!pending && <ArrowRight size={17} />}
      </button>
    </form>
  );
}
