import { requireVerified } from "../../../lib/dash/ctx";
import NoticeCard from "../../../components/dashboard/NoticeCard";

export const metadata = { title: "Saved" };

export default async function Saved() {
  const { supabase, user } = await requireVerified();
  const [{ data: marks }, { data: reads }] = await Promise.all([
    supabase.from("bookmarks").select("created_at, announcements(id,title,body,category,urgency,audience_depts,audience_years,audience_club,publish_at,expires_at,event_at,pinned,attachments,status,clubs(name,color))").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("announcement_reads").select("announcement_id,read_at,acked_at").eq("user_id", user.id),
  ]);
  const readMap = new Map((reads || []).map((r) => [r.announcement_id, r]));
  const now = Date.now();
  const list = (marks || []).map((m) => m.announcements).filter(Boolean)
    .map((n) => ({ ...n, saved: true, read_at: readMap.get(n.id)?.read_at, acked_at: readMap.get(n.id)?.acked_at, over: n.expires_at && new Date(n.expires_at).getTime() < now }));

  return (
    <>
      <div className="page-head"><div><h1>Saved</h1><p>{list.length} notice{list.length === 1 ? "" : "s"} you bookmarked. Expired ones stay here so you can still refer to them.</p></div></div>
      {list.length === 0 ? (
        <div className="empty"><h2>Nothing saved yet</h2><p>Tap the bookmark on any notice to keep it here.</p></div>
      ) : <div className="feed">{list.map((n) => <NoticeCard key={n.id} n={n} />)}</div>}
    </>
  );
}
