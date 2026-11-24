import { Suspense } from "react";
import { requireVerified } from "../../../lib/dash/ctx";
import { loadFeed, readFilters } from "../../../lib/dash/feed";
import FeedFilters from "../../../components/dashboard/FeedFilters";
import NoticeCard from "../../../components/dashboard/NoticeCard";

export const metadata = { title: "Department notifications" };

export default async function Department({ searchParams }) {
  const f = readFilters(await searchParams);
  const { supabase, user } = await requireVerified();
  const { list, count, error } = await loadFeed(supabase, user, f, { category: "department" });
  return (
    <>
      <div className="page-head"><div><h1>Department notifications</h1><p>Circulars from your department and year. Scheduled posts appear on time and expired ones disappear by themselves. {count ?? list.length} for you.</p></div></div>
      <Suspense fallback={null}><FeedFilters show={["urgency", "year", "unread", "saved"]} /></Suspense>
      {error && <p className="form-msg err" role="alert">{error.message}</p>}
      {list.length === 0 ? (
        <div className="empty"><h2>No circulars right now</h2><p>When your department posts something, it will show up here.</p></div>
      ) : <div className="feed">{list.map((n) => <NoticeCard key={n.id} n={n} openId={f.open} />)}</div>}
    </>
  );
}
