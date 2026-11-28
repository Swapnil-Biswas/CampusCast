import { STALE_PROCESSING_MS } from "../exams/constants.js";
import { sniffFile } from "../exams/pdf.js";
import { ExtractionError } from "../exams/provider.js";
import { extractWithFallback } from "../exams/chain.js";
import { HACKATHON_TASK } from "./task.js";
import { normalizeHackathon } from "./normalize.js";
import { planHackathonApply } from "./plan.js";
import { decodeQrLinks } from "./qr.js";
import { applyPatch, describeApplyFailure } from "./apply.js";
import { resolveMapsLink, roadRoute, searchPlaces } from "./geocode.js";
import { CAMPUS, straightKm } from "./geo.js";

// Runs one reading of a hackathon poster or document from start to finish, using the signed-in club admin's own
// Supabase client, so the row-level-security rules of dashboard-8-hackathons.sql apply: it can only touch what that
// person may manage.
//
//   queued -> processing -> completed | failed
//
// It reads the stored file, asks the AI, checks the answer (normalize.js), saves it and fills the DRAFT hackathon.
// It never publishes: a person reviews everything first.

const REGION_KM = 150;   // a venue match more than this far from BMSIT is almost certainly a different place with the same name

/**
 * A map pin for a venue outside BMSIT: from a map link on the poster if there is one, else from a search by name and address.
 * It is only a best guess (the club admin sees it on a map and confirms), so any problem just means "no pin".
 * @returns { lat, lng, name, km, minutes, source } | null
 */
export async function guessVenuePin(result, geo = {}) {
  const search = geo.search || searchPlaces, route = geo.route || roadRoute, resolve = geo.resolve || resolveMapsLink;
  try {
    let hit = result.mapUrl ? await resolve(result.mapUrl) : null;
    if (!hit) {
      const words = [result.venue, result.venueAddress].filter(Boolean).join(", ");
      if (!words) return null;
      const places = await search(/bengaluru|bangalore/i.test(words) ? words : `${words}, Bengaluru`);
      hit = places.find((p) => straightKm(CAMPUS, p) <= REGION_KM) || null;
    }
    if (!hit) return null;
    const r = await route({ lat: hit.lat, lng: hit.lng });
    return { lat: hit.lat, lng: hit.lng, name: hit.name || null, km: r.km, minutes: r.minutes, source: r.source };
  } catch {
    return null;
  }
}

export async function runHackathonExtraction({ supabase, extractionId, providers, fetchImpl, sleep, now = new Date(), geo }) {
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

    // Outside BMSIT: find the venue on the map so students can see the distance and open directions.
    if (norm.result.offCampus) {
      const pin = await guessVenuePin(norm.result, geo);
      if (pin) {
        norm.result.venuePin = pin;
        norm.warnings.push({ field: "venue", code: "venue_pin_guess", message: `The venue is outside BMSIT. A map pin was found automatically${pin.name ? ` (${pin.name})` : ""}, about ${pin.km} km away. Please check it on the map.` });
        norm.fieldMeta.venuePin = { confidence: 0.6, source: "inferred", pages: [], evidence: pin.name || "", needsReview: true };
      } else {
        norm.warnings.push({ field: "venue", code: "venue_not_found", message: "The venue is outside BMSIT but could not be found on the map. Search for it in the editor, or paste a Google Maps link." });
      }
    }
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
        const done = await applyPatch(supabase, hackathon.id, plan.patch);
        if (!done.ok) {
          await supabase.from("hackathon_extractions").update({ field_meta: { ...norm.fieldMeta, _applyError: describeApplyFailure(done.failed).slice(0, 400), _applyFailed: done.failed.map((f) => f.key) } }).eq("id", extractionId);
        }
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
