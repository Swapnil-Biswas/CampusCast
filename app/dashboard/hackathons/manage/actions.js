"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getPublisher } from "../../../../lib/dash/ctx";
import { postingClubs } from "../../../../lib/hackathons/access";
import { findVenue, roadRoute } from "../../../../lib/hackathons/geocode";
import { isUuid, publishIssues, validateHackathon } from "../../../../lib/hackathons/validate";
import { aiConfig } from "../../../../lib/exams/config";
import { sniffFile } from "../../../../lib/exams/pdf";
import { STALE_PROCESSING_MS } from "../../../../lib/exams/constants";
import { clean } from "../../../../lib/exams/normalize";
import { planHackathonApply } from "../../../../lib/hackathons/plan";
import { applyPatch, describeApplyFailure } from "../../../../lib/hackathons/apply";

const BUCKET = "hackathon-files";
const HEX64 = /^[0-9a-f]{64}$/;
const UPLOADS_PER_HOUR = 30;   // a simple guard on AI cost
const message = (e) => (e?.message ? String(e.message).slice(0, 240) : "Something went wrong.");

// Every action below runs as the signed-in person. Row-level security decides what they may touch.
async function publisher() {
  const ctx = await getPublisher();
  if (!ctx.canPublish) return { error: "Only club admins and admins can post hackathons." };
  return { ctx, clubs: await postingClubs(ctx.supabase, ctx) };
}
const refresh = (id) => { revalidatePath("/dashboard/hackathons"); revalidatePath("/dashboard/hackathons/manage"); if (id) revalidatePath(`/dashboard/hackathons/${id}`); };

export async function checkHackathonDuplicate(sha256) {
  const p = await publisher();
  if (p.error) return { duplicates: [] };
  const sha = String(sha256 || "").toLowerCase();
  if (!HEX64.test(sha)) return { duplicates: [] };
  const { data } = await p.ctx.supabase.rpc("hackathon_find_duplicates", { p_sha256: sha });
  return { duplicates: (data || []).map((d) => ({ id: d.hackathon_id, title: d.title, status: d.status })) };
}

