import Link from "next/link";
import { requireVerified } from "../../../lib/dash/ctx";
import { URGENCY, timeAgo } from "../../../lib/dash/meta";
import { MarkAllRead, NotifSettings } from "../../../components/dashboard/AccountUI";

export const metadata = { title: "Notifications" };

export default async function Notifications({ searchParams }) {
  const sp = await searchParams;
  const unreadOnly = sp.view === "unread";
  const { supabase, user } = await requireVerified();
  let q = supabase.from("notifications").select("id,kind,title,body,url,urgency,created_at,read_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
  if (unreadOnly) q = q.is("read_at", null);
  const [{ data: items }, { data: prefs }, { count: devices }, { data: sums }] = await Promise.all([
    q,
    supabase.from("notification_prefs").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.rpc("my_outbox_summary"),
  ]);
  const p = { email: true, push: false, digest: true, urgent_overrides_quiet: true, quiet_start: null, quiet_end: null, ...(prefs || {}) };
  const sent = (ch) => (sums || []).filter((s) => s.channel === ch && s.status === "sent").reduce((a, s) => a + s.n, 0);
  const unread = (items || []).filter((n) => !n.read_at).length;

  return (
    <>
      <div className="page-head"><div><h1>Notifications</h1><p>Your alert history, and how CampusCast reaches you. In the last 30 days: {sent("email")} email{sent("email") === 1 ? "" : "s"} and {sent("push")} push alert{sent("push") === 1 ? "" : "s"} sent.</p></div></div>

      <NotifSettings prefs={p} vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ""} emailReady={Boolean(process.env.SMTP_HOST)} devices={devices || 0} />

      <h2 style={{ fontSize: 18, margin: "28px 0 8px" }}>History</h2>
      <div className="filters">
        <Link className={"chip" + (!unreadOnly ? " on" : "")} href="/dashboard/notifications">All</Link>
        <Link className={"chip" + (unreadOnly ? " on" : "")} href="/dashboard/notifications?view=unread">Unread</Link>
        <MarkAllRead disabled={!unread && !unreadOnly} />
      </div>
      {!items?.length ? <div className="empty"><h2>{unreadOnly ? "You are all caught up" : "Nothing yet"}</h2><p>New notices, requests and reminders will be listed here.</p></div> : (
        <div className="feed">{items.map((n) => (
          <Link key={n.id} href={n.url || "/dashboard"} className={"bell-item" + (n.read_at ? "" : " unread")} style={{ border: "1.5px solid var(--line)", borderRadius: 12, background: "var(--card)" }}>
            <i className="urg-dot" style={{ background: URGENCY[n.urgency]?.color }} />
            <span><b>{n.title}</b>{n.body && <small>{n.body}</small>}<em>{URGENCY[n.urgency]?.label} · {timeAgo(n.created_at)}</em></span>
          </Link>
        ))}</div>
      )}
    </>
  );
}
