// Decides what to write into a DRAFT workshop after the AI has read its poster, and writes it. It fills the draft once;
// after that the organiser's edits are never overwritten. It never touches status, and nothing here publishes anything.

/**
 * @param workshop  { id, club_id, starts_at, details }  the current draft row
 * @param norm      the result of normalizeWorkshop() (.result, .warnings)
 * @returns { skip: true } | { patch, warnings }
 */
export function planWorkshopApply(workshop, norm, { extractionId, clubs = [], now = new Date(), force = false } = {}) {
  if (!force && workshop.details?.extraction?.autofilled) return { skip: true };
  const r = norm.result;
  const warnings = [...norm.warnings];
  const patch = {};
  const put = (k, v) => { if (v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)) patch[k] = v; };

  put("title", r.name);
  put("tagline", r.tagline);
  put("description", r.description);
  put("topics", r.topics);
  put("organizer_name", r.organizerName);
  put("speaker_name", r.speakerName);
  put("speaker_about", r.speakerAbout);
  put("mode", r.mode);
  put("venue", r.venue);
  put("map_url", r.mapUrl);
  put("starts_at", r.startsAt);
  put("ends_at", r.endsAt);
  put("reg_closes_at", r.deadline);
  put("seats", r.seats);
  put("fee_amount", r.feeAmount);
  put("fee_note", r.feeNote);
  put("eligibility", r.eligibility);
  put("prerequisites", r.prerequisites);
  put("contact_name", r.contactName);
  put("contact_phone", r.contactPhone);
  put("contact_email", r.contactEmail);
  put("website_url", r.websiteUrl);
  put("link", r.registrationUrl);

  // Keep the dates sensible when only some of them are filled in.
  const starts = patch.starts_at ?? workshop.starts_at;
  if (starts && patch.ends_at && new Date(patch.ends_at) < new Date(starts)) delete patch.ends_at;
  if (starts && patch.reg_closes_at && new Date(patch.reg_closes_at) > new Date(starts)) {
    delete patch.reg_closes_at;
    warnings.push({ field: "registrationDeadline", code: "closes_after_start", message: "The last date to register is after the start, so it was left empty. Please check." });
  }

  // The club is chosen by the person who uploaded; it is only filled in when none was chosen and the poster names one.
  if (!workshop.club_id && r.clubName) {
    const c = clubs.find((x) => x.name === r.clubName);
    if (c) patch.club_id = c.id;
  }
  patch.details = {
    ...(workshop.details || {}),
    perks: r.perks,
    extraction: { autofilled: true, extractionId, requiresReview: true, warnings, qrLinks: r.qrLinks || [], appliedAt: now.toISOString() },
  };
  return { patch, warnings };
}

/** One update with everything; if the database refuses, one field at a time so everything that can be saved is saved. */
export async function applyWorkshopPatch(supabase, id, patch) {
  const update = (obj) => supabase.from("workshops").update(obj).eq("id", id);
  if (!(await update(patch)).error) return { ok: true, saved: Object.keys(patch), failed: [] };
  const saved = [], failed = [];
  const keys = [...Object.keys(patch).filter((k) => k !== "details"), ...(patch.details ? ["details"] : [])];
  for (const key of keys) {
    const { error } = await update({ [key]: patch[key] });
    if (error) failed.push({ key, message: String(error.message || error).slice(0, 160) }); else saved.push(key);
  }
  return { ok: failed.length === 0, saved, failed };
}

export function describeApplyFailure(failed) {
  if (!failed?.length) return "";
  const missing = failed.filter((f) => /column|schema cache/i.test(f.message));
  if (missing.length) return `The database is missing some columns (${missing.map((f) => f.key).join(", ")}). Run supabase/dashboard-12-workshops.sql in the Supabase SQL editor, then press "Fill the form from the AI reading".`;
  return `These fields could not be filled in: ${failed.map((f) => f.key).join(", ")}. ${failed[0].message}`;
}
