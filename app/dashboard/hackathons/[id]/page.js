import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarPlus, ExternalLink, FileText, Globe, Mail, MapPin, MessageCircle, Pencil, Phone, Share2, Trophy, Users, Wallet } from "lucide-react";
import { getPublisher } from "../../../../lib/dash/ctx";
import { isUuid } from "../../../../lib/hackathons/validate";
import { fmtDateTime, fmtRange, formatRupees, hackathonPhase, telLink, waLink } from "../../../../lib/hackathons/status";
import { organiserLine } from "../../../../lib/hackathons/organiser";
import { CAMPUS, directionsUrl, formatKm, osmDirectionsUrl, osmEmbedUrl, placeUrl, routeSummary } from "../../../../lib/hackathons/geo";
import Countdown from "../../../../components/dashboard/Countdown";
import ScheduleTimeline from "../../../../components/dashboard/ScheduleTimeline";
import CopyButton from "../../../../components/dashboard/CopyButton";
import { InterestButton } from "../../../../components/dashboard/OfficialActions";

const MODES = { online: "Online", offline: "On campus", hybrid: "Hybrid" };
const PHASE_COLOR = { live: "#2f7a4a", open: "#7fb48a", closing: "#f3b63f", upcoming: "#8ec5d6", closed: "#d9c8a8", ended: "#d9c8a8", cancelled: "#e8603c" };
const host = (u) => { try { return new URL(u).host; } catch { return u; } };

export async function generateMetadata({ params }) {
  return { title: "Hackathon" };
}

