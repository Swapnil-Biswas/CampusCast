"use server";
import { revalidatePath } from "next/cache";
import { requireVerified } from "../../../lib/dash/ctx";
import { normalizeProfile, parseLines } from "../../../lib/connect/profile";

const SETUP = "Connect profiles are not set up yet. Run supabase/dashboard-9-connect-people.sql in the Supabase SQL Editor.";
const missing = (e) => e && (["42P01", "42703", "42883", "PGRST202", "PGRST205"].includes(e.code) || /people_profiles|person_type|schema cache/i.test(e.message || ""));

// Saves the signed-in person's own Connect profile. Everything is re-checked here (never trust the form),
// then checked again by the database. Returns { ok } or { error } where error may hold several lines.
export async function saveConnectProfile(input) {
  const { supabase, user } = await requireVerified();
  const { data: me, error: e0 } = await supabase.from("profiles").select("person_type").eq("id", user.id).maybeSingle();
  if (e0) return { error: missing(e0) ? SETUP : "Could not read your profile. Try again." };
  const faculty = me?.person_type === "faculty";
  const r = normalizeProfile({
    ...input,
    achievements: parseLines(input?.achievements, "Achievement"),
    publications: parseLines(input?.publications, "Paper"),
    work: parseLines(input?.work, "Work"),
  }, { faculty });
  if (!r.ok) return { error: r.errors.join("\n") };
  const { error } = await supabase.from("people_profiles").upsert({ user_id: user.id, ...r.row }, { onConflict: "user_id" });
  if (error) return { error: missing(error) ? SETUP : "Could not save your profile. Check the links and lengths, then try again." };
  revalidatePath("/dashboard/connect", "layout");
  return { ok: true, visible: r.row.visible };
}

// Hides the profile at once (one click from the profile page) without touching what was written.
export async function hideConnectProfile() {
  const { supabase, user } = await requireVerified();
  const { error } = await supabase.from("people_profiles").update({ visible: false }).eq("user_id", user.id);
  if (error) return { error: missing(error) ? SETUP : "Could not hide your profile." };
  revalidatePath("/dashboard/connect", "layout");
  return { ok: true };
}

// Super-admin only (the database refuses anyone else): mark a person as faculty or student.
export async function setPersonType(userId, type) {
  const { supabase } = await requireVerified();
  const { error } = await supabase.rpc("set_person_type", { p_user: userId, p_type: type });
  if (error) return { error: missing(error) ? SETUP : error.message };
  revalidatePath("/dashboard/admin/people");
  revalidatePath("/dashboard/connect", "layout");
  return { ok: true };
}
