import Link from "next/link";
import { CalendarClock, ExternalLink, MapPin, Trophy, Users, Wallet } from "lucide-react";
import { getPublisher } from "../../../lib/dash/ctx";
import { fmtRange, formatRupees, hackathonPhase, ms, sortHackathons } from "../../../lib/hackathons/status";
import { CAMPUS, formatKm } from "../../../lib/hackathons/geo";
import { organiserLine } from "../../../lib/hackathons/organiser";
import Countdown from "../../../components/dashboard/Countdown";
import { InterestButton } from "../../../components/dashboard/OfficialActions";

export const metadata = { title: "Hackathons" };
const MODES = { online: "Online", offline: "On campus", hybrid: "Hybrid" };
const PHASE_COLOR = { live: "#2f7a4a", open: "#7fb48a", closing: "#f3b63f", upcoming: "#8ec5d6", closed: "#d9c8a8", ended: "#d9c8a8", cancelled: "#e8603c" };
const WHEN = { active: "Upcoming and live", ended: "Ended or cancelled", all: "All" };

export default async function Hackathons({ searchParams }) {
  const sp = await searchParams;
  const one = (v) => (Array.isArray(v) ? v[0] : v) || "";
  const f = { q: one(sp.q).trim().slice(0, 60), by: one(sp.by).slice(0, 40), theme: one(sp.theme), mode: one(sp.mode), when: Object.hasOwn(WHEN, one(sp.when)) ? one(sp.when) : "active" };
  const { supabase, user, canPublish } = await getPublisher();
  const nowMs = Date.now();

  const [{ data, error }, { data: counts }, { data: mine }] = await Promise.all([
    supabase.from("hackathons").select("*, club:clubs(name, color), docs:hackathon_documents(id, mime_type, created_at)").neq("status", "draft").limit(300),
    supabase.rpc("hackathon_counts"),
    supabase.from("hackathon_interest").select("hackathon_id").eq("user_id", user.id),
  ]);
  const cnt = new Map((counts || []).map((c) => [c.hackathon_id, c.interested]));
  const mineSet = new Set((mine || []).map((m) => m.hackathon_id));
  const all = (data || []).map((h) => ({ ...h, phase: hackathonPhase(h, nowMs) }));
  const themeList = [...new Set(all.map((h) => h.theme).filter(Boolean))].sort();
  // "Organised by": the clubs that have posted something, and everything from other colleges
  const clubList = [...new Map(all.filter((h) => h.club_id && h.club?.name).map((h) => [h.club_id, h.club.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const hasOutside = all.some((h) => !h.club_id);

  const needle = f.q.toLowerCase();
  const shown = sortHackathons(all.filter((h) => {
    if (f.mode && h.mode !== f.mode) return false;
    if (f.theme && h.theme !== f.theme) return false;
    if (f.by === "outside" ? Boolean(h.club_id) : f.by && h.club_id !== f.by) return false;
    const over = ["ended", "cancelled"].includes(h.phase.key);
    if (f.when === "active" && over) return false;
    if (f.when === "ended" && !over) return false;
    if (needle && ![h.title, h.tagline, h.theme, h.club?.name, h.organizer_name, ...(h.tracks || [])].some((x) => String(x || "").toLowerCase().includes(needle))) return false;
    return true;
  }), nowMs);
  const live = all.filter((h) => h.phase.key === "live").length;
  const filtered = f.q || f.by || f.theme || f.mode || f.when !== "active";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hackathons</h1>
          <p>{live ? `${live} happening right now. ` : ""}Every detail the organisers shared: prizes, venue, schedule, contact and the official link. Watch the countdown and find teammates.</p>
        </div>
        {canPublish && <Link className="btn" href="/dashboard/hackathons/manage">Post a hackathon</Link>}
      </div>

      <form className="filters" method="get" role="search" aria-label="Find hackathons">
        <label className="sel"><span>Search</span><input name="q" defaultValue={f.q} placeholder="Name, club or theme" /></label>
        <label className="sel"><span>Organised by</span><select name="by" defaultValue={f.by}><option value="">Everyone</option>{clubList.map(([id, name]) => <option key={id} value={id}>{name}</option>)}{hasOutside && <option value="outside">Other colleges</option>}</select></label>
        <label className="sel"><span>Theme</span><select name="theme" defaultValue={f.theme}><option value="">All</option>{themeList.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="sel"><span>Mode</span><select name="mode" defaultValue={f.mode}><option value="">All</option>{Object.entries(MODES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="sel"><span>Show</span><select name="when" defaultValue={f.when}>{Object.entries(WHEN).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <button className="chip on">Apply</button>
        {filtered && <Link className="link-btn" href="/dashboard/hackathons">Clear</Link>}
      </form>
      {error && <p className="form-msg err">{error.message}</p>}

      {!shown.length ? <div className="empty"><h2>No hackathons match</h2><p>{filtered ? "Try a different search or filter." : "When a club posts one, it shows up here with its countdown."}</p></div> : (
        <div className="feed">{shown.map((h) => {
          const p = h.phase;
          const poster = (h.docs || []).filter((d) => d.mime_type?.startsWith("image/")).sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
          const prize = formatRupees(h.prize_amount);
          const organizer = organiserLine(h);
          const canRegister = h.link && ["open", "closing"].includes(p.key);
          return (
            <article key={h.id} className={`notice hk-card${["ended", "cancelled"].includes(p.key) ? " over" : ""}`} style={{ "--u": PHASE_COLOR[p.key] }}>
              {poster && <Link className="hk-thumb" href={`/dashboard/hackathons/${h.id}`} tabIndex={-1} aria-hidden="true"><img src={`/api/hackathons/file/${poster.id}`} alt="" loading="lazy" /></Link>}
              <div className="hk-body">
                <div className="notice-top">
                  <span className="pill soft hk-phase" style={{ "--c": PHASE_COLOR[p.key] }}>{p.label}</span>
                  {h.theme && <span className="pill soft" style={{ "--c": "#8ec5d6" }}>{h.theme}</span>}
                  <span className="pill soft" style={{ "--c": "#d9c8a8" }}>{MODES[h.mode]}</span>
                  {organizer && <span className="pill soft" style={{ "--c": h.club?.color || "#d9c8a8" }}>{organizer}</span>}
                </div>
                <h3 className="notice-title"><Link href={`/dashboard/hackathons/${h.id}`}>{h.title}</Link></h3>
                {h.tagline && <p className="audience">{h.tagline}</p>}

                {p.target && <Countdown target={p.target.at} label={p.target.label} tone={p.key} compact />}

                <ul className="hk-facts">
                  {(h.starts_at || h.ends_at) && <li><CalendarClock size={16} /> <span>{fmtRange(h.starts_at, h.ends_at)}</span></li>}
                  {(h.location || h.venue_address) && <li><MapPin size={16} /> <span>{h.location || h.venue_address}{h.off_campus && <b className="hk-off"> · Outside campus{h.route_km != null ? `, ${formatKm(h.route_km)} from ${CAMPUS.short}` : ""}</b>}</span></li>}
                  <li><Users size={16} /> <span>Teams of {h.team_min === h.team_max ? h.team_max : `${h.team_min} to ${h.team_max}`}</span></li>
                  {h.fee_amount !== null && h.fee_amount !== undefined && <li><Wallet size={16} /> <span>{Number(h.fee_amount) === 0 ? "Free entry" : `Entry ${formatRupees(h.fee_amount)}`}</span></li>}
                  {(prize || h.prize) && <li className="hk-prize"><Trophy size={16} /> <span><b>{prize || h.prize}</b> prize pool</span></li>}
                </ul>

                <div className="notice-actions">
                  <Link className="btn-s" href={`/dashboard/hackathons/${h.id}`}>Full details</Link>
                  <InterestButton id={h.id} on={mineSet.has(h.id)} count={cnt.get(h.id) || 0} hackathon />
                  {canRegister && <a className="btn-s clay" href={h.link} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Register</a>}
                  {h.website_url && <a className="btn-s" href={h.website_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Website</a>}
                </div>
              </div>
            </article>
          );
        })}</div>
      )}
    </>
  );
}
