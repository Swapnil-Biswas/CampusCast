import { requireSuper } from "../../../../lib/dash/ctx";
import RoleRow from "../../../../components/dashboard/RoleRow";

export const metadata = { title: "People & roles" };

export default async function People({ searchParams }) {
  const sp = await searchParams;
  const q = String(sp.q || "").trim().replace(/[%,()]/g, "");
  const { supabase, user } = await requireSuper();
  let query = supabase.from("profiles").select("id,email,full_name,branch,year,status,role").order("role", { ascending: false }).order("full_name").limit(100);
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,usn.ilike.%${q}%`);
  const { data, error } = await query;
  return (
    <>
      <div className="page-head"><div><h1>People &amp; roles</h1><p>Only ID-verified students can be made admins. Every change is written to the audit log.</p></div></div>
      <form className="filters" role="search"><label className="sel"><span>Find</span><input name="q" defaultValue={q} placeholder="Name, email or USN" /></label><button className="chip">Search</button></form>
      {error && <p className="form-msg err">{error.message}</p>}
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Student</th><th>Branch</th><th>Status</th><th>Role</th></tr></thead>
          <tbody>{(data || []).map((p) => <RoleRow key={p.id} p={p} self={p.id === user.id} />)}</tbody>
        </table>
      </div>
    </>
  );
}