// Called after the browser has uploaded the file straight into storage. Checks the file, then creates the DRAFT hackathon,
// its document row and a queued reading. The browser then starts the reading (/api/hackathons/extract).
export async function registerHackathonUpload({ path, filename, clubId, allowDuplicate = false }) {
  const p = await publisher();
  if (p.error) return { error: p.error };
  const { supabase, user, isAdmin } = p.ctx;
  const fail = async (error) => { if (path) await supabase.storage.from(BUCKET).remove([path]); return { error }; };

  const folder = `${user.id}/`;
  if (typeof path !== "string" || !path.startsWith(folder) || !/^[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/i.test(path.slice(folder.length))) return { error: "Invalid upload." };
  if (clubId && !p.clubs.some((c) => c.id === clubId)) return fail("You can only post for a club you lead.");
  if (!clubId && !isAdmin) return fail("Choose the club that is organising this hackathon.");

  const since = new Date(Date.now() - 3600e3).toISOString();
  const { count } = await supabase.from("hackathon_documents").select("id", { count: "exact", head: true }).eq("uploaded_by", user.id).gte("created_at", since);
  if ((count || 0) >= UPLOADS_PER_HOUR) return fail("Too many uploads in the last hour. Please try again later.");

  // Read the stored file back and check it on the server: never trust what the browser says about it.
  const { data: file, error: dlErr } = await supabase.storage.from(BUCKET).download(path);
  if (dlErr || !file) return { error: "The upload was not found. Please try again." };
  const bytes = Buffer.from(await file.arrayBuffer());
  const sniff = sniffFile(bytes);
  if (!sniff.ok) return fail(sniff.message);
  if (!path.toLowerCase().endsWith(`.${sniff.ext}`)) return fail("The file does not match its type. Please upload it again.");
  const sha = createHash("sha256").update(bytes).digest("hex");

  const { data: dups } = await supabase.rpc("hackathon_find_duplicates", { p_sha256: sha });
  if (dups?.length && !allowDuplicate) return fail("This exact file has already been uploaded.");

  const name = clean(String(filename || "poster"), 160) || "poster";
  const title = clean(name.replace(/\.(pdf|jpe?g|png|webp)$/i, "").replace(/[_-]+/g, " "), 140);
  const { data: h, error: hErr } = await supabase.from("hackathons")
    .insert({ title: title.length >= 3 ? title : "New hackathon", club_id: clubId || null, status: "draft", created_by: user.id })
    .select("id").single();
  if (hErr) return fail(message(hErr));

  const { data: doc, error: dErr } = await supabase.from("hackathon_documents")
    .insert({ hackathon_id: h.id, storage_path: path, original_filename: name, mime_type: sniff.mime, size_bytes: bytes.length, sha256: sha, page_count: sniff.pageCount, uploaded_by: user.id })
    .select("id").single();
  if (dErr) { await supabase.from("hackathons").delete().eq("id", h.id); return fail(message(dErr)); }

  const { data: ex, error: xErr } = await supabase.from("hackathon_extractions").insert({ document_id: doc.id, status: "queued", model: aiConfig().model }).select("id").single();
  if (xErr) { await supabase.from("hackathons").delete().eq("id", h.id); return fail(message(xErr)); }
  refresh();
  return { hackathonId: h.id, documentId: doc.id, extractionId: ex.id };
}

// A failed (or stuck) reading gets a fresh attempt. The old row stays as the record of what happened.
export async function retryHackathonExtraction(extractionId) {
  const p = await publisher();
  if (p.error) return { error: p.error };
  if (!isUuid(extractionId)) return { error: "Invalid request." };
  const { supabase } = p.ctx;
  const { data: old } = await supabase.from("hackathon_extractions").select("id, document_id, status, attempt, started_at").eq("id", extractionId).maybeSingle();
  if (!old) return { error: "That reading was not found." };
  const stuck = old.status === "processing" && old.started_at && Date.now() - new Date(old.started_at).getTime() > STALE_PROCESSING_MS;
  if (old.status !== "failed" && !stuck) return { error: "Only a failed reading can be retried." };
  const { data: next, error } = await supabase.from("hackathon_extractions")
    .insert({ document_id: old.document_id, status: "queued", attempt: (old.attempt || 1) + 1, model: aiConfig().model }).select("id").single();
  if (error) return { error: message(error) };
  return { extractionId: next.id };
}

// Fills the form again from the saved AI reading (it does not call the AI again). It replaces what is in the form, so the
// editor asks first. Used when the first fill failed (for example a missing database column) or the form was cleared.
export async function reapplyHackathonReading(hackathonId) {
  const p = await publisher();
  if (p.error) return { error: p.error };
  if (!isUuid(hackathonId)) return { error: "Invalid request." };
  const { supabase } = p.ctx;
  const { data: h } = await supabase.from("hackathons").select("id, title, status, club_id, team_min, team_max, starts_at, deadline, details").eq("id", hackathonId).maybeSingle();
  if (!h) return { error: "That hackathon was not found." };
  if (h.status !== "draft") return { error: "Only a draft can be filled again." };
  const { data: docs } = await supabase.from("hackathon_documents").select("id").eq("hackathon_id", hackathonId);
  const ids = (docs || []).map((d) => d.id);
  if (!ids.length) return { error: "There is no uploaded poster to read." };
  const { data: exs } = await supabase.from("hackathon_extractions").select("id, result, field_meta, created_at").in("document_id", ids).eq("status", "completed").order("created_at", { ascending: false }).limit(1);
  const ex = exs?.[0];
  if (!ex?.result) return { error: "The poster has not been read successfully yet. Use Try again on the reading first." };
  const { warnings = [], ...result } = ex.result;
  const fieldMeta = Object.fromEntries(Object.entries(ex.field_meta || {}).filter(([k]) => !k.startsWith("_")));
  const clubs = await postingClubs(supabase, p.ctx);
  const plan = planHackathonApply(h, { result, warnings, fieldMeta }, { extractionId: ex.id, clubs, force: true });
  const done = await applyPatch(supabase, hackathonId, plan.patch);
  await supabase.from("hackathon_extractions").update({ field_meta: done.ok ? fieldMeta : { ...fieldMeta, _applyError: describeApplyFailure(done.failed).slice(0, 400), _applyFailed: done.failed.map((f) => f.key) } }).eq("id", ex.id);
  refresh();
  if (!done.ok) return { error: describeApplyFailure(done.failed) };
  return { ok: true, filled: done.saved.length };
}

// A new, empty draft for someone who has no poster to upload.
export async function createBlankHackathon({ clubId }) {
  const p = await publisher();
  if (p.error) return { error: p.error };
  if (clubId && !p.clubs.some((c) => c.id === clubId)) return { error: "You can only post for a club you lead." };
  if (!clubId && !p.ctx.isAdmin) return { error: "Choose the club that is organising this hackathon." };
  const { data, error } = await p.ctx.supabase.from("hackathons").insert({ title: "New hackathon", club_id: clubId || null, status: "draft", created_by: p.ctx.user.id }).select("id").single();
  if (error) return { error: message(error) };
  refresh();
  return { hackathonId: data.id };
}

// Save everything on the editor. `data` is the form; it is validated here again.
export async function saveHackathon({ id, data }) {
  const p = await publisher();
  if (p.error) return { error: p.error };
  if (!isUuid(id)) return { error: "Invalid request." };
  const { supabase, isAdmin } = p.ctx;
  const { data: current } = await supabase.from("hackathons").select("id, details, venue_lat, venue_lng, route_km, route_source").eq("id", id).maybeSingle();
  if (!current) return { error: "That hackathon was not found." };
  const v = validateHackathon(data, { clubs: p.clubs, isAdmin });
  if (!v.ok) return { error: v.errors[0], errors: v.errors };
  const details = { ...(current.details || {}), ...v.details };

  // Outside the campus: measure the road distance from BMSIT, but only when the pin is new or was only a straight line.
  const patch = { ...v.patch };
  if (patch.off_campus && patch.venue_lat != null) {
    const same = current.venue_lat != null && Math.abs(Number(current.venue_lat) - patch.venue_lat) < 1e-6 && Math.abs(Number(current.venue_lng) - patch.venue_lng) < 1e-6
      && current.route_km != null && current.route_source === "road";
    if (!same) {
      const r = await roadRoute({ lat: patch.venue_lat, lng: patch.venue_lng });
      patch.route_km = r.km; patch.route_minutes = r.minutes; patch.route_source = r.source;
    }
  } else {
    patch.route_km = null; patch.route_minutes = null; patch.route_source = null;
  }
  const { data: saved, error } = await supabase.from("hackathons").update({ ...patch, details }).eq("id", id).select("id");
  if (error) return { error: message(error) };
  if (!saved?.length) return { error: "You cannot edit this hackathon." };
  refresh(id);
  return { ok: true };
}

// The editor's "find on map": a search by venue name or address, or a pasted Google Maps link. Returns places to choose from.
export async function locateVenue({ query, link }) {
  const p = await publisher();
  if (p.error) return { error: p.error };
  try {
    const places = await findVenue({ query: typeof query === "string" ? query : "", link: typeof link === "string" ? link : "" });
    return { places };
  } catch (e) {
    return { error: message(e) };
  }
}

// Publish, unpublish (back to a draft) or cancel. Publishing needs no approval: the club admin does it directly.
export async function setHackathonStatus({ id, status }) {
  const p = await publisher();
  if (p.error) return { error: p.error };
  if (!isUuid(id) || !["draft", "published", "cancelled"].includes(status)) return { error: "Invalid request." };
  const { supabase } = p.ctx;
  const { data: h } = await supabase.from("hackathons").select("*").eq("id", id).maybeSingle();
  if (!h) return { error: "That hackathon was not found." };
  if (status === "published") {
    const { blocking } = publishIssues(h);
    if (blocking.length) return { error: blocking[0], errors: blocking };
  }
  const { data: saved, error } = await supabase.from("hackathons").update({ status }).eq("id", id).select("id");
  if (error) return { error: message(error) };
  if (!saved?.length) return { error: "You cannot change this hackathon." };
  refresh(id);
  return { ok: true };
}

// Remove a draft or a cancelled hackathon, with its files.
export async function removeHackathon(id) {
  const p = await publisher();
  if (p.error) return { error: p.error };
  if (!isUuid(id)) return { error: "Invalid request." };
  const { supabase } = p.ctx;
  const { data: h } = await supabase.from("hackathons").select("id, status").eq("id", id).maybeSingle();
  if (!h) return { error: "That hackathon was not found." };
  if (h.status === "published") return { error: "Cancel a published hackathon before removing it." };
  const { data: docs } = await supabase.from("hackathon_documents").select("storage_path").eq("hackathon_id", id);
  const { data: gone, error } = await supabase.from("hackathons").delete().eq("id", id).select("id");
  if (error) return { error: message(error) };
  if (!gone?.length) return { error: "You cannot remove this hackathon." };
  const paths = (docs || []).map((d) => d.storage_path);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  refresh();
  return { ok: true };
}
