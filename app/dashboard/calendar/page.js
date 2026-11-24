import Link from "next/link";
import { Download } from "lucide-react";
import { requireVerified } from "../../../lib/dash/ctx";
import { KIND, loadAgenda } from "../../../lib/dash/calendar";
import { countdown } from "../../../lib/dash/meta";
import { RemoveReminder } from "../../../components/dashboard/AccountUI";

export const metadata = { title: "Calendar" };

const dayKey = (d) => new Date(d).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" });
const time = (d) => new Date(d).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default async function Calendar({ searchParams }) {
  const sp = await searchParams;
  const mineOnly = sp.view === "mine";
  const { supabase, user } = await requireVerified();
  const { items, reminders } = await loadAgenda(supabase, user);
  const now = Date.now();
  const upcoming = items.filter((i) => new Date(i.at).getTime() >= now - 36e5 && (!mineOnly || i.mine));
  const groups = [];
  for (const i of upcoming) {
    const k = dayKey(i.at);
    (groups.at(-1)?.k === k ? groups.at(-1).list : groups[groups.push({ k, list: [] }) - 1].list).push(i);
  }
  const pendingRem = reminders.filter((r) => !r.sent_at && new Date(r.remind_at).getTime() > now);

  return (
    <>
      <div className="page-head">
        <div><h1>Calendar</h1><p>Exams, workshops, hackathon deadlines, events and mentor sessions in one place, for the next 90 days.</p></div>
        <a className="btn-s" href="/dashboard/calendar/ics"><Download size={16} /> Add to my phone calendar (.ics)</a>
      </div>
      <div className="filters">
        <Link className={"chip" + (!mineOnly ? " on" : "")} href="/dashboard/calendar">Everything</Link>
        <Link className={"chip" + (mineOnly ? " on" : "")} href="/dashboard/calendar?view=mine">Only what I signed up for</Link>
      </div>

      {groups.length === 0 ? (
        <div className="empty"><h2>Nothing coming up</h2><p>{mineOnly ? "Register for a workshop or mark yourself interested in an event and it will appear here." : "Dated items from your department and clubs will appear here."}</p></div>
      ) : groups.map((g) => (
        <section key={g.k} aria-label={g.k} style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 8px" }}>{g.k}</h2>
          <div className="feed">{g.list.map((i) => {
            const k = KIND[i.kind];
            return (
              <article key={i.key} className="notice" style={{ "--u": k.color }}>
                <div className="notice-top">
                  <span className="pill soft" style={{ "--c": k.color }}>{k.label}</span>
                  {i.tag && <span className="pill soft" style={{ "--c": "#7fb48a" }}>{i.tag}</span>}
                  <span className="when">{time(i.at)} · {countdown(i.at)}</span>
                </div>
                <h3 className="notice-title"><Link href={i.href || k.href}>{i.title}</Link></h3>
                {i.place && <p className="audience">{i.place}</p>}
              </article>
            );
          })}</div>
        </section>
      ))}

      <section aria-label="My reminders" style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 16 }}>My reminders</h2>
        {pendingRem.length === 0 ? <p className="audience">No reminders set. Use “Remind me” on any notice, exam, workshop or hackathon.</p> : (
          <ul className="files">{pendingRem.map((r) => (
            <li key={r.id}><span className="file">{r.title} · {new Date(r.remind_at).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })} <RemoveReminder id={r.id} /></span></li>
          ))}</ul>
        )}
      </section>
    </>
  );
}
