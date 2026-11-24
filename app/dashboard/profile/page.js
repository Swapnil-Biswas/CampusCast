import { requireVerified } from "../../../lib/dash/ctx";
import { ROLE_LABEL, shortBranch } from "../../../lib/dash/meta";
import { ProfileForm, Unblock } from "../../../components/dashboard/AccountUI";

export const metadata = { title: "My profile" };

export default async function Profile() {
  const { supabase, user, profile } = await requireVerified();
  const [{ data: me }, { data: blocks }, { data: follows }] = await Promise.all([
    supabase.from("profiles").select("bio,section,skills,interests").eq("id", user.id).maybeSingle(),
    supabase.from("blocks").select("blocked").eq("blocker", user.id),
    supabase.from("club_follows").select("clubs(name)").eq("user_id", user.id),
  ]);
  const ids = (blocks || []).map((b) => b.blocked);
  const { data: names } = ids.length ? await supabase.rpc("author_names", { p_ids: ids }) : { data: [] };
  const nameOf = new Map((names || []).map((n) => [n.id, n.full_name]));

  return (
    <>
      <div className="page-head"><div><h1>My profile</h1><p>Your college details come from your verified ID and can only be changed by an admin. The rest is yours to edit.</p></div></div>
      <dl className="facts" style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 18px", margin: "0 0 22px" }}>
        <dt>Name</dt><dd>{profile.full_name}</dd>
        <dt>College email</dt><dd>{profile.email}</dd>
        <dt>Branch</dt><dd>{shortBranch(profile.branch)}</dd>
        <dt>Year</dt><dd>{profile.year}</dd>
        {profile.usn && <><dt>USN</dt><dd>{profile.usn}</dd></>}
        <dt>Role</dt><dd>{ROLE_LABEL[profile.role] || "Student"}</dd>
        <dt>Clubs followed</dt><dd>{(follows || []).map((f) => f.clubs?.name).filter(Boolean).join(", ") || "None yet. Follow clubs on the Cultural events page."}</dd>
      </dl>
      <ProfileForm p={me || {}} />

      <h2 style={{ fontSize: 18, margin: "28px 0 8px" }}>People you blocked</h2>
      {!ids.length ? <p className="audience">Nobody. You can block someone from the Report menu on any post.</p> : (
        <ul className="files">{ids.map((id) => <li key={id}><span className="file">{nameOf.get(id) || "A student"} <Unblock id={id} /></span></li>)}</ul>
      )}
    </>
  );
}
