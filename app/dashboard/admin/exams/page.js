import { requireAdmin } from "../../../../lib/dash/ctx";
import { manageableDepartments } from "../../../../lib/exams/access";
import { aiConfig } from "../../../../lib/exams/config";
import { CATEGORY_LABELS } from "../../../../lib/exams/constants";
import ExamUploader from "../../../../components/dashboard/ExamUploader";
import ExamUploads from "../../../../components/dashboard/ExamUploads";

export const metadata = { title: "Exam notices" };

export default async function ExamNotices() {
  const { supabase, user, isSuper } = await requireAdmin();
  const departments = await manageableDepartments(supabase, user.id, isSuper);

  const { data, error } = await supabase
    .from("exam_documents")
    .select("id, original_filename, page_count, created_at, notice:exam_notices(id, title, status, category, audience_depts), extractions:exam_extractions(id, status, error, created_at, field_meta)")
    .order("created_at", { ascending: false })
    .limit(30);

  const rows = (data || []).filter((d) => d.notice).map((d) => {
    const latest = [...(d.extractions || [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;
    return {
      docId: d.id,
      noticeId: d.notice.id,
      filename: d.original_filename,
      pages: d.page_count,
      created: d.created_at,
      category: d.notice.category ? CATEGORY_LABELS[d.notice.category] : null,
      noticeStatus: d.notice.status,
      depts: d.notice.audience_depts,
      x: latest && { id: latest.id, status: latest.status, error: latest.error, retryable: latest.field_meta?._failure?.retryable !== false },
    };
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Exam notices</h1>
          <p>Upload an official examination PDF. CampusCast reads it, fills in the details and keeps it as a draft. Nothing reaches students until it is approved and published.</p>
        </div>
      </div>

      {departments.length === 0 ? (
        <div className="empty">
          <h2>No departments assigned to you yet</h2>
          <p>A central admin needs to give you your department(s) before you can upload exam notices.</p>
        </div>
      ) : (
        <ExamUploader userId={user.id} departments={departments} aiReady={Boolean(aiConfig().apiKey)} keyName={aiConfig().keyName} />
      )}

      <h2 className="sub-h">Recent uploads</h2>
      {error && <p className="form-msg err">{error.message}</p>}
      <ExamUploads rows={rows} />
    </>
  );
}
