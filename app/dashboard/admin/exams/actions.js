"use server";
import { createHash } from "node:crypto";
import { requireAdmin } from "../../../../lib/dash/ctx";
import { manageableDepartments } from "../../../../lib/exams/access";
import { aiConfig } from "../../../../lib/exams/config";
import { sniffPdf } from "../../../../lib/exams/pdf";
import { STALE_PROCESSING_MS } from "../../../../lib/exams/constants";
import { clean } from "../../../../lib/exams/normalize";

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
  if (typeof path !== "string" || !path.startsWith(folder) || !/^[0-9a-f-]{36}\.pdf$/i.test(path.slice(folder.length))) return { error: "Invalid upload." };

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
  const sniff = sniffPdf(bytes);
  if (!sniff.ok) return fail(sniff.message);
  const sha = createHash("sha256").update(bytes).digest("hex");

  const { data: dups } = await supabase.rpc("exam_find_duplicates", { p_sha256: sha });
  if (dups?.length && !allowDuplicate) return fail("This exact file has already been uploaded.");

  const name = clean(String(filename || "notice.pdf"), 160) || "notice.pdf";
  const title = clean(name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " "), 200);
  const { data: notice, error: nErr } = await supabase.from("exam_notices")
    .insert({ title: title.length >= 3 ? title : "Examination notice", audience_depts: depts, created_by: user.id })
    .select("id").single();
  if (nErr) return fail(message(nErr));

  const { data: doc, error: dErr } = await supabase.from("exam_documents")
    .insert({ notice_id: notice.id, storage_path: path, original_filename: name, mime_type: "application/pdf", size_bytes: bytes.length, sha256: sha, page_count: sniff.pageCount, uploaded_by: user.id })
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
