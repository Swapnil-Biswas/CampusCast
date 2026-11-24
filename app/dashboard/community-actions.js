"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireVerified } from "../../lib/dash/ctx";

const fail = (e) => ({ error: e?.code === "23505" ? "That already exists." : e?.message || "Something went wrong." });
const done = (path) => { if (path) revalidatePath(path); return { ok: true }; };
const str = (v, n) => String(v ?? "").trim().slice(0, n);
const list = (v, n = 8) => (Array.isArray(v) ? v : String(v || "").split(",")).map((s) => String(s).trim().toLowerCase()).filter(Boolean).slice(0, n);

// ---------- reports and blocks ----------
export async function fileReport(kind, refId, reason) {
  const { supabase, user } = await requireVerified();
  if (str(reason, 500).length < 3) return { error: "Tell us briefly what is wrong." };
  const { error } = await supabase.from("reports").insert({ reporter: user.id, kind, ref_id: refId, reason: str(reason, 500) });
  if (error) return error.code === "23505" ? { ok: true } : fail(error);
  return { ok: true };
}
export async function blockUser(userId) {
  const { supabase, user } = await requireVerified();
  if (userId === user.id) return { error: "You cannot block yourself." };
  const { error } = await supabase.from("blocks").upsert({ blocker: user.id, blocked: userId }, { onConflict: "blocker,blocked", ignoreDuplicates: true });
  return error ? fail(error) : done("/dashboard", "layout");
}
export async function unblockUser(userId) {
  const { supabase, user } = await requireVerified();
  const { error } = await supabase.from("blocks").delete().eq("blocker", user.id).eq("blocked", userId);
  return error ? fail(error) : done("/dashboard/profile");
}

// ---------- Connect ----------
export async function createPost(input) {
  const { supabase } = await requireVerified();
  const kind = input.kind === "team" ? "team" : "need";
  const row = { kind, title: str(input.title, 140), body: str(input.body, 2000), skills: list(input.skills), hackathon_id: input.hackathon_id || null };
  if (row.title.length < 3 || !row.body) return { error: "Add a title and a few details." };
  const { error } = await supabase.from("connect_posts").insert(row);
  return error ? fail(error) : done("/dashboard/connect");
}
export async function setPostStatus(id, status) {
  const { supabase } = await requireVerified();
  const { error } = status === "delete" ? await supabase.from("connect_posts").delete().eq("id", id) : await supabase.from("connect_posts").update({ status }).eq("id", id);
  return error ? fail(error) : done("/dashboard/connect");
}
export async function requestConnect(postId, message) {
  const { supabase } = await requireVerified();
  if (!str(message, 500)) return { error: "Say a line about yourself." };
  const { error } = await supabase.rpc("request_connect", { p_post: postId, p_message: str(message, 500) });
  return error ? fail(error) : done("/dashboard/connect");
}
export async function respondConnect(requestId, accept) {
  const { supabase } = await requireVerified();
  const { error } = await supabase.rpc("respond_connect", { p_request: requestId, p_accept: !!accept });
  return error ? fail(error) : done("/dashboard/connect");
}
export async function connectContact(requestId) {
  const { supabase } = await requireVerified();
  const { data, error } = await supabase.rpc("connect_contact", { p_request: requestId });
  return error ? fail(error) : { ok: true, contact: data?.[0] };
}

// ---------- notes and papers ----------
export async function createNote(input) {
  const { supabase } = await requireVerified();
  const row = {
    kind: input.kind === "paper" ? "paper" : "notes", title: str(input.title, 140), subject: str(input.subject, 80),
    semester: Number(input.semester), branch: str(input.branch, 80) || null, description: str(input.description, 1000) || null,
    file: input.file, sha256: str(input.sha256, 64),
  };
  if (row.title.length < 3 || row.subject.length < 2) return { error: "Add a title and a subject." };
  if (!(row.semester >= 1 && row.semester <= 8)) return { error: "Pick a semester." };
  if (!row.file?.path || !/^[0-9a-f]{64}$/.test(row.sha256)) return { error: "Attach a file first." };
  const { error } = await supabase.from("notes").insert(row);
  if (error?.code === "23505") return { error: "This exact file has already been uploaded.", duplicate: true };
  return error ? fail(error) : done("/dashboard/notes");
}
export async function deleteNote(id) {
  const { supabase } = await requireVerified();
  const { error } = await supabase.from("notes").delete().eq("id", id);
  return error ? fail(error) : done("/dashboard/notes");
}
export async function toggleVote(noteId, on) {
  const { supabase, user } = await requireVerified();
  const res = on ? await supabase.from("note_votes").upsert({ note_id: noteId, user_id: user.id }, { onConflict: "note_id,user_id", ignoreDuplicates: true })
    : await supabase.from("note_votes").delete().eq("note_id", noteId).eq("user_id", user.id);
  return res.error ? fail(res.error) : done("/dashboard/notes");
}
export async function reviewNote(id, approve, note) {
  const { supabase } = await requireAdmin();
  if (!approve && !str(note, 300)) return { error: "Say why it was not accepted." };
  const { error } = await supabase.rpc("review_note", { p_id: id, p_approve: !!approve, p_note: str(note, 300) || null });
  return error ? fail(error) : done("/dashboard/admin/moderation");
}

