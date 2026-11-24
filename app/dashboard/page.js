import { Suspense } from "react";
import { requireVerified } from "../../lib/dash/ctx";
import { loadFeed, readFilters } from "../../lib/dash/feed";
import FeedFilters from "../../components/dashboard/FeedFilters";
import NoticeCard from "../../components/dashboard/NoticeCard";

export const metadata = { title: "Home feed" };

export default async function Home({ searchParams }) {
  const f = readFilters(await searchParams);
  const { supabase, user, profile } = await requireVerified();
  const [{ list, count, total, error }, { data: clubs }] = await Promise.all([
    loadFeed(supabase, user, f),
    supabase.from("clubs").select("id,name").order("name"),
  ]);

  const mustAck = list.filter((n) => n.urgency === 0 && !n.acked_at);
  const rest = list.filter((n) => !mustAck.includes(n));
  const unreadCount = list.filter((n) => !n.read_at).length;
  const first = (profile.full_name || "").split(" ")[0] || "there";
  const shown = count ?? list.length;
  const filtered = Object.entries(f).some(([k, v]) => k !== "open" && v);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hi {first}, here is what matters</h1>
          <p>{shown} notice{shown === 1 ? "" : "s"} for you · {unreadCount} unread{total != null && total !== count ? ` · ${total} on campus in total` : ""}</p>
        </div>
      </div>

      <Suspense fallback={null}><FeedFilters clubs={clubs || []} /></Suspense>

      {error && <p className="form-msg err" role="alert">Could not load notices: {error.message}</p>}

      {mustAck.length > 0 && (
        <section className="banner" aria-label="Needs your acknowledgement">
          <h2>Needs your acknowledgement</h2>
          <div className="feed">{mustAck.map((n) => <NoticeCard key={n.id} n={n} openId={f.open} />)}</div>
        </section>
      )}

      {rest.length === 0 && mustAck.length === 0 ? (
        <div className="empty">
          <h2>{filtered ? "Nothing matches these filters" : "All quiet for now"}</h2>
          <p>{filtered ? "Try clearing a filter or searching for something else." : "New notices from your department and clubs will show up here the moment they are published."}</p>
        </div>
      ) : (
        <div className="feed">{rest.map((n) => <NoticeCard key={n.id} n={n} openId={f.open} />)}</div>
      )}
    </>
  );
}
