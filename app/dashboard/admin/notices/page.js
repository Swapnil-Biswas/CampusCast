import Link from "next/link";
import { requireAdmin } from "../../../../lib/dash/ctx";
import NoticeRow from "../../../../components/dashboard/NoticeRow";

export const metadata = { title: "Notices & reach" };

export default async function Notices({ searchParams }) {
  const sp = await searchParams;
  const status = ["live", "scheduled", "archived"].includes(sp.status) ? sp.status : "";
  const { supabase } = await requireAdmin();
  let q = supabase.from("announcements")
    .select("id,title,category,urgency,status,pinned,publish_at,audience_depts,audience_years,audience_club,author_id,clubs(name)")
    .order("publish_at", { ascending: false }).limit(100);
  if (status) q = q.eq("status", status);
  const { data: rows, error } = await q;
  const ids = [...new Set((rows || []).map((r) => r.author_id).filter(Boolean))];
  const { data: authors } = ids.length ? await supabase.from("profiles").select("id,full_name").in("id", ids) : { data: [] };
  const names = new Map((authors || []).map((a) => [a.id, a.full_name]));
  const data = (rows || []).map((r) => ({ ...r, profiles: { full_name: names.get(r.author_id) } }));
  const tabs = [["", "All"], ["live", "Live"], ["scheduled", "Scheduled"], ["archived", "Archived"]];
  return (
    <>
      <div className="page-head">
        <div><h1>Notices &amp; reach</h1><p>See who has read each notice, pin or archive it, and chase unread students.</p></div>
        <Link className="btn" href="/dashboard/admin/compose">New notice</Link>
      </div>
      <div className="filters">{tabs.map(([v, l]) => <Link key={l} className={"chip" + (status === v ? " on" : "")} href={v ? `?status=${v}` : "?"}>{l}</Link>)}</div>
      {error && <p className="form-msg err">{error.message}</p>}
      {!data?.length ? <div className="empty"><h2>No notices here</h2><p>Published notices will be listed with their reach.</p></div>
        : <div className="feed">{data.map((n) => <NoticeRow key={n.id} n={n} />)}</div>}
    </>
  );
}
