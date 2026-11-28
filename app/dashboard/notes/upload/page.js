import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireVerified } from "../../../../lib/dash/ctx";
import { aiConfig } from "../../../../lib/exams/config";
import { adminClient } from "../../../../lib/supabase/admin";
import { EXAM_LABEL, SEMESTERS, cleanCourseCode } from "../../../../lib/papers/constants";
import PaperUpload from "../../../../components/dashboard/PaperUpload";

export const metadata = { title: "Upload a paper or notes" };

export default async function UploadPage({ searchParams }) {
  const sp = await searchParams;
  const one = (v) => (Array.isArray(v) ? v[0] : v) || "";
  const { supabase, user, profile } = await requireVerified();
  const [{ data: departments }, { data: known }] = await Promise.all([
    supabase.from("departments").select("name").eq("active", true).order("sort"),
    supabase.from("notes").select("id, kind, course_code, subject, exam_type, exam_year").eq("status", "approved").not("course_code", "is", null).limit(1000),
  ]);
  const names = (departments || []).map((d) => d.name);
  const dept = names.includes(one(sp.dept)) ? one(sp.dept) : names.includes(profile.branch) ? profile.branch : "";
  const start = {
    kind: one(sp.kind) === "notes" ? "notes" : "paper",
    branch: dept,
    semester: SEMESTERS.includes(Number(one(sp.sem))) ? Number(one(sp.sem)) : "",
    examType: EXAM_LABEL[one(sp.exam)] ? one(sp.exam) : "",
    courseCode: cleanCourseCode(one(sp.course)) || "",
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Share with your juniors</h1>
          <p>Add the file, check the details, done.</p>
        </div>
        <Link className="btn-s" href="/dashboard/notes"><ArrowLeft size={16} /> Back to papers</Link>
      </div>
      <PaperUpload userId={user.id} departments={names} known={known || []} start={start} aiReady={aiConfig().providers.length > 0} instantReady={Boolean(adminClient())} />
    </>
  );
}
