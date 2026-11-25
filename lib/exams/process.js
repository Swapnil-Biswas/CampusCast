import { STALE_PROCESSING_MS } from "./constants.js";
import { sniffFile } from "./pdf.js";
import { ExtractionError } from "./provider.js";
import { extractWithFallback } from "./chain.js";
import { normalizeExtraction } from "./normalize.js";
import { planApply } from "./plan.js";

// Runs one extraction from start to finish, using the signed-in admin's own Supabase client, so all the
// row-level-security rules of dashboard-6-exams.sql apply: it can only touch what that admin may manage.
//
//   queued -> processing -> completed | failed
//
// It reads the stored PDF, asks the AI, checks the answer (normalize.js), saves it, and fills the draft notice
// and timetable rows. It never submits or publishes: a person reviews everything first.

export async function runExtraction({ supabase, extractionId, provider = "anthropic", apiKey, model, providers, fetchImpl, sleep, now = new Date() }) {
  // Claim it. Only one runner can win; a "processing" row older than the stale limit may be taken over.
  const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MS).toISOString();
  const { data: claimed, error: claimError } = await supabase.from("exam_extractions")
    .update({ status: "processing", started_at: now.toISOString(), finished_at: null, error: null })
    .eq("id", extractionId)
    .or(`status.eq.queued,and(status.eq.processing,started_at.lt.${staleBefore})`)
    .select("id, document_id").maybeSingle();
  if (claimError) throw new Error(claimError.message);
  if (!claimed) return { state: "skipped" };

  const fail = async (code, message, retryable, tried) => {
    await supabase.from("exam_extractions").update({
      status: "failed", finished_at: new Date().toISOString(), error: message,
      field_meta: { _failure: { code, retryable, ...(tried?.length ? { tried } : {}) } },
    }).eq("id", extractionId);
    return { state: "failed", code, message, retryable };
  };

  try {
    const { data: doc, error: docErr } = await supabase.from("exam_documents")
      .select("id, notice_id, storage_path, original_filename, page_count").eq("id", claimed.document_id).single();
    if (docErr) throw new Error(docErr.message);
    const { data: notice, error: noticeErr } = await supabase.from("exam_notices")
      .select("id, title, status, audience_depts, degree_programme, details").eq("id", doc.notice_id).single();
    if (noticeErr) throw new Error(noticeErr.message);

    const { data: file, error: dlErr } = await supabase.storage.from("exam-pdfs").download(doc.storage_path);
    if (dlErr || !file) throw new ExtractionError("storage", "Could not read the uploaded file. Please upload it again.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const sniff = sniffFile(bytes);
    if (!sniff.ok) return await fail(sniff.code, sniff.message, false);

    const { data: departments } = await supabase.from("departments").select("name, code").eq("active", true).order("sort");

    const ai = await extractWithFallback({ providers: providers || [{ provider, apiKey, model }], pdf: bytes, mime: sniff.mime, filename: doc.original_filename, departments: departments || [], fetchImpl, sleep });
    const pageCount = sniff.pageCount ?? doc.page_count ?? null;
    const norm = normalizeExtraction(ai.input, { departments: departments || [], filename: doc.original_filename, pageCount, now });
    if (!norm.ok) throw new ExtractionError("invalid_output", norm.error, true);

    // A photo is read like a scan, whatever the model guessed.
    if (sniff.isImage) norm.result.sourceDocument.kind = "scanned";
    const kind = norm.result.sourceDocument.kind;
    const { error: saveErr } = await supabase.from("exam_extractions").update({
      status: "completed", finished_at: new Date().toISOString(), model: `${ai.provider}:${ai.model}`, error: null,
      ocr_used: kind === "scanned" || kind === "mixed",
      result: { ...norm.result, warnings: norm.warnings },
      field_meta: norm.fieldMeta, requires_review: true,
    }).eq("id", extractionId);
    if (saveErr) throw new Error(saveErr.message);
    if (doc.page_count == null && pageCount != null) await supabase.from("exam_documents").update({ page_count: pageCount }).eq("id", doc.id);

    // Fill the draft for review. A failure here leaves the extraction itself intact; the admin can apply it by hand.
    try {
      const { count } = await supabase.from("exam_timetable_entries").select("id", { count: "exact", head: true }).eq("notice_id", notice.id);
      const plan = planApply(notice, norm, { extractionId, hasEntries: (count || 0) > 0, now });
      if (!plan.skip) {
        const { error: nErr } = await supabase.from("exam_notices").update(plan.noticePatch).eq("id", notice.id);
        if (nErr) throw new Error(nErr.message);
        if (plan.entries.length) {
          const { error: eErr } = await supabase.from("exam_timetable_entries").insert(plan.entries);
          if (eErr) throw new Error(eErr.message);
        }
      }
    } catch (e) {
      await supabase.from("exam_extractions").update({ field_meta: { ...norm.fieldMeta, _applyError: String(e.message || e).slice(0, 300) } }).eq("id", extractionId);
    }
    return { state: "completed" };
  } catch (e) {
    if (e instanceof ExtractionError) return await fail(e.code, e.message, e.retryable, e.tried);
    console.error("[exam extraction]", extractionId, e?.message || e);   // never includes keys or file contents
    return await fail("internal", "Something went wrong while reading the document. Please try again.", true);
  }
}
