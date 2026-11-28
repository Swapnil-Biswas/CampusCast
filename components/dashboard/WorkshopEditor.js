"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ExternalLink, LoaderCircle, Megaphone, Save, Trash2, Undo2, XCircle } from "lucide-react";
import { reapplyWorkshopReading, removeWorkshop, saveWorkshop, setWorkshopStatus } from "../../app/dashboard/workshops/manage/actions";
import { publishIssues, validateWorkshop } from "../../lib/workshops/validate";
import { toLocalInput } from "../../lib/hackathons/validate";
import { organiserAfterClubChange } from "../../lib/hackathons/organiser";
import { BRANCHES, YEARS } from "../../lib/college";
import { shortBranch } from "../../lib/dash/meta";

const MODES = [["offline", "On campus / in person"], ["online", "Online"], ["hybrid", "Hybrid"]];
const STATUS = { draft: ["Draft: students cannot see it", "#d9c8a8"], published: ["Published: students can see it", "#7fb48a"], cancelled: ["Cancelled: students see it as cancelled", "#e8603c"] };
// the editor's field -> the name the AI reading used for it, so "Check" badges show on the right fields
const META = {
  title: "name", tagline: "tagline", description: "description", topics: "topics", clubId: "clubName", organizerName: "organizer",
  speakerName: "speakerName", speakerAbout: "speakerAbout", mode: "mode", venue: "venue", mapUrl: "mapLink", startsAt: "startsAt", endsAt: "endsAt",
  deadline: "registrationDeadline", seats: "seats", feeAmount: "feeAmount", feeNote: "feeNote", eligibility: "eligibility", prerequisites: "prerequisites",
  perks: "perks", contactName: "contactName", contactPhone: "contactPhone", contactEmail: "contactEmail", websiteUrl: "websiteUrl", link: "registrationUrl",
};

