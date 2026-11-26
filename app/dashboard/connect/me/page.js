import Link from "next/link";
import { requireVerified } from "../../../../lib/dash/ctx";
import { ConnectProfileForm } from "../../../../components/dashboard/PeopleUI";
import { aiConfig } from "../../../../lib/exams/config";
import { isOwnFile } from "../../../../lib/connect/files";

export const metadata = { title: "My Connect profile" };
export const maxDuration = 300;   // reading documents with AI can take a minute or more

export default async function MyConnectProfile() {
  const { supabase, user } = await requireVerified();
  const [{ data: me, error: e0 }, { data: row, error: e1 }] = await Promise.all([
    supabase.from("profiles").select("person_type").eq("id", user.id).maybeSingle(),
    supabase.from("people_profiles").select("*").eq("user_id", user.id).maybeSingle(),
  ]);
  if (e0 || e1) {
    return (
      <>
        <div className="page-head"><div><h1>My Connect profile</h1></div></div>
        <div className="empty"><h2>Not set up yet</h2><p>Run <code>supabase/dashboard-9-connect-people.sql</code> in the Supabase SQL Editor, then reload this page.</p></div>
      </>
    );
  }
  const faculty = me?.person_type === "faculty";
  // Automatic filling needs dashboard-10. Without it the page still works for typing.
  const [{ data: reading, error: e2 }, { data: list }] = await Promise.all([
    supabase.from("people_readings").select("draft").eq("user_id", user.id).maybeSingle(),
    supabase.storage.from("profile-files").list(user.id, { limit: 20 }),
  ]);
  const autofill = e2 ? null : {
    userId: user.id, reading: reading?.draft || null, aiReady: !!aiConfig().apiKey,
    files: (list || []).map((f) => `${user.id}/${f.name}`).filter((p) => isOwnFile(p, user.id)),
  };
  return (
    <>
      <div className="page-head">
        <div>
          <h1>My Connect profile</h1>
          <p>{faculty ? "Tell students what you research and where your work is going." : "Tell other students and faculty what you are good at and what you want to do."} Nothing is shown to anyone until you switch visibility on. {row && <Link className="link-btn" href={`/dashboard/connect/people/${user.id}`}>See how it looks to others</Link>}</p>
        </div>
      </div>
      {e2 && <p className="form-msg err">To fill your profile automatically from a resume, run <code>supabase/dashboard-10-connect-autofill.sql</code> in the Supabase SQL Editor.</p>}
      <ConnectProfileForm p={row || {}} faculty={faculty} autofill={autofill} />
    </>
  );
}
