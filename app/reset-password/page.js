import Link from "next/link";
import { cookies } from "next/headers";
import { AuthShell } from "../../components/auth/AuthPage";
import { ResetPasswordForm } from "../../components/auth/PasswordForms";
import { getUser } from "../../lib/supabase/server";

export const metadata = { title: "Choose a new password · CampusCast" };

// Reached only from the link in a password-reset email (see app/auth/callback/route.js).
export default async function ResetPasswordPage() {
  const user = await getUser();
  const fromResetLink = Boolean((await cookies()).get("cc_recovery"));

  if (!user || !fromResetLink) {
    return (
      <AuthShell eyebrow="Reset password" title={<>Link <em>expired</em>.</>}
        sub="Open this page from the link in your reset email. Links work once and expire after a short time.">
        <Link href="/forgot-password" className="btn btn-primary">Request a new link</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow="Reset password" title={<>New <em>password</em>.</>}
      sub={`Choose a new password for ${user.email}.`}>
      <ResetPasswordForm />
    </AuthShell>
  );
}
