import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "../../../../../lib/dash/ctx";
import { manageableDepartments } from "../../../../../lib/exams/access";
import { isUuid } from "../../../../../lib/exams/validate";
import ExamDecision from "../../../../../components/dashboard/ExamDecision";
import ExamReview from "../../../../../components/dashboard/ExamReview";

export const metadata = { title: "Review exam notice" };

export default async function ReviewNotice({ params }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase, user, isSuper } = await requireAdmin();

  const [{ data: notice }, { data: docs }, { data: entries }, { data: approvals }, departments] = await Promise.all([
    supabase.from("exam_notices").select("*").eq("id", id).maybeSingle(),
    supabase.from("exam_documents").select("id, original_filename, storage_path, mime_type, page_count, size_bytes, created_at, deleted_at, extractions:exam_extractions(id, status, error, attempt, created_at, field_meta, result, ocr_used)").eq("notice_id", id).order("created_at"),
    supabase.from("exam_timetable_entries").select("*").eq("notice_id", id).order("sort").order("exam_date").order("start_time"),
    supabase.from("exam_approvals").select("id, action, from_status, to_status, reason, created_at, actor").eq("notice_id", id).order("created_at", { ascending: false }),
    manageableDepartments(supabase, user.id, isSuper),
  ]);
  if (!notice) notFound();

  const doc = docs?.[0] || null;
  let pdfUrl = null;
  if (doc && !doc.deleted_at) {
    const { data: signed } = await supabase.storage.from("exam-pdfs").createSignedUrl(doc.storage_path, 3600);
    pdfUrl = signed?.signedUrl || null;
  }
  const latest = doc ? [...(doc.extractions || [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null : null;

  const actorIds = [...new Set((approvals || []).map((a) => a.actor).filter(Boolean))];
  const { data: actors } = actorIds.length ? await supabase.from("profiles").select("id, full_name").in("id", actorIds) : { data: [] };
  const names = Object.fromEntries((actors || []).map((a) => [a.id, a.full_name]));

  // Whether this person may decide on the notice (the database enforces the same rule).
  const { data: canDecide } = await supabase.rpc("can_approve_exam_depts", { p_depts: notice.audience_depts });
  const decider = canDecide === true;
  const ownSubmission = notice.submitted_by === user.id && !isSuper;
  const manage = new Set(departments.map((d) => d.name));
  const canEdit = ["draft", "changes_requested"].includes(notice.status) && notice.audience_depts.every((d) => manage.has(d));

  return (
    <>
      <Link href={decider ? "/dashboard/admin/exams/approvals" : "/dashboard/admin/exams"} className="back-link"><ArrowLeft size={16} /> {decider ? "Exam approvals" : "All exam notices"}</Link>
      {decider && <ExamDecision noticeId={notice.id} status={notice.status} category={notice.category} audience={notice.audience_depts} ownSubmission={ownSubmission} />}
      <ExamReview
        notice={notice}
        entries={entries || []}
        departments={departments}
        pdf={doc && { url: pdfUrl, filename: doc.original_filename, pages: doc.page_count, mime: doc.mime_type, removed: Boolean(doc.deleted_at) }}
        extraction={latest && { status: latest.status, error: latest.error, ocr: latest.ocr_used, fieldMeta: latest.field_meta || {}, warnings: notice.details?.extraction?.warnings || [] }}
        history={(approvals || []).map((a) => ({ id: a.id, action: a.action, to: a.to_status, reason: a.reason, at: a.created_at, by: names[a.actor] || "Admin" }))}
        canEdit={canEdit}
      />
    </>
  );
}
