"use server";
import { createHash } from "node:crypto";
import { requireAdmin, requireSuper } from "../../../../lib/dash/ctx";
import { manageableDepartments } from "../../../../lib/exams/access";
import { aiConfig } from "../../../../lib/exams/config";
import { sniffFile } from "../../../../lib/exams/pdf";
import { STALE_PROCESSING_MS } from "../../../../lib/exams/constants";
import { clean } from "../../../../lib/exams/normalize";
import { isUuid, validateDecision, validateNotice, validateRows } from "../../../../lib/exams/validate";

const BUCKET = "exam-pdfs";
const HEX64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UPLOADS_PER_HOUR = 30;   // a simple guard on AI cost

const message = (e) => (e?.message ? String(e.message).slice(0, 240) : "Something went wrong.");

// Is a file with this fingerprint already uploaded for a notice this admin can see?
export async function checkDuplicate(sha256) {
  const { supabase } = await requireAdmin();
  const sha = String(sha256 || "").toLowerCase();
  if (!HEX64.test(sha)) return { duplicates: [] };
  const { data } = await supabase.rpc("exam_find_duplicates", { p_sha256: sha });
  return { duplicates: (data || []).map((d) => ({ id: d.notice_id, title: d.title, status: d.status })) };
}

// Called after the browser has uploaded the file straight into storage. Checks the file, then creates the draft
// notice, its document row and a queued extraction. The browser then starts the extraction (/api/exams/extract).
export async function registerExamUpload({ path, filename, departments, allowDuplicate = false }) {
  const { supabase, user, isSuper } = await requireAdmin();
  const fail = async (error, removeObject = true) => {
    if (removeObject && path) await supabase.storage.from(BUCKET).remove([path]);
    return { error };
  };

  const folder = `${user.id}/`;
  if (typeof path !== "string" || !path.startsWith(folder) || !/^[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/i.test(path.slice(folder.length))) return { error: "Invalid upload." };

  const allowed = await manageableDepartments(supabase, user.id, isSuper);
  const allowedNames = new Set(allowed.map((d) => d.name));
  const depts = [...new Set(Array.isArray(departments) ? departments : [])].filter((d) => typeof d === "string");
  if (!depts.length) return fail("Choose at least one department.");
  if (depts.some((d) => !allowedNames.has(d))) return fail("You can only upload for departments you manage.");

  const since = new Date(Date.now() - 3600e3).toISOString();
  const { count } = await supabase.from("exam_documents").select("id", { count: "exact", head: true }).eq("uploaded_by", user.id).gte("created_at", since);
  if ((count || 0) >= UPLOADS_PER_HOUR) return fail("Too many uploads in the last hour. Please try again later.");

  // Read the stored file back and check it on the server: never trust what the browser says about it.
  const { data: file, error: dlErr } = await supabase.storage.from(BUCKET).download(path);
  if (dlErr || !file) return { error: "The upload was not found. Please try again." };
  const bytes = Buffer.from(await file.arrayBuffer());
  const sniff = sniffFile(bytes);
  if (!sniff.ok) return fail(sniff.message);
  if (!path.toLowerCase().endsWith(`.${sniff.ext}`)) return fail("The file does not match its type. Please upload it again.");
  const sha = createHash("sha256").update(bytes).digest("hex");

  const { data: dups } = await supabase.rpc("exam_find_duplicates", { p_sha256: sha });
  if (dups?.length && !allowDuplicate) return fail("This exact file has already been uploaded.");

  const name = clean(String(filename || "notice.pdf"), 160) || "notice.pdf";
  const title = clean(name.replace(/\.(pdf|jpe?g|png|webp)$/i, "").replace(/[_-]+/g, " "), 200);
  const { data: notice, error: nErr } = await supabase.from("exam_notices")
    .insert({ title: title.length >= 3 ? title : "Examination notice", audience_depts: depts, created_by: user.id })
    .select("id").single();
  if (nErr) return fail(message(nErr));

  const { data: doc, error: dErr } = await supabase.from("exam_documents")
    .insert({ notice_id: notice.id, storage_path: path, original_filename: name, mime_type: sniff.mime, size_bytes: bytes.length, sha256: sha, page_count: sniff.pageCount, uploaded_by: user.id })
    .select("id").single();
  if (dErr) { await supabase.from("exam_notices").delete().eq("id", notice.id); return fail(message(dErr)); }

  const { data: ex, error: xErr } = await supabase.from("exam_extractions")
    .insert({ document_id: doc.id, status: "queued", model: aiConfig().model })
    .select("id").single();
  if (xErr) { await supabase.from("exam_notices").delete().eq("id", notice.id); return fail(message(xErr)); }

  return { noticeId: notice.id, documentId: doc.id, extractionId: ex.id, pageCount: sniff.pageCount };
}

// A failed (or stuck) extraction gets a fresh attempt. The old row stays as the record of what happened.
export async function retryExtraction(extractionId) {
  const { supabase } = await requireAdmin();
  if (!UUID.test(String(extractionId))) return { error: "Invalid request." };
  const { data: old } = await supabase.from("exam_extractions").select("id, document_id, status, attempt, started_at").eq("id", extractionId).maybeSingle();
  if (!old) return { error: "That extraction was not found." };
  const stuck = old.status === "processing" && old.started_at && Date.now() - new Date(old.started_at).getTime() > STALE_PROCESSING_MS;
  if (old.status !== "failed" && !stuck) return { error: "Only a failed extraction can be retried." };
  const { data: next, error } = await supabase.from("exam_extractions")
    .insert({ document_id: old.document_id, status: "queued", attempt: (old.attempt || 1) + 1, model: aiConfig().model })
    .select("id").single();
  if (error) return { error: message(error) };
  return { extractionId: next.id };
}

// Save the review screen: the notice's details and its timetable rows. With submit:true it then sends the notice
// for central approval. The database re-checks everything (who may edit, which status, what a submit needs).
export async function saveReview({ noticeId, notice, rows, submit = false }) {
  const { supabase, user, isSuper } = await requireAdmin();
  if (!isUuid(noticeId)) return { error: "Invalid request." };

  const { data: current } = await supabase.from("exam_notices").select("id, status, audience_depts, details").eq("id", noticeId).maybeSingle();
  if (!current) return { error: "That notice was not found." };
  if (!["draft", "changes_requested"].includes(current.status)) return { error: "This notice can no longer be edited." };

  const allowed = (await manageableDepartments(supabase, user.id, isSuper)).map((d) => d.name);
  const vn = validateNotice(notice, { allowedDepartments: allowed });
  if (!vn.ok) return { error: vn.errors[0], errors: vn.errors };
  const audience = vn.value.audience_depts || current.audience_depts;
  const vr = validateRows(rows, { category: vn.value.category, audience });
  if (!vr.ok) return { error: vr.errors[0], errors: vr.errors };

  const details = { ...(current.details || {}), importantDates: vn.details.importantDates, instructions: vn.details.instructions };
  const { data: saved, error: nErr } = await supabase.from("exam_notices").update({ ...vn.value, details }).eq("id", noticeId).select("id");
  if (nErr) return { error: message(nErr) };
  if (!saved?.length) return { error: "This notice can no longer be edited." };

  // Timetable: update the rows that still exist, add the new ones, then remove the ones that were deleted.
  const { data: existing, error: eErr } = await supabase.from("exam_timetable_entries").select("id").eq("notice_id", noticeId);
  if (eErr) return { error: message(eErr) };
  const have = new Set((existing || []).map((e) => e.id));
  const keep = new Set();
  const inserts = [];
  for (const { id, ...row } of vr.rows) {
    if (id && have.has(id)) {
      keep.add(id);
      const { error } = await supabase.from("exam_timetable_entries").update(row).eq("id", id).eq("notice_id", noticeId);
      if (error) return { error: message(error) };
    } else inserts.push({ ...row, notice_id: noticeId });
  }
  if (inserts.length) {
    const { data: added, error } = await supabase.from("exam_timetable_entries").insert(inserts).select("id");
    if (error) return { error: message(error) };
    (added || []).forEach((a) => keep.add(a.id));
  }
  const drop = [...have].filter((id) => !keep.has(id));
  if (drop.length) {
    const { error } = await supabase.from("exam_timetable_entries").delete().in("id", drop).eq("notice_id", noticeId);
    if (error) return { error: message(error) };
  }

  if (!submit) return { ok: true, saved: true };
  const { error: tErr } = await supabase.rpc("exam_notice_transition", { p_id: noticeId, p_action: "submit", p_reason: null });
  if (tErr) return { error: message(tErr), saved: true };
  return { ok: true, saved: true, submitted: true };
}

// A central admin's decision on a submitted notice. Only exam_notice_transition() can change the status, and it
// re-checks the role, the current status and the reason. Publishing is what notifies students.
export async function decideNotice({ noticeId, action, reason }) {
  const { supabase } = await requireAdmin();   // the database checks that this person approves for ALL the notice's departments
  if (!isUuid(noticeId)) return { error: "Invalid request." };
  const v = validateDecision({ action, reason });
  if (!v.ok) return { error: v.error };
  const { error } = await supabase.rpc("exam_notice_transition", { p_id: noticeId, p_action: v.action, p_reason: v.reason });
  if (error) return { error: message(error) };
  return { ok: true };
}

// A central admin chooses which departments a staff member uploads for and which they approve for
// (head of department: one; cluster head: several).
export async function setExamAccess({ userId, uploadDepts, approveDepts }) {
  const { supabase } = await requireSuper();
  if (!isUuid(userId)) return { error: "Invalid request." };
  const list = (v) => [...new Set((Array.isArray(v) ? v : []).filter((d) => typeof d === "string"))].slice(0, 20);
  const a = await supabase.rpc("set_admin_depts", { p_user: userId, p_depts: list(uploadDepts) });
  if (a.error) return { error: message(a.error) };
  const b = await supabase.rpc("set_approver_depts", { p_user: userId, p_depts: list(approveDepts) });
  if (b.error) return { error: message(b.error) };
  return { ok: true };
}

// Throw away a draft upload: the notice, its rows, and the PDF in storage.
export async function removeUpload(noticeId) {
  const { supabase } = await requireAdmin();
  if (!UUID.test(String(noticeId))) return { error: "Invalid request." };
  const { data: docs } = await supabase.from("exam_documents").select("storage_path").eq("notice_id", noticeId);
  const { data: gone, error } = await supabase.from("exam_notices").delete().eq("id", noticeId).select("id");
  if (error) return { error: message(error) };
  if (!gone?.length) return { error: "Only a draft can be removed." };
  const paths = (docs || []).map((d) => d.storage_path);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  return { ok: true };
}
