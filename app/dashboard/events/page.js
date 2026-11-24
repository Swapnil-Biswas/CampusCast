import { CalendarClock, MapPin } from "lucide-react";
import { getPublisher } from "../../../lib/dash/ctx";
import { fmtDate } from "../../../lib/dash/meta";
import RelTime from "../../../components/dashboard/RelTime";
import RecordEditor from "../../../components/dashboard/RecordEditor";
import { FollowChip, RsvpButtons } from "../../../components/dashboard/OfficialActions";
import { Remind, Tabs } from "../../../components/dashboard/Bits";

export const metadata = { title: "Cultural events" };
const TABS = [["upcoming", "Upcoming"], ["going", "I'm going"], ["past", "Past events"]];

export default async function Events({ searchParams }) {
  const sp = await searchParams;
  const tab = TABS.some(([v]) => v === sp.tab) ? sp.tab : "upcoming";
  const { supabase, user, isAdmin, ledClubs, canPublish } = await getPublisher();
  const nowIso = new Date().toISOString();
  const [{ data: all, error }, { data: clubs }, { data: follows }, { data: counts }, { data: rsvps }] = await Promise.all([
    supabase.from("events").select("*, clubs(name,color)").order("starts_at", { ascending: tab !== "past" }),
    supabase.from("clubs").select("id,name,color").order("name"),
    supabase.from("club_follows").select("club_id").eq("user_id", user.id),
    supabase.rpc("event_counts"),
    supabase.from("event_rsvps").select("event_id,status").eq("user_id", user.id),
  ]);
  const followed = new Set((follows || []).map((f) => f.club_id));
  const cnt = new Map((counts || []).map((c) => [c.event_id, c]));
  const mine = new Map((rsvps || []).map((r) => [r.event_id, r.status]));
  const data = (all || []).filter((e) => tab === "past" ? e.starts_at < nowIso : tab === "going" ? mine.get(e.id) === "going" && e.starts_at >= nowIso : e.starts_at >= nowIso);

  // Posters live in a private bucket: hand the browser short-lived links.
  const posters = new Map();
  await Promise.all(data.filter((e) => e.poster?.path).map(async (e) => {
    const { data: s } = await supabase.storage.from("event-media").createSignedUrl(e.poster.path, 3600);
    if (s) posters.set(e.id, s.signedUrl);
  }));
  const manageClubs = isAdmin ? clubs : ledClubs;

  return (
    <>
      <div className="page-head">
        <div><h1>Cultural events</h1><p>Follow clubs to get their notices in your feed, and say whether you are interested or going.</p></div>
        {canPublish && <RecordEditor table="events" clubs={manageClubs || []} userId={user.id} isAdmin={isAdmin} big />}
      </div>

      <section aria-label="Clubs" style={{ marginBottom: 16 }}>
        <p className="audience">CLUBS · FOLLOW TO HEAR FROM THEM</p>
        <div className="filters">{(clubs || []).map((c) => <FollowChip key={c.id} club={c} on={followed.has(c.id)} />)}</div>
      </section>

      <Tabs tabs={TABS} current={tab} base="/dashboard/events" />
      {error && <p className="form-msg err">{error.message}</p>}
      {!data.length ? <div className="empty"><h2>{tab === "going" ? "You have not marked any event as going" : "No events here"}</h2><p>Events posted by clubs and the college will appear here.</p></div> : (
        <div className="feed">{data.map((e) => {
          const c = cnt.get(e.id) || { interested: 0, going: 0 };
          const manage = isAdmin || e.created_by === user.id;
          const isPast = e.starts_at < nowIso;
          return (
            <article key={e.id} className="notice" style={{ "--u": e.clubs?.color || "#c58ad1" }}>
              {posters.get(e.id) && <img src={posters.get(e.id)} alt={`Poster for ${e.title}`} style={{ width: "100%", maxHeight: 340, objectFit: "cover", borderRadius: 10, marginBottom: 10 }} />}
              <div className="notice-top">
                <span className="pill soft" style={{ "--c": "#c58ad1" }}>Cultural</span>
                {e.clubs?.name && <span className="pill soft" style={{ "--c": e.clubs.color }}>{e.clubs.name}</span>}
                {!isPast && <span className="when"><RelTime date={e.starts_at} mode="until" /></span>}
              </div>
              <h3 className="notice-title">{e.title}</h3>
              {e.description && <p style={{ whiteSpace: "pre-wrap" }}>{e.description}</p>}
              <p className="when-line"><CalendarClock size={16} /> {fmtDate(e.starts_at)}{e.venue && <> · <MapPin size={16} /> {e.venue}</>}</p>
              <div className="notice-actions">
                {!isPast && <RsvpButtons id={e.id} mine={mine.get(e.id)} counts={c} />}
                {!isPast && <Remind kind="event" refId={e.id} title={e.title} url="/dashboard/events" at={e.starts_at} />}
                {isPast && <span className="inline-msg">{c.going} went · {c.interested} were interested</span>}
                {manage && <RecordEditor table="events" record={e} clubs={manageClubs || []} userId={user.id} isAdmin={isAdmin} />}
              </div>
            </article>
          );
        })}</div>
      )}
    </>
  );
}