export default async function HackathonDetail({ params }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase, user, isAdmin, ledClubs } = await getPublisher();
  const [{ data: h }, { data: counts }, { data: mine }] = await Promise.all([
    supabase.from("hackathons").select("*, club:clubs(id, name, color), docs:hackathon_documents(id, original_filename, mime_type, created_at)").eq("id", id).maybeSingle(),
    supabase.rpc("hackathon_counts"),
    supabase.from("hackathon_interest").select("hackathon_id").eq("user_id", user.id),
  ]);
  if (!h) notFound();
  const canManage = isAdmin || (h.club_id && (ledClubs || []).some((c) => c.id === h.club_id));
  if (h.status === "draft" && !canManage) notFound();

  const nowMs = Date.now();
  const p = hackathonPhase(h, nowMs);
  const interested = (counts || []).find((c) => c.hackathon_id === h.id)?.interested || 0;
  const on = (mine || []).some((m) => m.hackathon_id === h.id);
  const docs = [...(h.docs || [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const poster = docs.find((d) => d.mime_type?.startsWith("image/"));
  const brochures = docs.filter((d) => d.mime_type === "application/pdf");
  const organizer = organiserLine(h);
  const prize = formatRupees(h.prize_amount);
  const mainLink = h.website_url || h.link;
  const d = h.details || {};
  const tel = telLink(h.contact_phone), wa = waLink(h.contact_phone, `Hi, I have a question about ${h.title}.`);
  const canRegister = h.link && ["open", "closing"].includes(p.key);
  // where it is, and how to get there from BMSIT
  const pinOk = h.venue_lat != null && h.venue_lng != null;
  const dest = pinOk ? { lat: Number(h.venue_lat), lng: Number(h.venue_lng) } : { text: [h.location, h.venue_address].filter(Boolean).join(", ") };
  const route = routeSummary(h);
  const showWhere = Boolean((h.off_campus || pinOk) && (pinOk || dest.text));
  const share = [h.title + (h.tagline ? ` - ${h.tagline}` : ""), fmtRange(h.starts_at, h.ends_at), h.location, prize ? `Prize pool ${prize}` : h.prize, mainLink].filter(Boolean).join("\n");

  return (
    <div className="hk-page">
      <Link href="/dashboard/hackathons" className="back-link"><ArrowLeft size={16} /> All hackathons</Link>
      {h.status === "draft" && <p className="form-msg">This is a draft. Only you and your club's admins can see it. <Link href={`/dashboard/hackathons/manage/${h.id}`}>Open the editor to publish</Link>.</p>}
      {h.status === "cancelled" && <p className="form-msg err" role="status">This hackathon was cancelled by the organisers.</p>}

      <section className="hk-hero">
        {poster && <a className="hk-poster" href={`/api/hackathons/file/${poster.id}`} target="_blank" rel="noopener noreferrer" aria-label="Open the poster"><img src={`/api/hackathons/file/${poster.id}`} alt={`Poster of ${h.title}`} /></a>}
        <div className="hk-hero-main">
          <div className="notice-top">
            <span className="pill soft hk-phase" style={{ "--c": PHASE_COLOR[p.key] }}>{p.label}</span>
            {h.theme && <span className="pill soft" style={{ "--c": "#8ec5d6" }}>{h.theme}</span>}
            <span className="pill soft" style={{ "--c": "#d9c8a8" }}>{MODES[h.mode]}</span>
            {organizer && <span className="pill soft" style={{ "--c": h.club?.color || "#d9c8a8" }}>{organizer}</span>}
          </div>
          <h1>{h.title}</h1>
          {h.tagline && <p className="hk-tagline">{h.tagline}</p>}
          {organizer && <p className="audience">Organised by {organizer}{!h.club_id && " (another college or organisation)"}</p>}

          {p.target && <Countdown target={p.target.at} label={p.target.label} tone={p.key} detail={fmtDateTime(new Date(p.target.at).toISOString())} />}
          {!p.target && p.key === "live" && <p className="form-msg" role="status">It is happening right now.</p>}

          <div className="notice-actions">
            <InterestButton id={h.id} on={on} count={interested} hackathon />
            {canRegister && <a className="btn" href={h.link} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Register now</a>}
            {h.website_url && <a className={canRegister ? "btn-s" : "btn"} href={h.website_url} target="_blank" rel="noopener noreferrer"><Globe size={16} /> Open the official website</a>}
          </div>
          <div className="notice-actions">
            {(h.starts_at || h.deadline) && <a className="btn-s" href={`/dashboard/hackathons/${h.id}/ics`}><CalendarPlus size={16} /> Add to calendar</a>}
            <a className="btn-s" href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noopener noreferrer"><Share2 size={16} /> Share on WhatsApp</a>
            {canManage && <Link className="btn-s" href={`/dashboard/hackathons/manage/${h.id}`}><Pencil size={14} /> Edit</Link>}
          </div>
        </div>
      </section>

      <section className="hk-grid" aria-label="Key details">
        <div className="hk-fact"><span>When</span><b>{fmtRange(h.starts_at, h.ends_at) || "To be announced"}</b></div>
        <div className="hk-fact"><span>Venue</span><b>{h.location || h.venue_address || "To be announced"}</b>
          {h.location && h.venue_address && <small>{h.venue_address}</small>}
          {h.off_campus && <small className="hk-off">Outside the BMSIT campus{route?.km != null ? ` · ${formatKm(route.km)} from ${CAMPUS.short}${route.road ? " by road" : ""}` : ""}</small>}
          {h.map_url && <a href={h.map_url} target="_blank" rel="noopener noreferrer"><MapPin size={14} /> Open the map</a>}</div>
        <div className={`hk-fact${prize || h.prize ? " big" : ""}`}><span><Trophy size={14} /> Prize pool</span><b>{prize || h.prize || "Not stated"}</b>{prize && h.prize && !h.prize.includes(prize.replace("₹", "")) && <small>{h.prize}</small>}</div>
        <div className="hk-fact"><span><Users size={14} /> Team size</span><b>{h.team_min === h.team_max ? `${h.team_max} member${h.team_max === 1 ? "" : "s"}` : `${h.team_min} to ${h.team_max} members`}</b></div>
        <div className="hk-fact"><span><Wallet size={14} /> Entry fee</span><b>{h.fee_amount == null ? "Not stated" : Number(h.fee_amount) === 0 ? "Free" : formatRupees(h.fee_amount)}</b>{h.fee_note && <small>{h.fee_note}</small>}</div>
        <div className="hk-fact"><span>Registration</span><b>{h.deadline ? `Closes ${fmtDateTime(h.deadline)}` : "See the organisers"}</b>{h.registration_opens_at && <small>Opens {fmtDateTime(h.registration_opens_at)}</small>}</div>
        {h.eligibility && <div className="hk-fact wide"><span>Who can take part</span><b>{h.eligibility}</b></div>}
      </section>

      {showWhere && (
        <section className="hk-sec hk-where" aria-label="Getting there">
          <h2>{h.off_campus ? "Getting there" : "Location"} <small>{h.off_campus ? `Outside the ${CAMPUS.short} campus` : `At the ${CAMPUS.short} campus`}</small></h2>
          <p className="hk-venue"><b>{h.location || "Venue"}</b>{h.venue_address && <span>{h.venue_address}</span>}</p>
          {route?.text && (
            <div className="hk-route">
              <b>{formatKm(route.km)}</b>
              <span>{route.text}. Traffic in Bengaluru can make it much longer, so leave early.</span>
            </div>
          )}
          {h.off_campus && !route?.text && <p className="inline-msg">The distance has not been measured yet. Open the directions to see it.</p>}
          <div className="notice-actions">
            {h.off_campus && <a className="btn" href={directionsUrl({ to: dest })} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Directions from {CAMPUS.short}</a>}
            {h.off_campus && <a className="btn-s" href={directionsUrl({ to: dest, mode: "transit" })} target="_blank" rel="noopener noreferrer">By bus or metro</a>}
            <a className="btn-s" href={placeUrl(dest)} target="_blank" rel="noopener noreferrer"><MapPin size={14} /> Open in Google Maps</a>
            {h.off_campus && pinOk && <a className="btn-s" href={osmDirectionsUrl(CAMPUS, dest)} target="_blank" rel="noopener noreferrer">Route on OpenStreetMap</a>}
          </div>
          {pinOk && <iframe className="hk-map" title={`Map of ${h.location || "the venue"}`} src={osmEmbedUrl(dest)} loading="lazy" referrerPolicy="no-referrer" />}
          <small className="hk-ext">The map and directions open in a new window; come back here for the programme and the countdown. Distances are measured on roads with free map services, without live traffic.</small>
        </section>
      )}

      {(h.description || (h.tracks || []).length > 0) && (
        <section className="hk-sec">
          <h2>About</h2>
          {h.description && <p style={{ whiteSpace: "pre-wrap" }}>{h.description}</p>}
          {(h.tracks || []).length > 0 && <><h3>Tracks</h3><div className="chips">{h.tracks.map((t) => <span key={t} className="pill soft" style={{ "--c": "#8ec5d6" }}>{t}</span>)}</div></>}
        </section>
      )}

      {(h.prize_breakdown || []).length > 0 && (
        <section className="hk-sec">
          <h2>Prizes</h2>
          <div className="table-wrap"><table className="tbl"><tbody>{h.prize_breakdown.map((x, i) => (
            <tr key={i}><td><b>{x.label}</b>{x.note && <small>{x.note}</small>}</td><td className="hk-amt">{x.amount != null ? formatRupees(x.amount) : "—"}</td></tr>
          ))}</tbody></table></div>
        </section>
      )}

      {(h.schedule || []).length > 0 && (
        <section className="hk-sec">
          <h2>Programme <small>India time · follows the clock</small></h2>
          <ScheduleTimeline items={h.schedule} />
        </section>
      )}

      {[["Perks", d.perks], ["Rules and requirements", d.rules], ["Sponsors and partners", d.sponsors]].some(([, l]) => (l || []).length) && (
        <section className="hk-sec hk-lists">
          {[["Perks", d.perks], ["Rules and requirements", d.rules], ["Sponsors and partners", d.sponsors]].filter(([, l]) => (l || []).length).map(([title, l]) => (
            <div key={title}><h3>{title}</h3><ul>{l.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          ))}
        </section>
      )}

      <section className="hk-sec hk-contact">
        <div>
          <h2>Questions?</h2>
          {h.contact_name || h.contact_phone || h.contact_email ? (
            <>
              {h.contact_name && <p className="hk-who">Contact <b>{h.contact_name}</b>{organizer ? `, ${organizer}` : ""}</p>}
              <div className="notice-actions">
                {tel && <a className="btn-s" href={tel}><Phone size={14} /> Call {h.contact_phone}</a>}
                {wa && <a className="btn-s" href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> WhatsApp</a>}
                {!tel && h.contact_phone && <span className="inline-msg">{h.contact_phone}</span>}
                {h.contact_email && <a className="btn-s" href={`mailto:${h.contact_email}`}><Mail size={14} /> {h.contact_email}</a>}
                {h.contact_phone && <CopyButton text={h.contact_phone} label="Copy number" />}
              </div>
            </>
          ) : <p className="inline-msg">The organisers did not share a contact number or email. Check the official website{brochures.length || poster ? " or the poster" : ""}.</p>}
          {brochures.map((b) => <p key={b.id}><a className="btn-s" href={`/api/hackathons/file/${b.id}`} target="_blank" rel="noopener noreferrer"><FileText size={14} /> View the brochure</a> <a className="link-btn" href={`/api/hackathons/file/${b.id}?download=1`}>Download</a></p>)}
        </div>

        {mainLink && (
          <div className="hk-linkbox">
            <b>{h.website_url ? "Official website" : "Registration page"}</b>
            <a className="btn" href={mainLink} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Open in a new window</a>
            <small>{host(mainLink)}</small>
            <CopyButton text={mainLink} label="Copy link" />
            {h.website_url && h.link && h.link !== h.website_url && <a className="btn-s" href={h.link} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Registration page ({host(h.link)})</a>}
            <small className="hk-ext">Opens the organisers' own site. Come back here for the programme, the countdown and your calendar.</small>
          </div>
        )}
      </section>
    </div>
  );
}
