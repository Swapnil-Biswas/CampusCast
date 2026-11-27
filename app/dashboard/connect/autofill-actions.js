"use server";
import { revalidatePath } from "next/cache";
import { requireVerified } from "../../../lib/dash/ctx";
import { aiConfig } from "../../../lib/exams/config";
import { MAX_PASTE, readProfileSources } from "../../../lib/connect/read";
import { isOwnFile } from "../../../lib/connect/files";

const BUCKET = "profile-files";
const SETUP = "Automatic filling is not set up yet. Run supabase/dashboard-10-connect-autofill.sql in the Supabase SQL Editor.";
const missing = (e) => e && (["42P01", "42883", "PGRST202", "PGRST205"].includes(e.code) || /people_reading|use_profile_reading|schema cache|bucket not found/i.test(e.message || ""));

// Reads the sources and returns a DRAFT for the editor. It never writes to people_profiles: only the person's own
// Save does that. The draft is also kept (owner-only) so the form can be filled again without another AI call.
export async function readMyProfileSources(input) {
  const { supabase, user } = await requireVerified();
  const paths = (Array.isArray(input?.paths) ? input.paths : []).filter((p) => isOwnFile(p, user.id)).slice(0, 2);
  const linkedinText = String(input?.linkedinText || "").slice(0, MAX_PASTE + 1);
  const github = String(input?.github || "").slice(0, 200);
  if (!paths.length && !linkedinText.trim() && !github.trim()) return { error: "Add a resume, a LinkedIn export, some text or a GitHub username first." };

  const { data: me, error: e0 } = await supabase.from("profiles").select("person_type").eq("id", user.id).maybeSingle();
  if (e0) return { error: "Could not read your account. Run supabase/dashboard-9-connect-people.sql if you have not." };
  const { data: allowed, error: qErr } = await supabase.rpc("use_profile_reading");
  if (qErr) return { error: missing(qErr) ? SETUP : "Could not start a reading. Try again." };
  if (!allowed) return { error: "You have used all 8 readings for this hour. Try again later, or use \"Fill again\" for the last reading." };

  const files = [], problems = [];
  for (const path of paths) {
    const label = path.split("/")[1].startsWith("resume-") ? "Resume" : "LinkedIn export";
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error || !data) { problems.push(`${label}: the uploaded file could not be opened. Upload it again.`); continue; }
    files.push({ label, name: `${label.toLowerCase().replace(/ /g, "-")}.${path.split(".").pop()}`, bytes: Buffer.from(await data.arrayBuffer()) });
  }

  let r;
  try {
    r = await readProfileSources({ files, linkedinText, github, faculty: me?.person_type === "faculty", providers: aiConfig().providers });
  } catch (e) {
    console.error("[connect reading]", e?.message || e);          // never includes keys or document text
    return { error: "Something went wrong while reading. Please try again." };
  }

  const draft = { fields: r.draft.fields, notes: r.draft.notes, warnings: [...problems, ...r.warnings], used: r.used, error: r.ok ? null : r.error, at: new Date().toISOString() };
  // Keep the draft only when it holds something, so a failed attempt does not wipe an earlier good one.
  if (Object.keys(draft.fields).length) {
    const { error } = await supabase.from("people_readings").upsert({ user_id: user.id, draft, created_at: draft.at }, { onConflict: "user_id" });
    if (error) draft.warnings.push(missing(error) ? SETUP : "The reading could not be kept for \"Fill again\".");
  }
  return { draft };
}

export async function removeMyProfileFile(path) {
  const { supabase, user } = await requireVerified();
  if (!isOwnFile(path, user.id)) return { error: "That is not your file." };
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) return { error: "Could not remove the file." };
  revalidatePath("/dashboard/connect/me");
  return { ok: true };
}

// Removes every uploaded file and the saved reading. The profile itself is not touched.
export async function removeMyReadingData() {
  const { supabase, user } = await requireVerified();
  const { data, error: lErr } = await supabase.storage.from(BUCKET).list(user.id, { limit: 100 });
  if (lErr) return { error: "Could not list your files." };
  if (data?.length) {
    const { error } = await supabase.storage.from(BUCKET).remove(data.map((f) => `${user.id}/${f.name}`));
    if (error) return { error: "Could not remove your files." };
  }
  const { error } = await supabase.from("people_readings").delete().eq("user_id", user.id);
  if (error) return { error: missing(error) ? SETUP : "Could not remove the saved reading." };
  revalidatePath("/dashboard/connect/me");
  return { ok: true };
}
