import { CalendarClock, MapPin, Armchair } from "lucide-react";
import { getPublisher } from "../../../lib/dash/ctx";
import { audienceLabel, fmtDate } from "../../../lib/dash/meta";
import RelTime from "../../../components/dashboard/RelTime";
import RecordEditor from "../../../components/dashboard/RecordEditor";
import { WorkshopButton } from "../../../components/dashboard/OfficialActions";
import { CsvLink, Remind, Tabs } from "../../../components/dashboard/Bits";

export const metadata = { title: "Workshops" };
const TABS = [["upcoming", "Upcoming"], ["mine", "My registrations"], ["past", "Past"]];

export default async function Workshops({ searchParams }) {
  const sp = await searchParams;
  const tab = TABS.some(([v]) => v === sp.tab) ? sp.tab : "upcoming";
  const { supabase, user, isAdmin, ledClubs, canPublish } = await getPublisher();
  const nowIso = new Date().toISOString();
  const [{ data: all, error }, { data: counts }, { data: regs }, { data: clubs }] = await Promise.all([
    supabase.from("workshops").select("*, clubs(name,color)").order("starts_at", { ascending: tab === "past" ? false : true }),
    supabase.rpc("workshop_counts"),
    supabase.from("workshop_registrations").select("workshop_id,status").eq("user_id", user.id),
    isAdmin ? supabase.from("clubs").select("id,name").order("name") : Promise.resolve({ data: ledClubs }),
  ]);
  const cnt = new Map((counts || []).map((c) => [c.workshop_id, c]));
  const mine = new Map((regs || []).map((r) => [r.workshop_id, r.status]));
  const upcoming = (w) => new Date(w.starts_at) > new Date(nowIso);
  const data = (all || []).filter((w) => tab === "past" ? !upcoming(w) : tab === "mine" ? mine.has(w.id) && upcoming(w) : upcoming(w));

  return (
    <>
      <div className="page-head">
        <div><h1>Workshops</h1><p>Register in one tap. If a workshop is full you join a waitlist and move up automatically. You get reminders 24 hours and 1 hour before.</p></div>
        {canPublish && <RecordEditor table="workshops" clubs={clubs || []} userId={user.id} isAdmin={isAdmin} big />}
      </div>
      <Tabs tabs={TABS} current={tab} base="/dashboard/workshops" />
      {error && <p className="form-msg err">{error.message}</p>}
      {!data.length ? <div className="empty"><h2>{tab === "mine" ? "You have not registered for anything" : "No workshops here"}</h2><p>{tab === "mine" ? "Browse upcoming workshops and register in one tap." : "New workshops for your department will appear here."}</p></div> : (
        <div className="feed">{data.map((w) => {
          const c = cnt.get(w.id) || { registered: 0, waitlist: 0 };
          const left = Math.max(0, w.seats - c.registered);
          const closed = w.reg_closes_at && new Date(w.reg_closes_at) <= new Date(nowIso);
          const manage = isAdmin || w.organizer_id === user.id;
          return (
            <article key={w.id} className="notice" style={{ "--u": "#7fb48a" }}>
              <div className="notice-top">
                <span className="pill soft" style={{ "--c": "#7fb48a" }}>Workshop</span>
                {w.clubs?.name && <span className="pill soft" style={{ "--c": w.clubs.color }}>{w.clubs.name}</span>}
                {upcoming(w) && <span className="when"><RelTime date={w.starts_at} mode="until" /></span>}
              </div>
              <h3 className="notice-title">{w.title}</h3>
              <p className="audience">For {audienceLabel(w)}</p>
              {w.description && <p style={{ whiteSpace: "pre-wrap" }}>{w.description}</p>}
              <p className="when-line"><CalendarClock size={16} /> {fmtDate(w.starts_at)}{w.venue && <> · <MapPin size={16} /> {w.venue}</>} · <Armchair size={16} /> {left === 0 ? `Full${c.waitlist ? `, ${c.waitlist} waiting` : ""}` : `${left} of ${w.seats} seats left`}</p>
              {upcoming(w) && (
                <div className="notice-actions">
                  <WorkshopButton id={w.id} mine={mine.get(w.id)} full={left === 0} closed={closed && !mine.has(w.id)} />
                  {mine.get(w.id) === "registered" && <Remind kind="workshop" refId={w.id} title={w.title} url="/dashboard/workshops" at={w.starts_at} />}
                </div>
              )}
              {manage && (
                <div className="notice-actions">
                  <CsvLink href={`/dashboard/workshops/${w.id}/attendees`} />
                  <RecordEditor table="workshops" record={w} clubs={clubs || []} userId={user.id} isAdmin={isAdmin} />
                </div>
              )}
            </article>
          );
        })}</div>
      )}
    </>
  );
}
