// Writes the AI's values into the draft hackathon, and never lets one bad value or one missing column leave the form empty.
//
// First it tries one update with everything. If the database refuses (for example a column from dashboard-8 is not there yet,
// or one value breaks a rule), it saves the fields one at a time, so every field that CAN be saved is saved, and it
// reports exactly which ones could not be, and why. `details` (perks, rules, sponsors, the "autofilled" mark) goes last.

const short = (e) => String(e?.message || e || "").slice(0, 160);

/**
 * @returns { ok: boolean, saved: string[], failed: [{ key, message }] }
 */
export async function applyPatch(supabase, hackathonId, patch) {
  const update = (obj) => supabase.from("hackathons").update(obj).eq("id", hackathonId);
  const all = await update(patch);
  if (!all.error) return { ok: true, saved: Object.keys(patch), failed: [] };

  const saved = [], failed = [];
  const keys = Object.keys(patch).filter((k) => k !== "details");
  for (const key of keys) {
    const { error } = await update({ [key]: patch[key] });
    if (error) failed.push({ key, message: short(error) }); else saved.push(key);
  }
  if (patch.details) {
    const { error } = await update({ details: patch.details });
    if (error) failed.push({ key: "details", message: short(error) }); else saved.push("details");
  }
  return { ok: failed.length === 0, saved, failed };
}

/** A short, plain sentence for the person: what could not be filled in. */
export function describeApplyFailure(failed) {
  if (!failed?.length) return "";
  const missing = failed.filter((f) => /column|schema cache/i.test(f.message));
  if (missing.length) return `The database is missing some columns (${missing.map((f) => f.key).join(", ")}). Run supabase/dashboard-8-hackathons.sql in the Supabase SQL editor, then press "Fill the form from the AI reading".`;
  return `These fields could not be filled in: ${failed.map((f) => f.key).join(", ")}. ${failed[0].message}`;
}
