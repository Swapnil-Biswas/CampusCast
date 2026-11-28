import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FileText, Globe, Mail, MapPin, MessageCircle, Pencil, Phone, Share2 } from "lucide-react";
import { getPublisher } from "../../../../lib/dash/ctx";
import { audienceLabel } from "../../../../lib/dash/meta";
import { isUuid } from "../../../../lib/hackathons/validate";
import { fmtDateTime, fmtRange, formatRupees, telLink, waLink } from "../../../../lib/hackathons/status";
import { organiserLine } from "../../../../lib/hackathons/organiser";
import { workshopPhase } from "../../../../lib/workshops/status";
import Countdown from "../../../../components/dashboard/Countdown";
import { WorkshopButton } from "../../../../components/dashboard/OfficialActions";
import { CsvLink, Remind } from "../../../../components/dashboard/Bits";

export const metadata = { title: "Workshop" };
const MODES = { online: "Online", offline: "On campus", hybrid: "Hybrid" };

export default async function WorkshopDetail({ params }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase, user, isAdmin, ledClubs } = await getPublisher();
  const [{ data: w }, { data: counts }, { data: reg }] = await Promise.all([
    supabase.from("workshops").select("*, club:clubs(id, name, color)").eq("id", id).maybeSingle(),
    supabase.rpc("workshop_counts"),
    supabase.from("workshop_registrations").select("status").eq("workshop_id", id).eq("user_id", user.id).maybeSingle(),
  ]);
  if (!w) notFound();
  // The posters are a separate query, so the page still opens before dashboard-12 has been run.
  const { data: docs } = await supabase.from("workshop_documents").select("id, mime_type, created_at").eq("workshop_id", id).order("created_at");
  const status = w.status || "published";
  const canManage = isAdmin || (ledClubs || []).some((c) => c.id === w.club_id) || (w.organizer_id === user.id && (ledClubs || []).length > 0);
  if (status === "draft" && !canManage) notFound();

  const nowMs = Date.now();
  const p = workshopPhase(w, nowMs);
  const c = (counts || []).find((x) => x.workshop_id === w.id) || { registered: 0, waitlist: 0 };
  const left = Math.max(0, w.seats - c.registered);
  const mine = reg?.status;
  const upcoming = status === "published" && w.starts_at && new Date(w.starts_at).getTime() > nowMs;
  const closed = w.reg_closes_at && new Date(w.reg_closes_at).getTime() <= nowMs;
  const poster = (docs || []).find((d) => d.mime_type?.startsWith("image/"));
  const brochures = (docs || []).filter((d) => d.mime_type === "application/pdf");
  const organizer = organiserLine(w);
  const tel = telLink(w.contact_phone), wa = waLink(w.contact_phone, `Hi, I have a question about ${w.title}.`);
  const perks = w.details?.perks || [];
  const share = [w.title + (w.tagline ? ` - ${w.tagline}` : ""), fmtRange(w.starts_at, w.ends_at), w.venue, w.website_url || w.link].filter(Boolean).join("\n");

  return (
    <div className="hk-page">
      <Link href="/dashboard/workshops" className="back-link"><ArrowLeft size={16} /> All workshops</Link>
      {status === "draft" && <p className="form-msg">This is a draft. Students cannot see it. <Link href={`/dashboard/workshops/manage/${w.id}`}>Open the editor to publish</Link>.</p>}
      {status === "cancelled" && <p className="form-msg err" role="status">This workshop was cancelled by the organisers.</p>}

      <section className="hk-hero">
        {poster && <a className="hk-poster" href={`/api/workshops/file/${poster.id}`} target="_blank" rel="noopener noreferrer" aria-label="Open the poster"><img src={`/api/workshops/file/${poster.id}`} alt={`Poster of ${w.title}`} /></a>}
        <div className="hk-hero-main">
          <div className="notice-top">
            <span className="pill soft hk-phase" style={{ "--c": p.color }}>{p.label}</span>
            <span className="pill soft" style={{ "--c": "#d9c8a8" }}>{MODES[w.mode] || MODES.offline}</span>
            {organizer && <span className="pill soft" style={{ "--c": w.club?.color || "#d9c8a8" }}>{organizer}</span>}
          </div>
          <h1>{w.title}</h1>
          {w.tagline && <p className="hk-tagline">{w.tagline}</p>}
          <p className="audience">For {audienceLabel(w)}</p>
          {p.target && <Countdown target={p.target.at} label={p.target.label} tone={p.key} detail={fmtDateTime(new Date(p.target.at).toISOString())} />}
          <div className="notice-actions">
            {upcoming && <WorkshopButton id={w.id} mine={mine} full={left === 0} closed={closed && !mine} />}
            {upcoming && mine === "registered" && <Remind kind="workshop" refId={w.id} title={w.title} url={`/dashboard/workshops/${w.id}`} at={w.starts_at} />}
          </div>
          {upcoming && w.link && <p className="inline-msg">The organisers also have their own registration form: <a href={w.link} target="_blank" rel="noopener noreferrer">open it</a>.</p>}
          <div className="notice-actions">
            {w.website_url && <a className="btn-s" href={w.website_url} target="_blank" rel="noopener noreferrer"><Globe size={16} /> Website</a>}
            {status === "published" && <a className="btn-s" href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noopener noreferrer"><Share2 size={16} /> Share on WhatsApp</a>}
            {canManage && <Link className="btn-s" href={`/dashboard/workshops/manage/${w.id}`}><Pencil size={14} /> Edit</Link>}
            {canManage && <CsvLink href={`/dashboard/workshops/${w.id}/attendees`} />}
          </div>
        </div>
      </section>

      <section className="hk-grid" aria-label="Key details">
        <div className="hk-fact"><span>When</span><b>{fmtRange(w.starts_at, w.ends_at) || "To be announced"}</b></div>
        <div className="hk-fact"><span>Venue</span><b>{w.venue || "To be announced"}</b>{w.map_url && <a href={w.map_url} target="_blank" rel="noopener noreferrer"><MapPin size={14} /> Open the map</a>}</div>
        <div className="hk-fact"><span>Seats</span><b>{left === 0 ? "Full" : `${left} of ${w.seats} left`}</b>{c.waitlist > 0 && <small>{c.waitlist} on the waitlist</small>}</div>
        <div className="hk-fact"><span>Fee</span><b>{w.fee_amount == null ? "Not stated" : Number(w.fee_amount) === 0 ? "Free" : formatRupees(w.fee_amount)}</b>{w.fee_note && <small>{w.fee_note}</small>}</div>
        <div className="hk-fact"><span>Registration</span><b>{w.reg_closes_at ? `Closes ${fmtDateTime(w.reg_closes_at)}` : "Until it starts"}</b></div>
        {w.speaker_name && <div className="hk-fact"><span>Speaker</span><b>{w.speaker_name}</b>{w.speaker_about && <small>{w.speaker_about}</small>}</div>}
        {w.eligibility && <div className="hk-fact wide"><span>Who can attend</span><b>{w.eligibility}</b></div>}
      </section>

      {(w.description || (w.topics || []).length > 0) && (
        <section className="hk-sec">
          <h2>What you will learn</h2>
          {w.description && <p style={{ whiteSpace: "pre-wrap" }}>{w.description}</p>}
          {(w.topics || []).length > 0 && <ul>{w.topics.map((t, i) => <li key={i}>{t}</li>)}</ul>}
        </section>
      )}

      {(w.prerequisites || perks.length > 0) && (
        <section className="hk-sec hk-lists">
          {w.prerequisites && <div><h3>What to know or bring</h3><p style={{ whiteSpace: "pre-wrap" }}>{w.prerequisites}</p></div>}
          {perks.length > 0 && <div><h3>Certificates and perks</h3><ul>{perks.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
        </section>
      )}

      <section className="hk-sec hk-contact">
        <div>
          <h2>Questions?</h2>
          {w.contact_name || w.contact_phone || w.contact_email ? (
            <>
              {w.contact_name && <p className="hk-who">Contact <b>{w.contact_name}</b></p>}
              <div className="notice-actions">
                {tel && <a className="btn-s" href={tel}><Phone size={14} /> Call {w.contact_phone}</a>}
                {wa && <a className="btn-s" href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> WhatsApp</a>}
                {!tel && w.contact_phone && <span className="inline-msg">{w.contact_phone}</span>}
                {w.contact_email && <a className="btn-s" href={`mailto:${w.contact_email}`}><Mail size={14} /> {w.contact_email}</a>}
              </div>
            </>
          ) : <p className="inline-msg">The organisers did not share a contact number or email.</p>}
          {brochures.map((b) => <p key={b.id}><a className="btn-s" href={`/api/workshops/file/${b.id}`} target="_blank" rel="noopener noreferrer"><FileText size={14} /> View the brochure</a> <a className="link-btn" href={`/api/workshops/file/${b.id}?download=1`}>Download</a></p>)}
          {w.link && !upcoming && <p><a className="link-btn" href={w.link} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Organisers&apos; form</a></p>}
        </div>
      </section>
    </div>
  );
}
