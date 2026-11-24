// Shared by the home feed and the department page: the filters a student can set in the URL.
const text = (v) => (Array.isArray(v) ? v[0] : v) || "";

export function readFilters(sp) {
  return { q: text(sp.q).trim(), category: text(sp.category), urgency: text(sp.urgency), dept: text(sp.dept), year: text(sp.year), club: text(sp.club), unread: text(sp.unread), saved: text(sp.saved), open: text(sp.open) };
}

// Live, current notices only (admins can see drafts and future posts through the database rules, so ask explicitly).
export async function loadFeed(supabase, user, f, { category, limit = 40 } = {}) {
  const nowIso = new Date().toISOString();
  const live = (q) => q.eq("status", "live").lte("publish_at", nowIso).or(`expires_at.is.null,expires_at.gt.${nowIso}`);
  let query = live(supabase.from("announcements")
    .select("id,title,body,category,urgency,audience_depts,audience_years,audience_club,publish_at,expires_at,event_at,pinned,attachments,clubs(name,color)", { count: "exact" }));
  const cat = category || f.category;
  if (cat) query = query.eq("category", cat);
  if (f.urgency !== "") query = query.eq("urgency", Number(f.urgency));
  if (f.dept) query = query.contains("audience_depts", [f.dept]);
  if (f.year) query = query.contains("audience_years", [Number(f.year)]);
  if (f.club) query = query.eq("audience_club", f.club);
  if (f.q) query = query.textSearch("search", f.q, { type: "websearch", config: "english" });
  query = query.order("pinned", { ascending: false }).order("urgency").order("publish_at", { ascending: false }).limit(limit);

  let totalQ = live(supabase.from("announcements").select("id", { count: "exact", head: true }));
  if (category) totalQ = totalQ.eq("category", category);
  const [{ data: rows, count, error }, { data: reads }, { data: marks }, { count: total }] = await Promise.all([
    query,
    supabase.from("announcement_reads").select("announcement_id,read_at,acked_at").eq("user_id", user.id),
    supabase.from("bookmarks").select("announcement_id").eq("user_id", user.id),
    totalQ,
  ]);
  const readMap = new Map((reads || []).map((r) => [r.announcement_id, r]));
  const saved = new Set((marks || []).map((m) => m.announcement_id));
  let list = (rows || []).map((n) => ({ ...n, read_at: readMap.get(n.id)?.read_at, acked_at: readMap.get(n.id)?.acked_at, saved: saved.has(n.id) }));
  if (f.unread) list = list.filter((n) => !n.read_at);
  if (f.saved) list = list.filter((n) => n.saved);
  return { list, count, total, error };
}
