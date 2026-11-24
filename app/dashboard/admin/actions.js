"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireSuper } from "../../../lib/dash/ctx";

const fail = (e) => ({ error: e?.message || "Something went wrong." });

export async function reviewVerification(userId, approve, note) {
  const { supabase } = await requireAdmin();
  if (!approve && !String(note || "").trim()) return { error: "Tell the student what to fix so they can resubmit." };
  const { error } = await supabase.rpc("review_verification", { p_user: userId, p_approve: !!approve, p_note: note || null });
  if (error) return fail(error);
  revalidatePath("/dashboard/admin/verification");
  return { ok: true };
}

export async function setRole(userId, role) {
  const { supabase } = await requireSuper();
  const { error } = await supabase.rpc("set_role", { p_user: userId, p_role: role });
  if (error) return fail(error);
  revalidatePath("/dashboard/admin/people");
  return { ok: true };
}

export async function setNoticeStatus(id, status) {
  const { supabase } = await requireAdmin();
  if (!["live", "archived"].includes(status)) return { error: "Unknown status." };
  const patch = status === "live" ? { status: "live", publish_at: new Date().toISOString() } : { status };
  const { error } = await supabase.from("announcements").update(patch).eq("id", id);
  if (error) return fail(error);
  revalidatePath("/dashboard/admin/notices");
  return { ok: true };
}

export async function togglePin(id, pinned) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("announcements").update({ pinned: !!pinned }).eq("id", id);
  if (error) return fail(error);
  revalidatePath("/dashboard/admin/notices");
  return { ok: true };
}

export async function deleteNotice(id) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) return fail(error);
  revalidatePath("/dashboard/admin/notices");
  return { ok: true };
}

export async function saveClub(_prev, fd) {
  const { supabase } = await requireAdmin();
  const name = String(fd.get("name") || "").trim();
  if (name.length < 2) return { error: "Give the club a name." };
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const { error } = await supabase.from("clubs").insert({ name, slug, description: String(fd.get("description") || "").trim() || null, color: String(fd.get("color") || "#e8603c") });
  if (error) return fail(error.code === "23505" ? { message: "A club with that name already exists." } : error);
  revalidatePath("/dashboard/admin/clubs");
  return { ok: true };
}

export async function deleteClub(id) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("clubs").delete().eq("id", id);
  if (error) return fail(error);
  revalidatePath("/dashboard/admin/clubs");
  return { ok: true };
}

// Club leads can publish to their own club only (never Now or Today). Super-admins manage them.
export async function addClubLead(clubId, email) {
  const { supabase } = await requireSuper();
  const { data: p } = await supabase.from("profiles").select("id,status,full_name,email").eq("email", String(email || "").trim().toLowerCase()).maybeSingle();
  if (!p) return { error: "No student with that email." };
  if (p.status !== "verified") return { error: "That student is not ID-verified yet." };
  const { error } = await supabase.from("club_admins").insert({ club_id: clubId, user_id: p.id });
  if (error) return fail(error.code === "23505" ? { message: "Already a lead of this club." } : error);
  revalidatePath("/dashboard/admin/clubs");
  return { ok: true, user_id: p.id, name: p.full_name || p.email };
}

export async function removeClubLead(clubId, userId) {
  const { supabase } = await requireSuper();
  const { error } = await supabase.from("club_admins").delete().eq("club_id", clubId).eq("user_id", userId);
  if (error) return fail(error);
  revalidatePath("/dashboard/admin/clubs");
  return { ok: true };
}

// Short-lived link to a student's private ID photo (admins only; storage rules enforce it again).
export async function idCardUrl(path) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.storage.from("id-cards").createSignedUrl(path, 120);
  return error ? fail(error) : { url: data.signedUrl };
}
