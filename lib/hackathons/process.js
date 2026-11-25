import { STALE_PROCESSING_MS } from "../exams/constants.js";
import { sniffFile } from "../exams/pdf.js";
import { ExtractionError } from "../exams/provider.js";
import { extractWithFallback } from "../exams/chain.js";
import { HACKATHON_TASK } from "./task.js";
import { normalizeHackathon } from "./normalize.js";
import { planHackathonApply } from "./plan.js";
import { decodeQrLinks } from "./qr.js";

// Runs one reading of a hackathon poster or document from start to finish, using the signed-in club admin's own
// Supabase client, so the row-level-security rules of dashboard-8-hackathons.sql apply: it can only touch what that
// person may manage.
//
//   queued -> processing -> completed | failed
//
// It reads the stored file, asks the AI, checks the answer (normalize.js), saves it and fills the DRAFT hackathon.
// It never publishes: a person reviews everything first.

export async function runHackathonExtraction({ supabase, extractionId, providers, fetchImpl, sleep, now = new Date() }) {
  const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MS).toISOString();
  const { data: claimed, error: claimError } = await supabase.from("hackathon_extractions")
    .update({ status: "processing", started_at: now.toISOString(), finished_at: null, error: null })
    .eq("id", extractionId)
    .or(`status.eq.queued,and(status.eq.processing,started_at.lt.${staleBefore})`)
    .select("id, document_id").maybeSingle();
  if (claimError) throw new Error(claimError.message);
  if (!claimed) return { state: "skipped" };

  const fail = async (code, message, retryable, tried) => {
    await supabase.from("hackathon_extractions").update({
      status: "failed", finished_at: new Date().toISOString(), error: message,
      field_meta: { _failure: { code, retryable, ...(tried?.length ? { tried } : {}) } },
    }).eq("id", extractionId);
    return { state: "failed", code, message, retryable };
  };

  try {
    const { data: doc, error: docErr } = await supabase.from("hackathon_documents")
      .select("id, hackathon_id, storage_path, original_filename, page_count").eq("id", claimed.document_id).single();
    if (docErr) throw new Error(docErr.message);
    const { data: hackathon, error: hErr } = await supabase.from("hackathons")
      .select("id, title, status, club_id, team_min, team_max, starts_at, deadline, details").eq("id", doc.hackathon_id).single();
    if (hErr) throw new Error(hErr.message);

    const { data: file, error: dlErr } = await supabase.storage.from("hackathon-files").download(doc.storage_path);
    if (dlErr || !file) throw new ExtractionError("storage", "Could not read the uploaded file. Please upload it again.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const sniff = sniffFile(bytes);
    if (!sniff.ok) return await fail(sniff.code, sniff.message, false);

    const { data: clubs } = await supabase.from("clubs").select("id, name").order("name");
    const ai = await extractWithFallback({
      providers: providers || [], pdf: bytes, mime: sniff.mime, task: HACKATHON_TASK, filename: doc.original_filename,
      departments: clubs || [], fetchImpl, sleep,
    });
    const pageCount = sniff.pageCount ?? doc.page_count ?? null;
    // QR codes on a poster photo are decoded mechanically, so students can open the link without scanning.
    const qrLinks = sniff.isImage ? await decodeQrLinks(bytes) : [];
    const norm = normalizeHackathon(ai.input, { clubs: clubs || [], filename: doc.original_filename, pageCount, now, qrLinks });
    if (!norm.ok) throw new ExtractionError("invalid_output", norm.error, true);

    if (sniff.isImage) norm.result.sourceDocument.kind = "scanned";   // a photo is read like a scan
    const kind = norm.result.sourceDocument.kind;
    const { error: saveErr } = await supabase.from("hackathon_extractions").update({
      status: "completed", finished_at: new Date().toISOString(), model: `${ai.provider}:${ai.model}`, error: null,
      ocr_used: kind === "scanned" || kind === "mixed",
      result: { ...norm.result, warnings: norm.warnings }, field_meta: norm.fieldMeta, requires_review: true,
    }).eq("id", extractionId);
    if (saveErr) throw new Error(saveErr.message);
    if (doc.page_count == null && pageCount != null) await supabase.from("hackathon_documents").update({ page_count: pageCount }).eq("id", doc.id);

    // Fill the draft for review. A failure here leaves the reading itself intact; the admin can fill the form by hand.
    try {
      const plan = planHackathonApply(hackathon, norm, { extractionId, clubs: clubs || [], now });
      if (!plan.skip) {
        const { error: uErr } = await supabase.from("hackathons").update(plan.patch).eq("id", hackathon.id);
        if (uErr) throw new Error(uErr.message);
      }
    } catch (e) {
      await supabase.from("hackathon_extractions").update({ field_meta: { ...norm.fieldMeta, _applyError: String(e.message || e).slice(0, 300) } }).eq("id", extractionId);
    }
    return { state: "completed" };
  } catch (e) {
    if (e instanceof ExtractionError) return await fail(e.code, e.message, e.retryable, e.tried);
    console.error("[hackathon extraction]", extractionId, e?.message || e);   // never includes keys or file contents
    return await fail("internal", "Something went wrong while reading the document. Please try again.", true);
  }
}
