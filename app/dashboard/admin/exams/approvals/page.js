import Link from "next/link";
import { after } from "next/server";
import { requireApprover } from "../../../../../lib/dash/ctx";
import { purgeExpiredPdfs, retentionDays } from "../../../../../lib/exams/retention";
import { CATEGORY_LABELS } from "../../../../../lib/exams/constants";

export const metadata = { title: "Exam approvals" };

const TABS = [
  ["pending_approval", "Waiting for approval", "#f3b63f"], ["approved", "Approved, not published", "#8ec5d6"], ["changes_requested", "Changes requested", "#e8603c"],
  ["published", "Published", "#7fb48a"], ["rejected", "Rejected", "#e8603c"], ["archived", "Archived", "#d9c8a8"], ["draft", "Drafts", "#d9c8a8"],
];
const when = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");

export default async function ExamApprovals({ searchParams }) {
  const { supabase, isSuper } = await requireApprover();
  // Housekeeping after the page is sent: remove the PDFs of notices whose exams ended long ago (rows stay).
  after(() => purgeExpiredPdfs(supabase, retentionDays()));
  const sp = await searchParams;
  const tab = TABS.some((t) => t[0] === sp?.status) ? sp.status : "pending_approval";

  const [{ data: all }, { data: list, error }] = await Promise.all([
    supabase.from("exam_notices").select("status").limit(5000),
    supabase.from("exam_notices")
      .select("id, title, category, special_kind, original_exam_name, status, audience_depts, semesters, submitted_by, submitted_at, reviewed_at, published_at, created_at")
      .eq("status", tab).order("submitted_at", { ascending: tab === "pending_approval", nullsFirst: false }).order("created_at", { ascending: false }).limit(100),
  ]);
  const counts = {};
  for (const r of all || []) counts[r.status] = (counts[r.status] || 0) + 1;

  const ids = [...new Set((list || []).map((n) => n.submitted_by).filter(Boolean))];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const names = Object.fromEntries((people || []).map((p) => [p.id, p.full_name]));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Exam approvals</h1>
          <p>{isSuper ? "Notices sent in by information staff. Nothing reaches students until a head of department, cluster head or central admin approves and publishes it." : "Notices sent in for the departments you head. Nothing reaches students until you approve and publish it."}</p>
        </div>
      </div>

      <div className="stat-row">
        {TABS.filter((t) => t[0] !== "draft").map(([key, label, color]) => (
          <Link key={key} href={`/dashboard/admin/exams/approvals?status=${key}`} className={`stat-tile${tab === key ? " on" : ""}`} style={{ "--c": color }} aria-current={tab === key ? "page" : undefined}>
            <b>{counts[key] || 0}</b><span>{label}</span>
          </Link>
        ))}
      </div>

      {error && <p className="form-msg err">{error.message}</p>}
      {!list?.length ? (
        <div className="empty"><h2>Nothing here</h2><p>{tab === "pending_approval" ? "No notices are waiting for approval." : "No notices with this status."}</p></div>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Notice</th><th>Category</th><th>For</th><th>Submitted</th><th /></tr></thead>
            <tbody>{list.map((n) => (
              <tr key={n.id}>
                <td><b>{n.title}</b>{n.original_exam_name && <small>As written: {n.original_exam_name}</small>}</td>
                <td>{n.category ? <b>{CATEGORY_LABELS[n.category]}</b> : <span className="pill soft" style={{ "--c": "#f3b63f" }}>Requires admin review</span>}</td>
                <td>{n.audience_depts.join(", ")}<small>{n.semesters?.length ? `Sem ${n.semesters.join(", ")}` : "All semesters"}</small></td>
                <td>{when(n.submitted_at || n.created_at)}<small>{names[n.submitted_by] || ""}</small></td>
                <td className="row-actions"><Link className="btn-s" href={`/dashboard/admin/exams/${n.id}`}>{n.status === "pending_approval" ? "Review" : "Open"}</Link></td>
              </tr>))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
