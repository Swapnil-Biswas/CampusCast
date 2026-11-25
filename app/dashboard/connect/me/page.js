import Link from "next/link";
import { requireVerified } from "../../../../lib/dash/ctx";
import { ConnectProfileForm } from "../../../../components/dashboard/PeopleUI";

export const metadata = { title: "My Connect profile" };

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
  return (
    <>
      <div className="page-head">
        <div>
          <h1>My Connect profile</h1>
          <p>{faculty ? "Tell students what you research and where your work is going." : "Tell other students and faculty what you are good at and what you want to do."} Nothing is shown to anyone until you switch visibility on. {row && <Link className="link-btn" href={`/dashboard/connect/people/${user.id}`}>See how it looks to others</Link>}</p>
        </div>
      </div>
      <ConnectProfileForm p={row || {}} faculty={faculty} />
    </>
  );
}
