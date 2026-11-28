"use server";
import { revalidatePath } from "next/cache";
import { requireVerified } from "../../../lib/dash/ctx";
import { adminClient } from "../../../lib/supabase/admin";
import { FIRST_YEAR, EXAM_LABEL, MAX_UPLOAD_BYTES, OFFICE_MIME, cleanCourseCode, cleanCourseName, paperTitle } from "../../../lib/papers/constants";
import { sha256 } from "../../../lib/papers/read";
import { sniffFile } from "../../../lib/exams/pdf";

const str = (v, n) => String(v ?? "").trim().slice(0, n);
const NEEDS_SQL = "The database update for notes and papers is missing. Run supabase/dashboard-11-notes-papers.sql in the Supabase SQL Editor.";

// Saves an upload whose file is already in the student's own storage folder. It starts as "pending"; a question paper
// whose AI check passed and agrees with these details is published at once.
export async function submitUpload(input) {
  const { supabase, user } = await requireVerified();
  const path = String(input?.path || "");
  const ext = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|docx|pptx)$/i.exec(path)?.[1]?.toLowerCase();
  if (!ext || !path.startsWith(`${user.id}/`)) return { error: "Attach a file first." };

  const kind = input.kind === "notes" ? "notes" : "paper";
  const semester = Number(input.semester);
  const courseCode = cleanCourseCode(input.courseCode);
  const courseName = cleanCourseName(input.courseName);
  const examType = kind === "paper" && Object.hasOwn(EXAM_LABEL, input.examType) ? input.examType : null;
  const year = Number(input.examYear);
  const examYear = kind === "paper" && Number.isInteger(year) && year >= FIRST_YEAR && year <= new Date().getFullYear() ? year : null;
  if (!courseCode) return { error: "Enter the course code, for example BCS304." };
  if (!(Number.isInteger(semester) && semester >= 1 && semester <= 8)) return { error: "Pick a semester." };
  if (kind === "paper" && !examType) return { error: "Pick the exam." };
  if (kind === "paper" && !examYear) return { error: "Enter the year the exam was held." };

  const branch = str(input.branch, 80) || null;
  if (branch) {
    const { data } = await supabase.from("departments").select("name").eq("name", branch).maybeSingle();
    if (!data) return { error: "Pick a department from the list." };
  }
  const title = kind === "paper" ? paperTitle({ courseCode, courseName, examType, examYear }) : str(input.title, 140);
  if (title.length < 3) return { error: "Give your notes a title." };

  // The file is checked and fingerprinted here, from the stored copy, not from anything the browser says.
  const { data: file, error: dlError } = await supabase.storage.from("notes").download(path);
  if (dlError || !file) return { error: "Could not open the uploaded file. Please upload it again." };
  const bytes = Buffer.from(await file.arrayBuffer());
  const pdf = ext === "pdf" ? sniffFile(bytes) : null;
  const looksRight = pdf ? pdf.ok && pdf.kind === "pdf" : bytes.length > 4 && bytes.readUInt32LE(0) === 0x04034b50;
  if (!looksRight || bytes.length > MAX_UPLOAD_BYTES) {
    await supabase.storage.from("notes").remove([path]);
    return { error: pdf && !pdf.ok ? pdf.message : "That file is not a PDF, Word or PowerPoint file of up to 15 MB." };
  }
  const hash = sha256(bytes);
  const pages = pdf?.pageCount;

  const { data: row, error } = await supabase.from("notes").insert({
    kind, title, subject: courseName || courseCode, semester, branch,
    description: kind === "notes" ? str(input.description, 1000) || null : null,
    course_code: courseCode, exam_type: examType, exam_year: examYear,
    pages: pages >= 1 && pages <= 2000 ? pages : null,
    file: { name: str(input.filename, 120) || `file.${ext}`, path, size: bytes.length, type: ext === "pdf" ? "application/pdf" : OFFICE_MIME[ext] },
    sha256: hash,
  }).select("id").single();
  if (error) {
    if (error.code === "23505") {
      await supabase.storage.from("notes").remove([path]);
      const { data: same } = await supabase.from("notes").select("id").eq("sha256", hash).neq("status", "rejected").maybeSingle();
      return { error: "This exact file has already been uploaded.", duplicate: true, existingId: same?.id || null };
    }
    return { error: /course_code|exam_type|exam_year|pages|column/i.test(error.message) ? NEEDS_SQL : error.message };
  }

  let published = false;
  const admin = kind === "paper" ? adminClient() : null;
  if (admin) {
    const { data, error: publishError } = await admin.rpc("publish_checked_note", { p_note: row.id, p_sha: hash });
    if (publishError) console.error("[paper publish]", publishError.code || "", publishError.message);   // it waits for an admin instead
    published = data === true;
  }
  revalidatePath("/dashboard/notes");
  return { ok: true, id: row.id, status: published ? "approved" : "pending" };
}

export async function deleteUpload(id) {
  const { supabase } = await requireVerified();
  const { data, error } = await supabase.from("notes").delete().eq("id", id).select("file");
  if (error) return { error: error.message };
  if (data?.[0]?.file?.path) await supabase.storage.from("notes").remove([data[0].file.path]);   // free the storage space too
  revalidatePath("/dashboard/notes");
  return { ok: true };
}