export default function WorkshopEditor({ w, meta, warnings, autofilled, poster, clubs, isAdmin, reading, qrLinks = [], applyError = "" }) {
  const router = useRouter();
  const top = useRef(null);
  const [f, setF] = useState(() => ({
    title: w.title || "", tagline: w.tagline || "", description: w.description || "", topics: (w.topics || []).join("\n"),
    clubId: w.club_id || "", organizerName: w.organizer_name || "", speakerName: w.speaker_name || "", speakerAbout: w.speaker_about || "",
    mode: w.mode || "offline", venue: w.venue || "", mapUrl: w.map_url || "",
    startsAt: toLocalInput(w.starts_at), endsAt: toLocalInput(w.ends_at), deadline: toLocalInput(w.reg_closes_at), seats: w.seats ?? 50,
    feeFree: w.fee_amount != null && Number(w.fee_amount) === 0, feeAmount: Number(w.fee_amount) > 0 ? String(Number(w.fee_amount)) : "", feeNote: w.fee_note || "",
    eligibility: w.eligibility || "", prerequisites: w.prerequisites || "", perks: (w.details?.perks || []).join("\n"),
    audienceDepts: w.audience_depts || [], audienceYears: w.audience_years || [],
    contactName: w.contact_name || "", contactPhone: w.contact_phone || "", contactEmail: w.contact_email || "", websiteUrl: w.website_url || "", link: w.link || "",
  }));
  const [touched, setTouched] = useState({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  // a club admin keeps their club in the list even if only the saved row names it
  const options = w.club && !clubs.some((c) => c.id === w.club.id) ? [...clubs, w.club] : clubs;

  const change = (patch) => { setF((s) => ({ ...s, ...patch })); setTouched((t) => ({ ...t, ...Object.fromEntries(Object.keys(patch).map((k) => [k, true])) })); setDirty(true); setMsg(null); };
  const set = (key, value) => change({ [key]: value });
  const toggle = (key, x) => set(key, f[key].includes(x) ? f[key].filter((y) => y !== x) : [...f[key], x]);
  // Choosing a club fills the organiser with the club's name; a name that was typed is kept.
  const pickClub = (id) => change({ clubId: id, organizerName: organiserAfterClubChange(f.organizerName, options.find((c) => c.id === f.clubId) || null, options.find((c) => c.id === id) || null) });
  const flagged = (key) => autofilled && !touched[key] && META[key] && meta?.[META[key]]?.needsReview;

  // Plain functions (not components), so inputs keep their focus while typing.
  const badge = (key) => flagged(key)
    ? <span className="chk" title={[meta[META[key]].source !== "explicit" ? `Not stated directly on the poster (${meta[META[key]].source})` : "Please confirm", meta[META[key]].evidence ? `“${meta[META[key]].evidence}”` : ""].filter(Boolean).join(" · ")}><AlertTriangle size={12} /> Check</span>
    : null;
  const input = (key, label, props = {}) => (
    <div className="field"><label htmlFor={`ws-${key}`}>{label} {badge(key)}</label><input id={`ws-${key}`} type="text" value={f[key]} onChange={(e) => set(key, e.target.value)} {...props} /></div>
  );
  const area = (key, label, rows, max) => (
    <div className="field"><label htmlFor={`ws-${key}`}>{label} {badge(key)}</label><textarea id={`ws-${key}`} rows={rows} maxLength={max} value={f[key]} onChange={(e) => set(key, e.target.value)} /></div>
  );

  const check = useMemo(() => validateWorkshop(f, { clubs: options, isAdmin }), [f, clubs, isAdmin]);   // eslint-disable-line react-hooks/exhaustive-deps
  const issues = check.ok ? publishIssues(check.patch) : null;

  const finish = (res, okText) => {
    setBusy(null);
    if (res?.error) { setMsg({ err: true, text: res.errors?.length > 1 ? res.errors.join(" ") : res.error }); top.current?.scrollIntoView({ behavior: "smooth", block: "start" }); return false; }
    setDirty(false); setMsg({ text: okText }); router.refresh(); return true;
  };
  const save = async () => { setBusy("save"); setMsg(null); return finish(await saveWorkshop({ id: w.id, data: f }), w.status === "published" ? "Changes saved. Students see them now." : "Saved."); };
  const setStatus = async (status, text, confirmText) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(status); setMsg(null);
    const saved = dirty || status === "published" ? await saveWorkshop({ id: w.id, data: f }) : { ok: true };
    if (saved.error) return finish(saved);
    finish(await setWorkshopStatus({ id: w.id, status }), text);
  };
  const refill = async () => {
    if ((dirty || autofilled) && !confirm("This replaces what is in the form with what the AI read from the poster. Continue?")) return;
    setBusy("refill"); setMsg(null);
    const res = await reapplyWorkshopReading(w.id);
    if (res?.error) { setBusy(null); setMsg({ err: true, text: res.error }); return; }
    setBusy(null); setDirty(false); setMsg({ text: "The form was filled in from the poster. Please check every value." }); router.refresh();
  };
  const remove = async () => {
    if (!confirm(`Remove "${w.title}", its files and any registrations? This cannot be undone.`)) return;
    setBusy("remove");
    const r = await removeWorkshop(w.id);
    if (r.error) return finish(r);
    router.push("/dashboard/workshops/manage");
  };

  const [statusLabel, statusColor] = STATUS[w.status] || STATUS.draft;
  const dis = Boolean(busy);

  return (
    <div className="rv" ref={top}>
      <div className="page-head">
        <div><h1>{f.title || "New workshop"}</h1><p><span className="pill soft" style={{ "--c": statusColor }}>{statusLabel}</span></p></div>
      </div>

      {msg && <p className={`form-msg${msg.err ? " err" : ""}`} role={msg.err ? "alert" : "status"}>{msg.text}</p>}
      {autofilled && (
        <div className="form-msg">
          The AI filled in what it could read from the poster. <b>Please check every value against it</b>; anything marked <span className="chk"><AlertTriangle size={12} /> Check</span> was unclear or not stated.
          {warnings?.length > 0 && <ul className="warn">{warnings.map((x, i) => <li key={i}><AlertTriangle size={14} /> {x.message}</li>)}</ul>}
        </div>
      )}
      {reading?.status === "completed" && w.status === "draft" && (
        <div className={`form-msg${!autofilled || applyError ? " err" : ""}`}>
          {applyError ? <>The AI read the poster, but some details could not be saved into this form. {applyError}</>
            : !autofilled ? <>The AI has read the poster, but the form was not filled in.</> : <>Form looks wrong or empty? You can fill it again from the AI reading.</>}
          {" "}<button type="button" className="btn-s" disabled={dis} onClick={refill}>{busy === "refill" ? "Filling…" : "Fill the form from the AI reading"}</button>
        </div>
      )}
      {reading?.status === "failed" && <div className="form-msg err">The AI could not read the poster: {reading.error} You can fill the details in by hand below.</div>}
      {reading && ["queued", "processing"].includes(reading.status) && <div className="form-msg">The poster is still being read. Come back in a minute and reload.</div>}

      <div className="rv-grid">
        <aside className="rv-pdf">
          <div className="rv-pdf-head">
            <b>{poster?.filename || "Poster"}</b>
            {poster?.url && <a className="btn-s" href={poster.url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open</a>}
          </div>
          {poster?.url ? (poster.mime?.startsWith("image/") ? <img className="rv-img" src={poster.url} alt="The poster" /> : <iframe title="Workshop document" src={poster.url} />)
            : <div className="empty"><p>{poster ? "The file could not be loaded." : "No poster uploaded. You can fill the form in by hand."}</p></div>}
        </aside>

        <form className="rv-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <fieldset className="rv-fs" disabled={dis}>
            <section className="rv-card">
              <h2>The workshop</h2>
              {input("title", "Name", { maxLength: 140 })}
              {input("tagline", "Tagline", { maxLength: 160 })}
              {area("description", "What will students learn?", 4, 4000)}
              {area("topics", "Topics covered (one per line)", 4)}
              <div className="rv-two">
                <div className="field"><label htmlFor="ws-club">Organising club {badge("clubId")}</label>
                  <select id="ws-club" value={f.clubId} onChange={(e) => pickClub(e.target.value)}>
                    {(isAdmin || !f.clubId) && <option value="">{isAdmin ? "No club (department or college)" : "Choose your club"}</option>}
                    {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select></div>
                {input("organizerName", "Organiser, as students should see it", { maxLength: 120, placeholder: "e.g. Department of CSE" })}
                {input("speakerName", "Speaker or trainer", { maxLength: 120 })}
                {input("speakerAbout", "About the speaker", { maxLength: 300, placeholder: "Designation, organisation" })}
              </div>
            </section>

            <section className="rv-card">
              <h2>When and where <small>All times are India time</small></h2>
              <div className="rv-two">
                {input("startsAt", "Starts", { type: "datetime-local" })}
                {input("endsAt", "Ends", { type: "datetime-local" })}
                <div className="field"><label htmlFor="ws-mode">Mode {badge("mode")}</label>
                  <select id="ws-mode" value={f.mode} onChange={(e) => set("mode", e.target.value)}>{MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                {input("venue", "Venue", { maxLength: 200, placeholder: "Hall, lab, or the online platform" })}
                {input("mapUrl", "Map link", { placeholder: "https://maps..." })}
              </div>
            </section>

            <section className="rv-card">
              <h2>Seats and registration</h2>
              <div className="rv-two">
                {input("seats", "Seats", { type: "number", min: 1, max: 5000 })}
                {input("deadline", "Last time to register", { type: "datetime-local" })}
                <div className="field"><span className="lab">Fee {badge("feeAmount")}</span>
                  <label className="chips-line"><input type="checkbox" checked={f.feeFree} onChange={(e) => set("feeFree", e.target.checked)} /> Free</label>
                  {!f.feeFree && <input type="text" inputMode="numeric" aria-label="Fee in rupees" value={f.feeAmount} placeholder="Rupees (empty if not stated)" onChange={(e) => set("feeAmount", e.target.value)} />}</div>
                {input("feeNote", "Fee note", { maxLength: 200 })}
              </div>
              <p className="inline-msg">Students register here in one tap. When seats run out they join a waitlist and move up automatically.</p>
              {input("eligibility", "Who can attend (as written)", { maxLength: 300 })}
              {area("prerequisites", "What to know or bring", 2, 500)}
              {area("perks", "Certificates and perks (one per line)", 2)}
              <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend className="lab">Departments that can see it <small>(none = everyone)</small></legend>
                <div className="checks">{BRANCHES.map((b) => <label key={b}><input type="checkbox" checked={f.audienceDepts.includes(b)} onChange={() => toggle("audienceDepts", b)} /> {shortBranch(b)}</label>)}</div></fieldset>
              <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend className="lab">Years <small>(none = all)</small></legend>
                <div className="checks">{YEARS.map((y) => <label key={y}><input type="checkbox" checked={f.audienceYears.includes(y)} onChange={() => toggle("audienceYears", y)} /> Year {y}</label>)}</div></fieldset>
            </section>

            <section className="rv-card">
              <h2>Contact and links</h2>
              {qrLinks.length > 0 && <p className="form-msg" role="status">The poster has a QR code. Open each link to check it is the right page: {qrLinks.map((u, i) => <span key={u}>{i ? ", " : ""}<a href={u} target="_blank" rel="noopener noreferrer">{u}</a></span>)}</p>}
              <div className="rv-two">
                {input("contactName", "Contact person", { maxLength: 80 })}
                {input("contactPhone", "Contact phone", { type: "tel", placeholder: "+91 98450 12345" })}
                {input("contactEmail", "Contact email", { type: "email" })}
                {input("websiteUrl", "Website", { placeholder: "https://..." })}
                {input("link", "Organisers' registration form (if any)", { placeholder: "https://..." })}
              </div>
            </section>
          </fieldset>

          <section className="rv-card" aria-label="Before you publish">
            <h2>Before you publish</h2>
            {!check.ok ? <ul className="warn">{check.errors.map((e, i) => <li key={i}><XCircle size={14} /> {e}</li>)}</ul> : (
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
            <button type="button" className="btn-s" disabled={dis || !dirty} onClick={save}>{busy === "save" ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />} {w.status === "published" ? "Save changes" : "Save"}</button>
            {w.status !== "published" && <button type="button" className="btn" disabled={dis || !check.ok || issues?.blocking.length > 0} onClick={() => setStatus("published", "Published. Students can see it now.", "Publish this workshop now? Students will see it straight away.")}>{busy === "published" ? <LoaderCircle size={16} className="spin" /> : <Megaphone size={16} />} {w.status === "cancelled" ? "Publish again" : "Publish now"}</button>}
            {w.status === "published" && <button type="button" className="btn-s" disabled={dis} onClick={() => setStatus("draft", "It is a draft again. Students no longer see it.", "Take this workshop offline? Students will not see it until you publish it again.")}><Undo2 size={14} /> Unpublish</button>}
            {w.status === "published" && <button type="button" className="btn-s" disabled={dis} onClick={() => setStatus("cancelled", "Marked as cancelled.", "Mark this workshop as cancelled? Students will see that it was cancelled, and reminders stop.")}><XCircle size={14} /> Cancel workshop</button>}
            {w.status !== "published" && <button type="button" className="btn-s ghost" disabled={dis} onClick={remove}><Trash2 size={14} /> Delete</button>}
          </div>
        </form>
      </div>
    </div>
  );
}
