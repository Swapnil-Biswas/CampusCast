import Link from "next/link";
import { CalendarClock, ExternalLink, MapPin, Trophy, Users } from "lucide-react";
import { getPublisher } from "../../../lib/dash/ctx";
import { fmtDate } from "../../../lib/dash/meta";
import RelTime from "../../../components/dashboard/RelTime";
import RecordEditor from "../../../components/dashboard/RecordEditor";
import { InterestButton } from "../../../components/dashboard/OfficialActions";
import { Remind } from "../../../components/dashboard/Bits";

export const metadata = { title: "Hackathons" };
const MODES = { online: "Online", offline: "On campus", hybrid: "Hybrid" };

export default async function Hackathons({ searchParams }) {
  const sp = await searchParams;
  const one = (v) => (Array.isArray(v) ? v[0] : v) || "";
  const f = { theme: one(sp.theme), mode: one(sp.mode), when: ["open", "closed", "all"].includes(one(sp.when)) ? one(sp.when) : "open" };
  const { supabase, user, isAdmin, ledClubs, canPublish } = await getPublisher();
  const nowIso = new Date().toISOString();

  let q = supabase.from("hackathons").select("*, clubs(name,color)");
  if (f.mode) q = q.eq("mode", f.mode);
  if (f.theme) q = q.eq("theme", f.theme);
  if (f.when === "open") q = q.gte("deadline", nowIso); else if (f.when === "closed") q = q.lt("deadline", nowIso);
  q = q.order("deadline", { ascending: f.when !== "closed" });
  const [{ data, error }, { data: themes }, { data: counts }, { data: mine }, { data: clubs }] = await Promise.all([
    q,
    supabase.from("hackathons").select("theme"),
    supabase.rpc("hackathon_counts"),
    supabase.from("hackathon_interest").select("hackathon_id").eq("user_id", user.id),
    isAdmin ? supabase.from("clubs").select("id,name").order("name") : Promise.resolve({ data: ledClubs }),
  ]);
  const cnt = new Map((counts || []).map((c) => [c.hackathon_id, c.interested]));
  const mineSet = new Set((mine || []).map((m) => m.hackathon_id));
  const themeList = [...new Set((themes || []).map((t) => t.theme))].sort();

  return (
    <>
      <div className="page-head">
        <div><h1>Hackathons</h1><p>Filter by theme and mode, watch the deadline countdown, set a reminder, and find teammates.</p></div>
        {canPublish && <Link className="btn" href="/dashboard/hackathons/manage">Post a hackathon</Link>}
      </div>

      <form className="filters" method="get" role="search" aria-label="Filter hackathons">
        <label className="sel"><span>Theme</span><select name="theme" defaultValue={f.theme}><option value="">All</option>{themeList.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="sel"><span>Mode</span><select name="mode" defaultValue={f.mode}><option value="">All</option>{Object.entries(MODES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="sel"><span>Deadline</span><select name="when" defaultValue={f.when}><option value="open">Still open</option><option value="closed">Closed</option><option value="all">All</option></select></label>
        <button className="chip on">Apply</button>
        {(f.theme || f.mode || f.when !== "open") && <Link className="link-btn" href="/dashboard/hackathons">Clear</Link>}
      </form>
      {error && <p className="form-msg err">{error.message}</p>}

      {!data?.length ? <div className="empty"><h2>No hackathons match</h2><p>Try a different theme or mode, or check closed ones.</p></div> : (
        <div className="feed">{data.map((h) => {
          const open = new Date(h.deadline) > new Date(nowIso);
          const manage = isAdmin || h.created_by === user.id;
          return (
            <article key={h.id} className="notice" style={{ "--u": "#8ec5d6" }}>
              <div className="notice-top">
                <span className="pill soft" style={{ "--c": "#8ec5d6" }}>{h.theme}</span>
                <span className="pill soft" style={{ "--c": "#d9c8a8" }}>{MODES[h.mode]}</span>
                {h.clubs?.name && <span className="pill soft" style={{ "--c": h.clubs.color }}>{h.clubs.name}</span>}
                <span className="when">{open ? <>Register <RelTime date={h.deadline} mode="until" /></> : "Registration closed"}</span>
              </div>
              <h3 className="notice-title">{h.title}</h3>
              {h.description && <p style={{ whiteSpace: "pre-wrap" }}>{h.description}</p>}
              <p className="when-line"><CalendarClock size={16} /> Deadline {fmtDate(h.deadline)}{h.starts_at && <> · Starts {fmtDate(h.starts_at)}</>}</p>
              <p className="when-line"><Users size={16} /> Teams of {h.team_min === h.team_max ? h.team_max : `${h.team_min} to ${h.team_max}`}{h.location && <> · <MapPin size={16} /> {h.location}</>}{h.prize && <> · <Trophy size={16} /> {h.prize}</>}</p>
              <div className="notice-actions">
                <InterestButton id={h.id} on={mineSet.has(h.id)} count={cnt.get(h.id) || 0} hackathon />
                {open && <Remind kind="hackathon" refId={h.id} title={`${h.title}: registration closes`} url="/dashboard/hackathons" at={h.deadline} offsets={[["3 days before the deadline", 3 * 864e5], ["1 day before the deadline", 864e5], ["3 hours before the deadline", 108e5]]} />}
                {h.link && open && <a className="btn-s clay" href={h.link} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Register</a>}
                {manage && <RecordEditor table="hackathons" record={h} clubs={clubs || []} userId={user.id} isAdmin={isAdmin} />}
              </div>
            </article>
          );
        })}</div>
      )}
    </>
  );
}
