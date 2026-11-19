import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, Clock } from "lucide-react";
import SiteNav from "../../components/SiteNav";
import VerifyForm from "../../components/verify/VerifyForm";
import { createClient } from "../../lib/supabase/server";
import { getProfile } from "../../lib/profile";
import { isCollegeEmail, parseStudentEmail } from "../../lib/college";
import { signOut } from "../auth/actions";

export const metadata = { title: "Verify your student ID · CampusCast" };

export default async function VerifyPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/signin");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { profile, setupMissing } = await getProfile(supabase, user.id);
  const collegeEmail = await isCollegeEmail(supabase, user.email);
  const status = profile?.status ?? "unverified";
  const detected = parseStudentEmail(user.email);

  let body;
  if (!collegeEmail) {
    body = (
      <>
        <h1 className="display">Wrong <em>email</em>.</h1>
        <p className="auth-sub">
          {user.email} isn&apos;t a college email, so this account can&apos;t be verified.
          Sign out and create a new account with your college email.
        </p>
        <form action={signOut}><button className="btn btn-primary" type="submit">Sign out</button></form>
      </>
    );
  } else if (setupMissing) {
    body = (
      <>
        <h1 className="display">Almost <em>ready</em>.</h1>
        <p className="form-msg">Verification isn&apos;t set up in Supabase yet. Run supabase/setup.sql in the Supabase SQL Editor.</p>
      </>
    );
  } else if (status === "verified") {
    body = (
      <>
        <h1 className="display">You&apos;re <em>verified</em>.</h1>
        <p className="verify-badge"><BadgeCheck /> {profile.full_name} · {profile.usn ? `${profile.usn} · ` : ""} {profile.branch} · Year {profile.year}</p>
        <Link href="/" className="btn btn-primary">Go to CampusCast</Link>
      </>
    );
  } else if (status === "pending") {
    body = (
      <>
        <h1 className="display">Under <em>review</em>.</h1>
        <p className="verify-badge"><Clock /> {profile.full_name} · {profile.usn ? `${profile.usn} · ` : ""} {profile.branch} · Year {profile.year}</p>
        <p className="auth-sub">
          Thanks! An admin is checking your student ID card. This usually takes a day.
          You can still look around in the meantime.
        </p>
        <Link href="/" className="btn btn-ghost">Back to home</Link>
      </>
    );
  } else {
    body = (
      <>
        <h1 className="display">Verify your <em>ID</em>.</h1>
        <p className="auth-sub">
          One last step. Tell us your branch and year and add a photo of your student ID card,
          so everyone on CampusCast is a real student.
        </p>
        {status === "rejected" && (
          <p className="form-msg">
            Your last submission wasn&apos;t approved{profile.review_note ? `: ${profile.review_note}` : "."} Please try again.
          </p>
        )}
        <VerifyForm
          detected={detected}
          defaults={{
            fullName: profile?.full_name || user.user_metadata?.full_name || "",
            branch: profile?.branch || detected?.branch || "",
            year: profile?.year || detected?.year || "",
          }}
        />
      </>
    );
  }

  return (
    <>
      <SiteNav />
      <main className="auth">
        <div className="container">
          <div className="auth-card verify-card">
            <p className="eyebrow">Step 2 of 2 · Student verification</p>
            {body}
          </div>
        </div>
      </main>
    </>
  );
}