// ---------- CampusXchange ----------
export async function createListing(input) {
  const { supabase } = await requireVerified();
  const row = { title: str(input.title, 100), description: str(input.description, 1500) || null, price: Math.round(Number(input.price)), category: input.category, condition: input.condition, images: (input.images || []).slice(0, 4) };
  if (row.title.length < 3) return { error: "Give the item a title." };
  if (!(row.price >= 0 && row.price <= 1000000)) return { error: "Enter a price (0 for free)." };
  const { error } = await supabase.from("listings").insert(row);
  return error ? fail(error) : done("/dashboard/xchange");
}
export async function setListingStatus(id, status) {
  const { supabase } = await requireVerified();
  const { error } = status === "delete" ? await supabase.from("listings").delete().eq("id", id) : await supabase.from("listings").update({ status }).eq("id", id);
  return error ? fail(error) : done("/dashboard/xchange");
}
export async function requestListing(id, message) {
  const { supabase } = await requireVerified();
  if (!str(message, 500)) return { error: "Write a short message to the seller." };
  const { error } = await supabase.rpc("request_listing", { p_listing: id, p_message: str(message, 500) });
  return error ? fail(error) : done("/dashboard/xchange");
}
export async function respondListing(requestId, accept) {
  const { supabase } = await requireVerified();
  const { error } = await supabase.rpc("respond_listing", { p_request: requestId, p_accept: !!accept });
  return error ? fail(error) : done("/dashboard/xchange");
}
export async function sendMessage(requestId, body) {
  const { supabase } = await requireVerified();
  if (!str(body, 1000)) return { error: "Type a message." };
  const { error } = await supabase.from("messages").insert({ request_id: requestId, body: str(body, 1000) });
  return error ? fail(error) : { ok: true };
}

// ---------- mentorship ----------
export async function saveMentorProfile(input) {
  const { supabase, user } = await requireVerified();
  const row = { user_id: user.id, domains: list(input.domains), bio: str(input.bio, 600) || null, availability: str(input.availability, 200) || null, active: input.active !== false };
  if (!row.domains.length) return { error: "Add at least one domain you can help with." };
  const { error } = await supabase.from("mentor_profiles").upsert(row, { onConflict: "user_id" });
  if (error?.code === "42501") return { error: "Mentoring is open to students in year 3 and above." };
  return error ? fail(error) : done("/dashboard/mentors");
}
export async function stopMentoring() {
  const { supabase, user } = await requireVerified();
  const { error } = await supabase.from("mentor_profiles").delete().eq("user_id", user.id);
  return error ? fail(error) : done("/dashboard/mentors");
}
export async function requestMentor(mentorId, topic, message) {
  const { supabase } = await requireVerified();
  const { error } = await supabase.rpc("request_mentor", { p_mentor: mentorId, p_topic: str(topic, 140), p_message: str(message, 500) });
  return error ? fail(error) : done("/dashboard/mentors");
}
export async function respondMentor(id, accept) {
  const { supabase } = await requireVerified();
  const { error } = await supabase.rpc("respond_mentor", { p_request: id, p_accept: !!accept });
  return error ? fail(error) : done("/dashboard/mentors");
}
export async function scheduleSession(id, atIso, note) {
  const { supabase } = await requireVerified();
  const { error } = await supabase.rpc("schedule_session", { p_request: id, p_at: new Date(atIso).toISOString(), p_note: str(note, 300) });
  return error ? fail(error) : done("/dashboard/mentors");
}
export async function completeSession(id) {
  const { supabase } = await requireVerified();
  const { error } = await supabase.rpc("complete_session", { p_session: id });
  return error ? fail(error) : done("/dashboard/mentors");
}
export async function rateSession(id, rating, feedback) {
  const { supabase } = await requireVerified();
  const { error } = await supabase.rpc("rate_session", { p_session: id, p_rating: Number(rating), p_feedback: str(feedback, 500) });
  return error ? fail(error) : done("/dashboard/mentors");
}

// ---------- moderation ----------
export async function resolveReport(id, remove, note) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("resolve_report", { p_id: id, p_remove: !!remove, p_note: str(note, 300) || null });
  return error ? fail(error) : done("/dashboard/admin/moderation");
}
