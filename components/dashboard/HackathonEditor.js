"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ExternalLink, LoaderCircle, Megaphone, Plus, Save, Trash2, Undo2, XCircle } from "lucide-react";
import { reapplyHackathonReading, removeHackathon, saveHackathon, setHackathonStatus } from "../../app/dashboard/hackathons/manage/actions";
import { publishIssues, toLocalInput, validateHackathon } from "../../lib/hackathons/validate";
import HackathonLocationPicker from "./HackathonLocationPicker";
import { OUT_OF_COLLEGE, isIeee, organiserAfterClubChange } from "../../lib/hackathons/organiser";

const MODES = [["offline", "On campus / in person"], ["online", "Online"], ["hybrid", "Hybrid"]];
const STATUS = { draft: ["Draft: only you can see it", "#d9c8a8"], published: ["Published: students can see it", "#7fb48a"], cancelled: ["Cancelled: students see it as cancelled", "#e8603c"] };
// the editor's field -> the name the AI reading used for it, so "Check" badges show on the right fields
const META = {
  title: "name", tagline: "tagline", theme: "theme", mode: "mode", clubId: "clubName", organizerName: "organizer", location: "venue", mapUrl: "mapLink",
  registrationOpensAt: "registrationOpensAt", deadline: "registrationDeadline", startsAt: "startsAt", endsAt: "endsAt", teamMin: "teamMin", teamMax: "teamMax",
  feeAmount: "feeAmount", feeNote: "feeNote", eligibility: "eligibility", tracks: "tracks", prizeAmount: "prizePoolAmount", prize: "prizePoolText",
  contactName: "contactName", contactPhone: "contactPhone", contactEmail: "contactEmail", websiteUrl: "websiteUrl", link: "registrationUrl",
  perks: "perks", rules: "rules", sponsors: "sponsors", offCampus: "offCampus", venueAddress: "venueAddress", venueLat: "venuePin", venueLng: "venuePin",
};

let counter = 0;
const nid = (p) => `${p}${++counter}`;

