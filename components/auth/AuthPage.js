import { redirect } from "next/navigation";
import SiteNav from "../SiteNav";
import AuthForm from "./AuthForm";
import { createClient, getUser } from "../../lib/supabase/server";
import { isSupabaseConfigured } from "../../lib/supabase/config";
import { homeFor } from "../../lib/profile";

// The sticky-note card every auth page sits in.
export function AuthShell({ eyebrow, title, sub, children }) {
  return (
    <>
      <SiteNav />
      <main className="auth">
        <div className="container">
          <div className="auth-card">
            <p className="eyebrow">{eyebrow}</p>
            <h1 className="display">{title}</h1>
            {sub && <p className="auth-sub">{sub}</p>}
            {!isSupabaseConfigured && (
              <p className="form-msg">Sign-in isn&apos;t set up yet. Add your Supabase keys to .env.local (see .env.example).</p>
            )}
            {children}
          </div>
        </div>
      </main>
    </>
  );
}

// Pages for signed-out visitors (sign up, sign in, forgot password).
// Signed-in users are sent on to verification or home.
export default async function AuthPage({ mode, eyebrow, title, sub, defaultEmail, notice, children }) {
  const user = await getUser();
  if (user) redirect(await homeFor(await createClient(), user.id));
  return (
    <AuthShell eyebrow={eyebrow ?? (mode === "signup" ? "Early access" : "Welcome back")} title={title} sub={sub}>
      {children ?? <AuthForm mode={mode} defaultEmail={defaultEmail} notice={notice} />}
    </AuthShell>
  );
}
