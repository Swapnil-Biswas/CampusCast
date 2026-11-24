import { requireAdmin } from "../../../../lib/dash/ctx";
import { fmtDate } from "../../../../lib/dash/meta";

export const metadata = { title: "Audit log" };

const label = {
  "verification.approved": "Approved a student ID", "verification.rejected": "Sent an ID back", "role.changed": "Changed a role",
  "notice.created": "Created a notice", "notice.live": "Published a notice", "notice.archived": "Archived a notice", "notice.deleted": "Deleted a notice",
  "club_lead.added": "Added a club lead", "club_lead.removed": "Removed a club lead",
};

export default async function Audit() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("audit_feed", { p_limit: 200 });
  return (
    <>
      <div className="page-head"><div><h1>Audit log</h1><p>Who did what, newest first. Entries cannot be edited or deleted.</p></div></div>
      {error && <p className="form-msg err">{error.message}</p>}
      {!data?.length ? <div className="empty"><h2>Nothing yet</h2><p>Admin actions will be recorded here.</p></div> : (
        <div className="table-wrap"><table className="tbl">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead>
          <tbody>{data.map((e) => (
            <tr key={e.id}>
              <td>{fmtDate(e.created_at)}</td>
              <td><b>{e.actor_name || "System"}</b><small>{e.actor_email}</small></td>
              <td>{label[e.action] || e.action}</td>
              <td><small>{[e.detail?.title, e.detail?.role && `role: ${e.detail.role}`, e.detail?.note && `note: ${e.detail.note}`].filter(Boolean).join(" · ") || e.target_type}</small></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </>
  );
}
