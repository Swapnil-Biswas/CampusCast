import { STALE_PROCESSING_MS } from "../exams/constants.js";
import { sniffFile } from "../exams/pdf.js";
import { ExtractionError } from "../exams/provider.js";
import { extractWithFallback } from "../exams/chain.js";
import { decodeQrLinks } from "../hackathons/qr.js";
import { WORKSHOP_TASK } from "./task.js";
import { normalizeWorkshop } from "./normalize.js";
import { applyWorkshopPatch, describeApplyFailure, planWorkshopApply } from "./plan.js";

// Runs one reading of a workshop poster from start to finish, using the signed-in organiser's own Supabase client, so
// the rules of dashboard-12-workshops.sql apply. queued -> processing -> completed | failed. It fills the DRAFT and
// never publishes: a person reviews everything first.

export async function runWorkshopExtraction({ supabase, extractionId, providers, fetchImpl, sleep, now = new Date() }) {
  const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MS).toISOString();
  const { data: claimed, error: claimError } = await supabase.from("workshop_extractions")
    .update({ status: "processing", started_at: now.toISOString(), finished_at: null, error: null })
    .eq("id", extractionId)
    .or(`status.eq.queued,and(status.eq.processing,started_at.lt.${staleBefore})`)
    .select("id, document_id").maybeSingle();
  if (claimError) throw new Error(claimError.message);
  if (!claimed) return { state: "skipped" };

  const fail = async (code, message, retryable, tried) => {
    await supabase.from("workshop_extractions").update({
      status: "failed", finished_at: new Date().toISOString(), error: message,
      field_meta: { _failure: { code, retryable, ...(tried?.length ? { tried } : {}) } },
    }).eq("id", extractionId);
    return { state: "failed", code, message, retryable };
  };

  try {
    const { data: doc, error: docErr } = await supabase.from("workshop_documents")
      .select("id, workshop_id, storage_path, original_filename, page_count").eq("id", claimed.document_id).single();
    if (docErr) throw new Error(docErr.message);
    const { data: workshop, error: wErr } = await supabase.from("workshops")
      .select("id, title, status, club_id, starts_at, details").eq("id", doc.workshop_id).single();
    if (wErr) throw new Error(wErr.message);

    const { data: file, error: dlErr } = await supabase.storage.from("workshop-files").download(doc.storage_path);
    if (dlErr || !file) throw new ExtractionError("storage", "Could not read the uploaded file. Please upload it again.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const sniff = sniffFile(bytes);
    if (!sniff.ok) return await fail(sniff.code, sniff.message, false);

    const { data: clubs } = await supabase.from("clubs").select("id, name").order("name");
    const ai = await extractWithFallback({
      providers: providers || [], pdf: bytes, mime: sniff.mime, task: WORKSHOP_TASK, filename: doc.original_filename,
      departments: clubs || [], fetchImpl, sleep,
    });
    const pageCount = sniff.pageCount ?? doc.page_count ?? null;
    const qrLinks = sniff.isImage ? await decodeQrLinks(bytes) : [];
    const norm = normalizeWorkshop(ai.input, { clubs: clubs || [], filename: doc.original_filename, pageCount, now, qrLinks });
    if (!norm.ok) throw new ExtractionError("invalid_output", norm.error, true);
    if (sniff.isImage) norm.result.sourceDocument.kind = "scanned";

    const kind = norm.result.sourceDocument.kind;
    const { error: saveErr } = await supabase.from("workshop_extractions").update({
      status: "completed", finished_at: new Date().toISOString(), model: `${ai.provider}:${ai.model}`, error: null,
      ocr_used: kind === "scanned" || kind === "mixed",
      result: { ...norm.result, warnings: norm.warnings }, field_meta: norm.fieldMeta, requires_review: true,
    }).eq("id", extractionId);
    if (saveErr) throw new Error(saveErr.message);
    if (doc.page_count == null && pageCount != null) await supabase.from("workshop_documents").update({ page_count: pageCount }).eq("id", doc.id);

    // Fill the draft for review. A failure here leaves the reading intact; the organiser can fill the form by hand.
    const note = (extra) => supabase.from("workshop_extractions").update({ field_meta: { ...norm.fieldMeta, ...extra } }).eq("id", extractionId);
    try {
      if (workshop.status === "draft") {
        const plan = planWorkshopApply(workshop, norm, { extractionId, clubs: clubs || [], now });
        if (!plan.skip) {
          const done = await applyWorkshopPatch(supabase, workshop.id, plan.patch);
          if (!done.ok) await note({ _applyError: describeApplyFailure(done.failed).slice(0, 400) });
        }
      }
    } catch (e) {
      await note({ _applyError: String(e.message || e).slice(0, 300) });
    }
    return { state: "completed" };
  } catch (e) {
    if (e instanceof ExtractionError) return await fail(e.code, e.message, e.retryable, e.tried);
    console.error("[workshop extraction]", extractionId, e?.message || e);   // never includes keys or file contents
    return await fail("internal", "Something went wrong while reading the document. Please try again.", true);
  }
}