export default function HackathonEditor({ h, meta, warnings, autofilled, poster, clubs, isAdmin, reading, qrLinks = [], applyError = "" }) {
  const router = useRouter();
  const d = h.details || {};
  const top = useRef(null);
  const [f, setF] = useState(() => ({
    title: h.title || "", tagline: h.tagline || "", theme: h.theme || "", mode: h.mode || "offline", description: h.description || "",
    clubId: h.club_id || "", organizerName: h.organizer_name || "", location: h.location || "", mapUrl: h.map_url || "",
    offCampus: Boolean(h.off_campus), venueAddress: h.venue_address || "", venueLat: h.venue_lat != null ? String(h.venue_lat) : "", venueLng: h.venue_lng != null ? String(h.venue_lng) : "",
    registrationOpensAt: toLocalInput(h.registration_opens_at), deadline: toLocalInput(h.deadline), startsAt: toLocalInput(h.starts_at), endsAt: toLocalInput(h.ends_at),
    teamMin: h.team_min ?? 1, teamMax: h.team_max ?? 4,
    feeFree: h.fee_amount === 0, feeAmount: h.fee_amount > 0 ? String(h.fee_amount) : "", feeNote: h.fee_note || "", eligibility: h.eligibility || "",
    tracks: (h.tracks || []).join(", "),
    prizeAmount: h.prize_amount != null ? String(h.prize_amount) : "", prize: h.prize || "",
    contactName: h.contact_name || "", contactPhone: h.contact_phone || "", contactEmail: h.contact_email || "", websiteUrl: h.website_url || "", link: h.link || "",
    perks: (d.perks || []).join("\n"), rules: (d.rules || []).join("\n"), sponsors: (d.sponsors || []).join("\n"),
  }));
  const [prizes, setPrizes] = useState(() => (h.prize_breakdown || []).map((p) => ({ k: nid("p"), label: p.label || "", amount: p.amount != null ? String(p.amount) : "", note: p.note || "" })));
  const [rows, setRows] = useState(() => (h.schedule || []).map((e) => ({ k: nid("s"), at: toLocalInput(e.at), endAt: toLocalInput(e.endAt), title: e.title || "", note: e.note || "", check: Boolean(e.needsReview) })));
  const [touched, setTouched] = useState({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  // Choosing a club fills the organiser with the club's name (not for IEEE societies); a name that was typed is kept.
  const pickClub = (id) => {
    const prev = clubs.find((c) => c.id === f.clubId) || null, next = clubs.find((c) => c.id === id) || null;
    setF((s) => ({ ...s, clubId: id, organizerName: organiserAfterClubChange(s.organizerName, prev, next) }));
    setTouched((t) => ({ ...t, clubId: true, organizerName: true })); setDirty(true); setMsg(null);
  };
  const set = (key, value) => { setF((s) => ({ ...s, [key]: value })); setTouched((t) => ({ ...t, [key]: true })); setDirty(true); setMsg(null); };
  const flagged = (key) => autofilled && !touched[key] && META[key] && meta?.[META[key]]?.needsReview;
  const Badge = ({ k }) => flagged(k)
    ? <span className="chk" title={[meta[META[k]].source !== "explicit" ? `Not stated directly on the poster (${meta[META[k]].source})` : "Low confidence", meta[META[k]].evidence ? `“${meta[META[k]].evidence}”` : ""].filter(Boolean).join(" · ")}><AlertTriangle size={12} /> Check</span>
    : null;

  const payload = () => ({
    ...f, tracks: f.tracks.split(",").map((x) => x.trim()).filter(Boolean),
    prizeBreakdown: prizes.map(({ label, amount, note }) => ({ label, amount, note })),
    schedule: rows.map(({ at, endAt, title, note }) => ({ at, endAt, title, note })),
  });
  const check = useMemo(() => validateHackathon(payload(), { clubs, isAdmin }), [f, prizes, rows]);   // eslint-disable-line react-hooks/exhaustive-deps
  const issues = check.ok ? publishIssues(check.patch) : null;

  const finish = (res, okText) => {
    setBusy(null);
    if (res?.error) { setMsg({ err: true, text: res.errors?.length > 1 ? res.errors.join(" ") : res.error }); top.current?.scrollIntoView({ behavior: "smooth", block: "start" }); return false; }
    setDirty(false); setMsg({ text: okText }); router.refresh(); return true;
  };
  const save = async () => { setBusy("save"); setMsg(null); return finish(await saveHackathon({ id: h.id, data: payload() }), h.status === "published" ? "Changes saved. Students see them now." : "Draft saved."); };
  const setStatus = async (status, text, confirmText) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(status); setMsg(null);
    const saved = dirty || status === "published" ? await saveHackathon({ id: h.id, data: payload() }) : { ok: true };
    if (saved.error) return finish(saved);
    finish(await setHackathonStatus({ id: h.id, status }), text);
  };
  const refill = async () => {
    if ((dirty || autofilled) && !confirm("This replaces what is in the form with what the AI read from the poster. Continue?")) return;
    setBusy("refill"); setMsg(null);
    const res = await reapplyHackathonReading(h.id);
    if (res?.error) { setBusy(null); setMsg({ err: true, text: res.error }); return; }
    setBusy(null); setDirty(false); setMsg({ text: "The form was filled in from the poster. Please check every value." }); router.refresh();
  };
  const remove = async () => {
    if (!confirm(`Remove "${h.title}" and its files? This cannot be undone.`)) return;
    setBusy("remove");
    const r = await removeHackathon(h.id);
    if (r.error) return finish(r);
    router.push("/dashboard/hackathons/manage");
  };

  const [statusLabel, statusColor] = STATUS[h.status] || STATUS.draft;
  const dis = Boolean(busy);
  const isImg = poster?.mime?.startsWith("image/");

  return (
    <div className="rv" ref={top}>
      <div className="page-head">
        <div>
          <h1>{f.title || "New hackathon"}</h1>
          <p><span className="pill soft" style={{ "--c": statusColor }}>{statusLabel}</span></p>
        </div>
      </div>

      {msg && <p className={`form-msg${msg.err ? " err" : ""}`} role={msg.err ? "alert" : "status"}>{msg.text}</p>}

      {autofilled && (
        <div className="form-msg">
          The AI filled in what it could read from the poster. <b>Please check every value against it</b>; anything marked <span className="chk"><AlertTriangle size={12} /> Check</span> was unclear or not stated directly.
          {warnings?.length > 0 && <ul className="warn">{warnings.map((w, i) => <li key={i}><AlertTriangle size={14} /> {w.message}</li>)}</ul>}
        </div>
      )}
      {reading?.status === "completed" && h.status === "draft" && (
        <div className={`form-msg${!autofilled || applyError ? " err" : ""}`}>
          {applyError
            ? <>The AI read the poster, but some details could not be saved into this form. {applyError}</>
            : !autofilled
              ? <>The AI has read the poster, but the form was not filled in.</>
              : <>Form looks wrong or empty? You can fill it again from the AI reading.</>}
          {" "}<button type="button" className="btn small" disabled={dis} onClick={refill}>{busy === "refill" ? "Filling…" : "Fill the form from the AI reading"}</button>
        </div>
      )}
      {reading?.status === "failed" &&<div className="form-msg err">The AI could not read the poster: {reading.error} You can fill the details in by hand below.</div>}
      {reading && ["queued", "processing"].includes(reading.status) && <div className="form-msg">The poster is still being read. Come back in a minute and reload.</div>}

      <div className="rv-grid">
        <aside className="rv-pdf">
          <div className="rv-pdf-head">
            <b>{poster?.filename || "Poster"}</b>
            {poster?.url && <a className="btn-s" href={poster.url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open</a>}
          </div>
          {poster?.url ? (isImg ? <img className="rv-img" src={poster.url} alt="The poster" /> : <iframe title="Hackathon document" src={poster.url} />) : <div className="empty"><p>{poster ? "The file could not be loaded." : "No poster uploaded. You can fill the form in by hand."}</p></div>}
        </aside>

        <form className="rv-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <fieldset className="rv-fs" disabled={dis}>
            <section className="rv-card">
              <h2>The hackathon</h2>
              <div className="field"><label htmlFor="hk-title">Name <Badge k="title" /></label><input id="hk-title" type="text" value={f.title} maxLength={140} onChange={(e) => set("title", e.target.value)} /></div>
              <div className="field"><label htmlFor="hk-tag">Tagline <Badge k="tagline" /></label><input id="hk-tag" type="text" value={f.tagline} maxLength={160} onChange={(e) => set("tagline", e.target.value)} /></div>
              <div className="rv-two">
                <div className="field"><label htmlFor="hk-club">Organising club <Badge k="clubId" /></label>
                  <select id="hk-club" value={f.clubId} onChange={(e) => pickClub(e.target.value)}>
                    {(isAdmin || !f.clubId) && <option value="">{isAdmin ? OUT_OF_COLLEGE : "Choose your club"}</option>}
                    {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {!f.clubId && isAdmin && <small>For a hackathon at another college (for example CMRIT): type the organiser's name on the right, and pin the venue below.</small>}</div>
                <div className="field"><label htmlFor="hk-org">{f.clubId ? (isIeee(clubs.find((c) => c.id === f.clubId)?.name) ? "IEEE student branch or organiser" : "Organiser (same as the club)") : "Name of the college or organisation"} <Badge k="organizerName" /></label><input id="hk-org" type="text" value={f.organizerName} maxLength={120} placeholder={!f.clubId ? "e.g. CMR Institute of Technology" : isIeee(clubs.find((c) => c.id === f.clubId)?.name) ? "e.g. IEEE BMSIT Student Branch" : "Filled in from the club"} onChange={(e) => set("organizerName", e.target.value)} /></div>
                <div className="field"><label htmlFor="hk-theme">Theme <Badge k="theme" /></label><input id="hk-theme" type="text" value={f.theme} maxLength={80} onChange={(e) => set("theme", e.target.value)} /></div>
                <div className="field"><label htmlFor="hk-mode">Mode <Badge k="mode" /></label>
                  <select id="hk-mode" value={f.mode} onChange={(e) => set("mode", e.target.value)}>{MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              </div>
              <div className="field"><label htmlFor="hk-desc">About (shown to students)</label><textarea id="hk-desc" rows={4} value={f.description} maxLength={4000} onChange={(e) => set("description", e.target.value)} /></div>
            </section>

            <section className="rv-card">
              <h2>When and where <small>All times are India time</small></h2>
              <div className="rv-two">
                <div className="field"><label htmlFor="hk-open">Registration opens <Badge k="registrationOpensAt" /></label><input id="hk-open" type="datetime-local" value={f.registrationOpensAt} onChange={(e) => set("registrationOpensAt", e.target.value)} /></div>
                <div className="field"><label htmlFor="hk-dl">Registration closes <Badge k="deadline" /></label><input id="hk-dl" type="datetime-local" value={f.deadline} onChange={(e) => set("deadline", e.target.value)} /></div>
                <div className="field"><label htmlFor="hk-start">Hackathon starts <Badge k="startsAt" /></label><input id="hk-start" type="datetime-local" value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} /></div>
                <div className="field"><label htmlFor="hk-end">Hackathon ends <Badge k="endsAt" /></label><input id="hk-end" type="datetime-local" value={f.endsAt} onChange={(e) => set("endsAt", e.target.value)} /></div>
              </div>
              <div className="rv-two">
                <div className="field"><label htmlFor="hk-venue">Venue <Badge k="location" /></label><input id="hk-venue" type="text" value={f.location} maxLength={200} placeholder="Hall, block, or the online platform" onChange={(e) => set("location", e.target.value)} /></div>
                <div className="field"><label htmlFor="hk-map">Map link <Badge k="mapUrl" /></label><input id="hk-map" type="text" value={f.mapUrl} placeholder="https://maps..." onChange={(e) => set("mapUrl", e.target.value)} /></div>
              </div>
              <label className="chips-line"><input type="checkbox" checked={f.offCampus} onChange={(e) => set("offCampus", e.target.checked)} /> <span>This hackathon is <b>outside BMSIT</b> (at another college or place) <Badge k="offCampus" /></span></label>
              {f.offCampus && (
                <>
                  <div className="field"><label htmlFor="hk-addr">Venue address <Badge k="venueAddress" /></label><input id="hk-addr" type="text" value={f.venueAddress} maxLength={200} placeholder="Street, area, city" onChange={(e) => set("venueAddress", e.target.value)} /></div>
                  <HackathonLocationPicker
                    venueName={f.location} venueAddress={f.venueAddress} lat={f.venueLat} lng={f.venueLng}
                    saved={{ venue_lat: h.venue_lat, venue_lng: h.venue_lng, route_km: h.route_km, route_minutes: h.route_minutes, route_source: h.route_source }}
                    flagged={flagged("venueLat")}
                    onPick={(p) => { setF((s) => ({ ...s, venueLat: String(p.lat), venueLng: String(p.lng) })); setTouched((t) => ({ ...t, venueLat: true })); setDirty(true); setMsg(null); }}
                    onClear={() => { setF((s) => ({ ...s, venueLat: "", venueLng: "" })); setDirty(true); setMsg(null); }}
                  />
                </>
              )}
            </section>

            <section className="rv-card">
              <h2>Team, entry and prizes</h2>
              <div className="rv-two">
                <div className="field"><label htmlFor="hk-tmin">Smallest team <Badge k="teamMin" /></label><input id="hk-tmin" type="number" min={1} max={10} value={f.teamMin} onChange={(e) => set("teamMin", e.target.value)} /></div>
                <div className="field"><label htmlFor="hk-tmax">Largest team <Badge k="teamMax" /></label><input id="hk-tmax" type="number" min={1} max={10} value={f.teamMax} onChange={(e) => set("teamMax", e.target.value)} /></div>
              </div>
              <div className="rv-two">
                <div className="field"><span className="lab">Entry fee <Badge k="feeAmount" /></span>
                  <label className="chips-line"><input type="checkbox" checked={f.feeFree} onChange={(e) => set("feeFree", e.target.checked)} /> Free</label>
                  {!f.feeFree && <input type="text" inputMode="numeric" aria-label="Entry fee in rupees" value={f.feeAmount} placeholder="Amount in rupees (leave empty if not stated)" onChange={(e) => set("feeAmount", e.target.value)} />}</div>
                <div className="field"><label htmlFor="hk-feenote">Fee note <Badge k="feeNote" /></label><input id="hk-feenote" type="text" value={f.feeNote} maxLength={200} placeholder="per team, early bird, ..." onChange={(e) => set("feeNote", e.target.value)} /></div>
              </div>
              <div className="field"><label htmlFor="hk-elig">Who can take part <Badge k="eligibility" /></label><input id="hk-elig" type="text" value={f.eligibility} maxLength={300} onChange={(e) => set("eligibility", e.target.value)} /></div>
              <div className="field"><label htmlFor="hk-tracks">Tracks (separate with commas) <Badge k="tracks" /></label><input id="hk-tracks" type="text" value={f.tracks} onChange={(e) => set("tracks", e.target.value)} /></div>
              <div className="rv-two">
                <div className="field"><label htmlFor="hk-pool">Total prize pool, in rupees <Badge k="prizeAmount" /></label><input id="hk-pool" type="text" inputMode="numeric" value={f.prizeAmount} placeholder="e.g. 100000" onChange={(e) => set("prizeAmount", e.target.value)} /></div>
                <div className="field"><label htmlFor="hk-prize">Prize pool as printed <Badge k="prize" /></label><input id="hk-prize" type="text" value={f.prize} maxLength={200} placeholder="e.g. Prizes worth Rs. 1,00,000" onChange={(e) => set("prize", e.target.value)} /></div>
              </div>
              <span className="lab">Prizes</span>
              {prizes.length === 0 && <p className="inline-msg">No individual prizes listed.</p>}
              {prizes.map((p) => (
                <div className="rv-prize" key={p.k}>
                  <input type="text" aria-label="Prize name" placeholder="Winner" value={p.label} maxLength={80} onChange={(e) => { setPrizes((a) => a.map((x) => (x.k === p.k ? { ...x, label: e.target.value } : x))); setDirty(true); }} />
                  <input type="text" inputMode="numeric" aria-label="Prize amount in rupees" placeholder="₹ amount" value={p.amount} onChange={(e) => { setPrizes((a) => a.map((x) => (x.k === p.k ? { ...x, amount: e.target.value } : x))); setDirty(true); }} />
                  <input type="text" aria-label="Prize note" placeholder="Note (optional)" value={p.note} maxLength={160} onChange={(e) => { setPrizes((a) => a.map((x) => (x.k === p.k ? { ...x, note: e.target.value } : x))); setDirty(true); }} />
                  <button type="button" className="icon-btn" aria-label="Remove this prize" onClick={() => { setPrizes((a) => a.filter((x) => x.k !== p.k)); setDirty(true); }}><Trash2 size={16} /></button>
                </div>
              ))}
              <button type="button" className="btn-s" onClick={() => { setPrizes((a) => [...a, { k: nid("p"), label: "", amount: "", note: "" }]); setDirty(true); }}><Plus size={14} /> Add a prize</button>
            </section>

            <section className="rv-card">
              <h2>Programme <small>{rows.length ? `${rows.length} item${rows.length === 1 ? "" : "s"}` : "minute by minute"}</small></h2>
              <p className="inline-msg">Each item needs a start time. Students see them in order, with a live clock showing what is happening now.</p>
              {rows.map((r) => (
                <div className={`rv-sched${r.check ? " chk-row" : ""}`} key={r.k}>
                  <input type="datetime-local" aria-label="Starts" value={r.at} onChange={(e) => { setRows((a) => a.map((x) => (x.k === r.k ? { ...x, at: e.target.value, check: false } : x))); setDirty(true); }} />
                  <input type="datetime-local" aria-label="Ends (optional)" value={r.endAt} onChange={(e) => { setRows((a) => a.map((x) => (x.k === r.k ? { ...x, endAt: e.target.value } : x))); setDirty(true); }} />
                  <input type="text" aria-label="What happens" placeholder="Opening ceremony" value={r.title} maxLength={140} onChange={(e) => { setRows((a) => a.map((x) => (x.k === r.k ? { ...x, title: e.target.value, check: false } : x))); setDirty(true); }} />
                  <input type="text" aria-label="Note (optional)" placeholder="Note (optional)" value={r.note} maxLength={200} onChange={(e) => { setRows((a) => a.map((x) => (x.k === r.k ? { ...x, note: e.target.value } : x))); setDirty(true); }} />
                  <button type="button" className="icon-btn" aria-label="Remove this item" onClick={() => { setRows((a) => a.filter((x) => x.k !== r.k)); setDirty(true); }}><Trash2 size={16} /></button>
                  {r.check && <span className="chk"><AlertTriangle size={12} /> Check the day and time</span>}
                </div>
              ))}
              <button type="button" className="btn-s" onClick={() => { setRows((a) => [...a, { k: nid("s"), at: f.startsAt || "", endAt: "", title: "", note: "", check: false }]); setDirty(true); }}><Plus size={14} /> Add a programme item</button>
            </section>

            <section className="rv-card">
              <h2>Contact and links</h2>
              {qrLinks.length > 0 && <p className="form-msg" role="status">The poster has a QR code. CampusCast read it, so students can open {qrLinks.length === 1 ? "its link" : "these links"} directly: {qrLinks.map((u, i) => <span key={u}>{i ? ", " : ""}<a href={u} target="_blank" rel="noopener noreferrer">{(() => { try { return new URL(u).host; } catch { return u; } })()}</a></span>)}. Open {qrLinks.length === 1 ? "it" : "them"} to make sure {qrLinks.length === 1 ? "it is" : "they are"} the right page.</p>}
              <div className="rv-two">
                <div className="field"><label htmlFor="hk-cn">Contact person <Badge k="contactName" /></label><input id="hk-cn" type="text" value={f.contactName} maxLength={80} onChange={(e) => set("contactName", e.target.value)} /></div>
                <div className="field"><label htmlFor="hk-cp">Contact phone <Badge k="contactPhone" /></label><input id="hk-cp" type="tel" value={f.contactPhone} placeholder="+91 98450 12345" onChange={(e) => set("contactPhone", e.target.value)} /></div>
                <div className="field"><label htmlFor="hk-ce">Contact email <Badge k="contactEmail" /></label><input id="hk-ce" type="email" value={f.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} /></div>
              </div>
              <div className="rv-two">
                <div className="field"><label htmlFor="hk-web">Official website <Badge k="websiteUrl" /></label><input id="hk-web" type="text" value={f.websiteUrl} placeholder="https://..." onChange={(e) => set("websiteUrl", e.target.value)} /><small>Students open this link from the hackathon page, in a new window. They do not have to scan anything.</small></div>
                <div className="field"><label htmlFor="hk-link">Registration link <Badge k="link" /></label><input id="hk-link" type="text" value={f.link} placeholder="https://..." onChange={(e) => set("link", e.target.value)} /></div>
              </div>
            </section>

            <section className="rv-card">
              <h2>More details <small>one per line</small></h2>
              <div className="field"><label htmlFor="hk-perks">Perks and certificates <Badge k="perks" /></label><textarea id="hk-perks" rows={3} value={f.perks} onChange={(e) => set("perks", e.target.value)} /></div>
              <div className="field"><label htmlFor="hk-rules">Rules and requirements <Badge k="rules" /></label><textarea id="hk-rules" rows={4} value={f.rules} onChange={(e) => set("rules", e.target.value)} /></div>
              <div className="field"><label htmlFor="hk-sp">Sponsors and partners <Badge k="sponsors" /></label><textarea id="hk-sp" rows={2} value={f.sponsors} onChange={(e) => set("sponsors", e.target.value)} /></div>
            </section>
          </fieldset>

          <section className="rv-card" aria-label="Before you publish">
            <h2>Before you publish</h2>
            {!check.ok ? (
              <ul className="warn">{check.errors.map((e, i) => <li key={i}><XCircle size={14} /> {e}</li>)}</ul>
            ) : (
              <>
                {issues.blocking.length > 0 && <ul className="warn">{issues.blocking.map((e, i) => <li key={i}><XCircle size={14} /> {e}</li>)}</ul>}
                {issues.hints.length > 0
                  ? <><p className="inline-msg">Students will ask about these. You can still publish:</p><ul className="warn">{issues.hints.map((e, i) => <li key={i}><AlertTriangle size={14} /> {e}</li>)}</ul></>
                  : issues.blocking.length === 0 && <p className="inline-msg">Everything students usually ask about is filled in.</p>}
              </>
            )}
          </section>

          <div className="rv-bar">
            <span className="inline-msg">{dirty ? "You have unsaved changes." : "All changes saved."}</span>
            <button type="button" className="btn-s" disabled={dis || !dirty} onClick={save}>{busy === "save" ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />} {h.status === "published" ? "Save changes" : "Save draft"}</button>
            {h.status !== "published" && <button type="button" className="btn" disabled={dis || !check.ok || issues?.blocking.length > 0} onClick={() => setStatus("published", "Published. Students can see it now.", h.status === "cancelled" ? "Publish this hackathon again?" : "Publish this hackathon now? Students will see it straight away.")}>{busy === "published" ? <LoaderCircle size={16} className="spin" /> : <Megaphone size={16} />} {h.status === "cancelled" ? "Publish again" : "Publish now"}</button>}
            {h.status === "published" && <button type="button" className="btn-s" disabled={dis} onClick={() => setStatus("draft", "It is a draft again. Students no longer see it.", "Take this hackathon offline and make it a draft again?")}><Undo2 size={14} /> Unpublish</button>}
            {h.status === "published" && <button type="button" className="btn-s" disabled={dis} onClick={() => setStatus("cancelled", "Marked as cancelled.", "Mark this hackathon as cancelled? Students will see that it was cancelled.")}><XCircle size={14} /> Cancel hackathon</button>}
            {h.status !== "published" && <button type="button" className="btn-s ghost" disabled={dis} onClick={remove}><Trash2 size={14} /> Delete</button>}
          </div>
        </form>
      </div>
    </div>
  );
}
