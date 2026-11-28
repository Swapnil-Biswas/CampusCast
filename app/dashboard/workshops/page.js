import Link from "next/link";
import { CalendarClock, MapPin, Armchair, Wallet } from "lucide-react";
import { getPublisher } from "../../../lib/dash/ctx";
import { audienceLabel } from "../../../lib/dash/meta";
import { fmtRange, formatRupees } from "../../../lib/hackathons/status";
import { organiserLine } from "../../../lib/hackathons/organiser";
import { workshopPhase } from "../../../lib/workshops/status";
import RelTime from "../../../components/dashboard/RelTime";
import { WorkshopButton } from "../../../components/dashboard/OfficialActions";
import { Remind, Tabs } from "../../../components/dashboard/Bits";

export const metadata = { title: "Workshops" };
const TABS = [["upcoming", "Upcoming"], ["mine", "My registrations"], ["past", "Past"]];

export default async function Workshops({ searchParams }) {
  const sp = await searchParams;
  const tab = TABS.some(([v]) => v === sp.tab) ? sp.tab : "upcoming";
  const { supabase, user, canPublish } = await getPublisher();
  const nowMs = Date.now();
  const [{ data: all, error }, { data: counts }, { data: regs }, { data: docs }] = await Promise.all([
    supabase.from("workshops").select("*, club:clubs(name, color)").order("starts_at", { ascending: tab !== "past" }),
    supabase.rpc("workshop_counts"),
    supabase.from("workshop_registrations").select("workshop_id,status").eq("user_id", user.id),
    // empty until dashboard-12 has been run; the list still works without it
    supabase.from("workshop_documents").select("id, workshop_id, mime_type").like("mime_type", "image/%").order("created_at", { ascending: false }).limit(300),
  ]);
  const cnt = new Map((counts || []).map((c) => [c.workshop_id, c]));
  const mine = new Map((regs || []).map((r) => [r.workshop_id, r.status]));
  const posters = new Map((docs || []).map((d) => [d.workshop_id, d.id]));
  const upcoming = (w) => new Date(w.starts_at).getTime() > nowMs;
  // Drafts are listed on the "Post a workshop" page only.
  const data = (all || []).filter((w) => w.status !== "draft" && w.starts_at)
    .filter((w) => tab === "past" ? !upcoming(w) : tab === "mine" ? mine.has(w.id) && upcoming(w) : upcoming(w));

  return (
    <>
      <div className="page-head">
        <div><h1>Workshops</h1><p>Register in one tap. If a workshop is full you join a waitlist and move up automatically. You get reminders 24 hours and 1 hour before.</p></div>
        {canPublish && <Link className="btn" href="/dashboard/workshops/manage">Post a workshop</Link>}
      </div>
      <Tabs tabs={TABS} current={tab} base="/dashboard/workshops" />
      {error && <p className="form-msg err">{error.message}</p>}
      {!data.length ? <div className="empty"><h2>{tab === "mine" ? "You have not registered for anything" : "No workshops here"}</h2><p>{tab === "mine" ? "Browse upcoming workshops and register in one tap." : "New workshops for your department will appear here."}</p></div> : (
        <div className="feed">{data.map((w) => {
          const c = cnt.get(w.id) || { registered: 0, waitlist: 0 };
          const left = Math.max(0, w.seats - c.registered);
          const closed = w.reg_closes_at && new Date(w.reg_closes_at).getTime() <= nowMs;
          const p = workshopPhase(w, nowMs);
          const cancelled = w.status === "cancelled";
          const organizer = organiserLine(w);
          const poster = posters.get(w.id);
          const href = `/dashboard/workshops/${w.id}`;
          return (
            <article key={w.id} className={`notice hk-card${["ended", "cancelled"].includes(p.key) ? " over" : ""}`} style={{ "--u": p.color }}>
              {poster && <Link className="hk-thumb" href={href} tabIndex={-1} aria-hidden="true"><img src={`/api/workshops/file/${poster}`} alt="" loading="lazy" /></Link>}
              <div className="hk-body">
                <div className="notice-top">
                  <span className="pill soft hk-phase" style={{ "--c": p.color }}>{p.label}</span>
                  {organizer && <span className="pill soft" style={{ "--c": w.club?.color || "#d9c8a8" }}>{organizer}</span>}
                  {upcoming(w) && !cancelled && <span className="when"><RelTime date={w.starts_at} mode="until" /></span>}
                </div>
                <h3 className="notice-title"><Link href={href}>{w.title}</Link></h3>
                {w.tagline && <p>{w.tagline}</p>}
                <p className="audience">For {audienceLabel(w)}</p>
                <ul className="hk-facts">
                  <li><CalendarClock size={16} /> <span>{fmtRange(w.starts_at, w.ends_at)}</span></li>
                  {w.venue && <li><MapPin size={16} /> <span>{w.venue}</span></li>}
                  <li><Armchair size={16} /> <span>{left === 0 ? `Full${c.waitlist ? `, ${c.waitlist} waiting` : ""}` : `${left} of ${w.seats} seats left`}</span></li>
                  {w.fee_amount != null && <li><Wallet size={16} /> <span>{Number(w.fee_amount) === 0 ? "Free" : formatRupees(w.fee_amount)}</span></li>}
                </ul>
                <div className="notice-actions">
                  <Link className="btn-s" href={href}>Full details</Link>
                  {upcoming(w) && !cancelled && <WorkshopButton id={w.id} mine={mine.get(w.id)} full={left === 0} closed={closed && !mine.has(w.id)} />}
                  {upcoming(w) && !cancelled && mine.get(w.id) === "registered" && <Remind kind="workshop" refId={w.id} title={w.title} url={href} at={w.starts_at} />}
                </div>
              </div>
            </article>
          );
        })}</div>
      )}
    </>
  );
}
