"use server";
import { getPublisher } from "../../../../lib/dash/ctx";

// Publishes through the signed-in user's own client, so database rules (who may post, who may use Now/Today) always apply.
export async function publishNotice(_prev, fd) {
  const { supabase, user, canPublish, isAdmin } = await getPublisher();
  if (!canPublish) return { error: "You do not have permission to publish notices." };

  const title = String(fd.get("title") || "").trim();
  const body = String(fd.get("body") || "").trim();
  if (title.length < 3) return { error: "Give the notice a title of at least 3 characters." };
  if (!body) return { error: "Write the notice text." };

  const urgency = Number(fd.get("urgency") ?? 2);
  if (!isAdmin && urgency < 2) return { error: "Only admins can send Now or Today notices." };

  const depts = fd.getAll("depts").map(String);
  const years = fd.getAll("years").map(Number).filter((y) => y >= 1 && y <= 5);
  const club = String(fd.get("club") || "") || null;
  if (!isAdmin && !club) return { error: "Club leads must pick the club they are posting for." };

  const toIso = (k) => { const v = String(fd.get(k) || ""); if (!v) return null; const d = new Date(v); return isNaN(d) ? null : d.toISOString(); };
  const publishAt = toIso("publish_at");
  const scheduled = publishAt && new Date(publishAt).getTime() > Date.now() + 30000;
  let attachments = [];
  try { attachments = JSON.parse(String(fd.get("attachments") || "[]")); } catch {}
  attachments = attachments.filter((a) => typeof a?.path === "string" && a.path.startsWith(user.id + "/")).slice(0, 5);

  const row = {
    author_id: user.id, title, body,
    category: String(fd.get("category") || "general"),
    urgency,
    audience_depts: depts.length ? depts : null,
    audience_years: years.length ? years : null,
    audience_club: club,
    publish_at: scheduled ? publishAt : new Date().toISOString(),
    expires_at: toIso("expires_at"),
    event_at: toIso("event_at"),
    pinned: fd.get("pinned") === "on",
    attachments,
    status: scheduled ? "scheduled" : "live",
  };
  const { data, error } = await supabase.from("announcements").insert(row).select("id").single();
  if (error) return { error: error.message };
  return { ok: true, id: data.id, scheduled: !!scheduled };
}
