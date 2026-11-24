"use server";
import { revalidatePath } from "next/cache";
import { requireVerified } from "../../lib/dash/ctx";

const fail = (error) => ({ error: error?.message || String(error) });

// ---------- read receipts, acknowledgements, bookmarks ----------
export async function setRead(id, read) {
  const { supabase, user } = await requireVerified();
  const res = read
    ? await supabase.from("announcement_reads").upsert({ announcement_id: id, user_id: user.id }, { onConflict: "announcement_id,user_id", ignoreDuplicates: true })
    : await supabase.from("announcement_reads").delete().eq("announcement_id", id).eq("user_id", user.id);
  if (res.error) return fail(res.error);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function acknowledge(id) {
  const { supabase, user } = await requireVerified();
  const { error } = await supabase.from("announcement_reads").upsert(
    { announcement_id: id, user_id: user.id, acked_at: new Date().toISOString() }, { onConflict: "announcement_id,user_id" });
  if (error) return fail(error);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function toggleBookmark(id, on) {
  const { supabase, user } = await requireVerified();
  const res = on
    ? await supabase.from("bookmarks").upsert({ user_id: user.id, announcement_id: id }, { onConflict: "user_id,announcement_id", ignoreDuplicates: true })
    : await supabase.from("bookmarks").delete().eq("user_id", user.id).eq("announcement_id", id);
  if (res.error) return fail(res.error);
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

// ---------- reminders (anything with a date) ----------
export async function addReminder({ kind, refId, title, url, remindAt }) {
  const { supabase, user } = await requireVerified();
  const when = new Date(remindAt);
  if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60000) return { error: "That time has already passed." };
  const { error } = await supabase.from("reminders").upsert(
    { user_id: user.id, kind, ref_id: refId, title: String(title).slice(0, 140), url: url || null, remind_at: when.toISOString() },
    { onConflict: "user_id,kind,ref_id,remind_at", ignoreDuplicates: true });
  if (error) return fail(error);
  revalidatePath("/dashboard/calendar");
  return { ok: true, at: when.toISOString() };
}

export async function removeReminder(id) {
  const { supabase, user } = await requireVerified();
  const { error } = await supabase.from("reminders").delete().eq("id", id).eq("user_id", user.id);
  if (error) return fail(error);
  revalidatePath("/dashboard/calendar");
  return { ok: true };
}

// ---------- notifications ----------
export async function markNotificationRead(id) {
  const { supabase, user } = await requireVerified();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).is("read_at", null);
  return { ok: true };
}

export async function markAllNotificationsRead() {
  const { supabase, user } = await requireVerified();
  await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

// ---------- attachments: short-lived signed links ----------
export async function signedUrl(bucket, path) {
  const { supabase } = await requireVerified();
  if (!["announcement-files", "notes", "listing-images", "event-media"].includes(bucket)) return { error: "Unknown bucket." };
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 180);
  if (error) return fail(error);
  return { url: data.signedUrl };
}
