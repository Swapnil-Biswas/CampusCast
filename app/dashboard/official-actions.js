"use server";
import { revalidatePath } from "next/cache";
import { getPublisher, requireVerified } from "../../lib/dash/ctx";
import { RECORDS, cleanRecord } from "../../lib/dash/forms";

const fail = (e) => ({ error: e?.message || "Something went wrong." });
const PATH = { exams: "/dashboard/exams", workshops: "/dashboard/workshops", hackathons: "/dashboard/hackathons", events: "/dashboard/events" };

// ---------- organisers: create, edit, delete (database rules decide who is allowed) ----------
export async function saveRecord(table, id, input) {
  const { supabase, user, canPublish, isAdmin } = await getPublisher();
  if (!RECORDS[table]) return { error: "Unknown record type." };
  if (!canPublish) return { error: "You do not have permission to do this." };
  if (table === "exams" && !isAdmin) return { error: "Only admins can manage exams." };
  const { row, error } = cleanRecord(table, input);
  if (error) return { error };
  if (!isAdmin && RECORDS[table].club && !row.club_id) return { error: "Pick the club this belongs to." };
  const res = id
    ? await supabase.from(table).update(row).eq("id", id).select("id").maybeSingle()
    : await supabase.from(table).insert(table === "exams" ? { ...row, created_by: user.id } : row).select("id").maybeSingle();
  if (res.error) return fail(res.error);
  if (!res.data) return { error: "That record could not be saved (it may belong to someone else)." };
  revalidatePath(PATH[table]);
  return { ok: true, id: res.data.id };
}

export async function deleteRecord(table, id) {
  const { supabase, canPublish } = await getPublisher();
  if (!RECORDS[table] || !canPublish) return { error: "You do not have permission to do this." };
  const { data, error } = await supabase.from(table).delete().eq("id", id).select("id");
  if (error) return fail(error);
  if (!data?.length) return { error: "Nothing was deleted (it may belong to someone else)." };
  revalidatePath(PATH[table]);
  return { ok: true };
}

// ---------- workshops ----------
export async function registerWorkshop(id) {
  const { supabase } = await requireVerified();
  const { data, error } = await supabase.rpc("register_workshop", { p_id: id });
  if (error) return fail(error);
  revalidatePath("/dashboard/workshops");
  return { ok: true, status: data };
}
export async function cancelWorkshop(id) {
  const { supabase } = await requireVerified();
  const { error } = await supabase.rpc("cancel_registration", { p_id: id });
  if (error) return fail(error);
  revalidatePath("/dashboard/workshops");
  return { ok: true };
}

// ---------- hackathons ----------
export async function setHackathonInterest(id, on) {
  const { supabase, user } = await requireVerified();
  const res = on
    ? await supabase.from("hackathon_interest").upsert({ hackathon_id: id, user_id: user.id }, { onConflict: "hackathon_id,user_id", ignoreDuplicates: true })
    : await supabase.from("hackathon_interest").delete().eq("hackathon_id", id).eq("user_id", user.id);
  if (res.error) return fail(res.error);
  revalidatePath("/dashboard/hackathons");
  return { ok: true };
}

// ---------- events and clubs ----------
export async function setRsvp(id, status) {
  const { supabase, user } = await requireVerified();
  const res = status
    ? await supabase.from("event_rsvps").upsert({ event_id: id, user_id: user.id, status }, { onConflict: "event_id,user_id" })
    : await supabase.from("event_rsvps").delete().eq("event_id", id).eq("user_id", user.id);
  if (res.error) return fail(res.error);
  revalidatePath("/dashboard/events");
  return { ok: true };
}

export async function setClubFollow(clubId, on) {
  const { supabase, user } = await requireVerified();
  const res = on
    ? await supabase.from("club_follows").upsert({ user_id: user.id, club_id: clubId }, { onConflict: "user_id,club_id", ignoreDuplicates: true })
    : await supabase.from("club_follows").delete().eq("user_id", user.id).eq("club_id", clubId);
  if (res.error) return fail(res.error);
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
