import { requireAdmin } from "../../../../lib/dash/ctx";
import { PendingNote, ReportRow } from "../../../../components/dashboard/ModerationUI";

export const metadata = { title: "Moderation" };

export default async function Moderation() {
  const { supabase } = await requireAdmin();
  const [{ data: reports, error }, { data: pending }] = await Promise.all([
    supabase.rpc("report_queue"),
    supabase.from("notes").select("*").eq("status", "pending").order("created_at"),
  ]);
  const ids = [...new Set((pending || []).map((n) => n.uploader_id))];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id,full_name").in("id", ids) : { data: [] };
  const name = new Map((people || []).map((p) => [p.id, p.full_name]));
  // Why the AI check did not publish a paper by itself (empty when there was no check).
  const paths = (pending || []).map((n) => n.file?.path).filter(Boolean);
  const { data: checks } = paths.length ? await supabase.from("note_checks").select("path,reasons").in("path", paths) : { data: [] };
  const why = new Map((checks || []).map((c) => [c.path, c.reasons]));
  return (
    <>
      <div className="page-head"><div><h1>Moderation</h1><p>{reports?.length || 0} open report{reports?.length === 1 ? "" : "s"} and {pending?.length || 0} upload{pending?.length === 1 ? "" : "s"} waiting for review. Every decision is written to the audit log.</p></div></div>
      {error && <p className="form-msg err">{error.message}</p>}
      <h2 style={{ fontFamily: "var(--font-d)" }}>Reports</h2>
      {!reports?.length ? <div className="empty"><h2>No open reports</h2><p>Reports from students show up here.</p></div> : <div className="feed">{reports.map((r) => <ReportRow key={r.id} r={r} />)}</div>}
      <h2 style={{ fontFamily: "var(--font-d)", marginTop: 28 }}>Papers and notes waiting for review</h2>
      {!pending?.length ? <div className="empty"><h2>Nothing to review</h2><p>New note and paper uploads appear here before they go live.</p></div> : <div className="feed">{pending.map((n) => <PendingNote key={n.id} n={n} uploader={name.get(n.uploader_id)} reasons={why.get(n.file?.path)} />)}</div>}
    </>
  );
}
