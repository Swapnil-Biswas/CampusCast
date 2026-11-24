"use client";
import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Paperclip, Send, Users, X } from "lucide-react";
import { BRANCHES, YEARS } from "../../lib/college";
import { CATEGORIES, URGENCY, shortBranch } from "../../lib/dash/meta";
import { browserClient } from "../../lib/supabase/client";
import { publishNotice } from "../../app/dashboard/admin/compose/actions";

const MAX_FILES = 5, MAX_MB = 10;

export default function ComposeForm({ clubs, isAdmin, userId }) {
  // datetime-local has no timezone; convert to a real instant in the browser so the server (UTC) does not shift it.
  const withLocalTimes = async (prev, fd) => {
    for (const k of ["event_at", "publish_at", "expires_at"]) {
      const v = fd.get(k);
      if (v) fd.set(k, new Date(String(v)).toISOString());
    }
    return publishNotice(prev, fd);
  };
  const [state, action, pending] = useActionState(withLocalTimes, null);
  const [depts, setDepts] = useState([]);
  const [years, setYears] = useState([]);
  const [club, setClub] = useState(isAdmin ? "" : clubs[0]?.id || "");
  const [urgency, setUrgency] = useState(2);
  const [files, setFiles] = useState([]);
  const [upErr, setUpErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [reach, setReach] = useState(null);

  // Live "reaches N students" preview as the audience changes.
  useEffect(() => {
    let off = false;
    const t = setTimeout(async () => {
      const { data, error } = await browserClient().rpc("audience_size", { p_depts: depts.length ? depts : null, p_years: years.length ? years : null, p_club: club || null });
      if (!off) setReach(error ? null : data);
    }, 250);
    return () => { off = true; clearTimeout(t); };
  }, [depts, years, club]);

  const toggle = (list, set, v) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const upload = async (e) => {
    const picked = [...e.target.files];
    e.target.value = "";
    setUpErr("");
    if (files.length + picked.length > MAX_FILES) return setUpErr(`Attach up to ${MAX_FILES} files.`);
    setBusy(true);
    const sb = browserClient();
    const done = [];
    for (const f of picked) {
      if (f.size > MAX_MB * 1048576) { setUpErr(`${f.name} is over ${MAX_MB} MB.`); continue; }
      const path = `${userId}/${Date.now()}-${f.name.replace(/[^\w.-]+/g, "_")}`;
      const { error } = await sb.storage.from("announcement-files").upload(path, f, { contentType: f.type });
      if (error) setUpErr(`${f.name}: ${error.message}`); else done.push({ name: f.name, path, size: f.size, type: f.type });
    }
    setFiles((p) => [...p, ...done]);
    setBusy(false);
  };
  const removeFile = async (a) => {
    setFiles((p) => p.filter((x) => x.path !== a.path));
    await browserClient().storage.from("announcement-files").remove([a.path]);
  };

  if (state?.ok) {
    return (
      <div className="form-msg" role="status">
        <p><b>{state.scheduled ? "Scheduled." : "Published."}</b> {state.scheduled ? "It will go out at the time you picked." : "Students in the audience have been notified."}</p>
        <p><Link className="link-btn" href="/dashboard">View the feed</Link> · <Link className="link-btn" href="/dashboard/admin/compose" onClick={() => location.reload()}>Write another</Link></p>
      </div>
    );
  }

  return (
    <form action={action} className="form">
      <div className="field"><label htmlFor="title">Title</label><input id="title" name="title" type="text" required minLength={3} maxLength={140} placeholder="e.g. Mid-term exam schedule released" /></div>
      <div className="field"><label htmlFor="body">Message</label><textarea id="body" name="body" required maxLength={4000} placeholder="What do students need to know or do?" /></div>

      <div className="field">
        <label htmlFor="category">Category</label>
        <select id="category" name="category" defaultValue="general">{Object.entries(CATEGORIES).map(([id, c]) => <option key={id} value={id}>{c.label}</option>)}</select>
      </div>

      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="lab">Urgency</legend>
        <div className="urg-pick">
          {URGENCY.map((u) => {
            const off = !isAdmin && u.id < 2;
            return (
              <label key={u.id} className={off ? "off" : ""} style={{ "--c": u.color }}>
                <input type="radio" name="urgency" value={u.id} checked={urgency === u.id} disabled={off} onChange={() => setUrgency(u.id)} />
                <b><i /> {u.label}</b><small>{off ? "Admins only" : u.hint}</small>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="lab">Departments <small>(none selected = everyone)</small></legend>
        <div className="checks">{BRANCHES.map((b) => (
          <label key={b}><input type="checkbox" name="depts" value={b} checked={depts.includes(b)} onChange={() => toggle(depts, setDepts, b)} /> {shortBranch(b)}</label>
        ))}</div>
      </fieldset>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="lab">Years <small>(none selected = all years)</small></legend>
        <div className="checks">{YEARS.map((y) => (
          <label key={y}><input type="checkbox" name="years" value={y} checked={years.includes(y)} onChange={() => toggle(years, setYears, y)} /> Year {y}</label>
        ))}</div>
      </fieldset>
      <div className="field">
        <label htmlFor="club">Club {isAdmin ? "(optional: only that club’s followers and members)" : ""}</label>
        <select id="club" name="club" value={club} onChange={(e) => setClub(e.target.value)} required={!isAdmin}>
          {isAdmin && <option value="">No club</option>}
          {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="reach" aria-live="polite"><Users size={18} style={{ verticalAlign: "-3px" }} /> Reaches <b>{reach ?? "…"}</b> student{reach === 1 ? "" : "s"}</div>

      <div className="field"><label htmlFor="event_at">Event or deadline <small>(optional, lets students set reminders)</small></label><input id="event_at" name="event_at" type="datetime-local" /></div>
      <div className="field"><label htmlFor="publish_at">Publish at <small>(leave empty to publish now)</small></label><input id="publish_at" name="publish_at" type="datetime-local" /></div>
      <div className="field"><label htmlFor="expires_at">Hide after <small>(optional)</small></label><input id="expires_at" name="expires_at" type="datetime-local" /></div>
      {isAdmin && <label className="checks"><span style={{ display: "inline-flex", gap: 6 }}><input type="checkbox" name="pinned" /> Pin to the top of the feed</span></label>}

      <div className="field">
        <span className="lab">Attachments <small>(PDF, images, Word or Excel; up to {MAX_FILES} files of {MAX_MB} MB)</small></span>
        <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.pptx" onChange={upload} disabled={busy} aria-label="Attach files" />
        {files.length > 0 && <ul className="files">{files.map((a) => (
          <li key={a.path}><span className="file"><Paperclip size={15} /> {a.name} <button type="button" className="icon-btn" style={{ width: 24, height: 24 }} aria-label={`Remove ${a.name}`} onClick={() => removeFile(a)}><X size={14} /></button></span></li>
        ))}</ul>}
        {upErr && <p className="form-msg err" role="alert">{upErr}</p>}
      </div>
      <input type="hidden" name="attachments" value={JSON.stringify(files)} />

      {state?.error && <p className="form-msg err" role="alert">{state.error}</p>}
      <div><button className="btn" disabled={pending || busy}><Send size={18} /> {pending ? "Publishing…" : "Publish"}</button></div>
    </form>
  );
}
