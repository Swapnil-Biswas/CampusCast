"use client";
import { useState } from "react";
import { Check, Mail, Plus, X } from "lucide-react";
import { connectContact, createPost, respondConnect, setPostStatus } from "../../app/dashboard/community-actions";
import { useAct } from "./Common";

export function PostForm({ hackathons, presetHackathon }) {
  const { msg, pending, act } = useAct();
  const [open, setOpen] = useState(!!presetHackathon);
  const [v, setV] = useState({ kind: "need", title: "", body: "", skills: "", hackathon_id: presetHackathon || "" });
  const set = (k, x) => setV((p) => ({ ...p, [k]: x }));
  if (!open) return <button className="btn" onClick={() => setOpen(true)}><Plus size={16} /> New post</button>;
  return (
    <form className="form" style={{ padding: 16, background: "var(--soft)", border: "1.5px solid var(--ink)", borderRadius: 14, maxWidth: "none", marginBottom: 16 }}
      onSubmit={(e) => { e.preventDefault(); act(() => createPost(v), () => { setOpen(false); setV({ kind: "need", title: "", body: "", skills: "", hackathon_id: "" }); }); }}>
      <div className="field"><label htmlFor="pk">I want to</label>
        <select id="pk" value={v.kind} onChange={(e) => set("kind", e.target.value)}><option value="need">Find teammates for my project</option><option value="team">Join a team</option></select></div>
      <div className="field"><label htmlFor="pt">Title</label><input id="pt" type="text" required minLength={3} maxLength={140} value={v.title} onChange={(e) => set("title", e.target.value)} placeholder={v.kind === "need" ? "Need a frontend dev for a campus app" : "Backend dev looking for a hackathon team"} /></div>
      <div className="field"><label htmlFor="pb">Details</label><textarea id="pb" required maxLength={2000} value={v.body} onChange={(e) => set("body", e.target.value)} style={{ minHeight: 90 }} /></div>
      <div className="field"><label htmlFor="ps">Skills <small>(comma separated)</small></label><input id="ps" type="text" value={v.skills} onChange={(e) => set("skills", e.target.value)} placeholder="react, python, ui design" /></div>
      {hackathons.length > 0 && <div className="field"><label htmlFor="ph">For a hackathon <small>(optional)</small></label>
        <select id="ph" value={v.hackathon_id} onChange={(e) => set("hackathon_id", e.target.value)}><option value="">None</option>{hackathons.map((h) => <option key={h.id} value={h.id}>{h.title}</option>)}</select></div>}
      {msg && <p className="form-msg err" role="alert">{msg}</p>}
      <div className="notice-actions"><button className="btn" disabled={pending}>Post</button><button type="button" className="btn-s" onClick={() => setOpen(false)}>Cancel</button></div>
    </form>
  );
}

export function OwnPostControls({ id, status }) {
  const { msg, pending, act } = useAct();
  return (
    <span className="notice-actions" style={{ margin: 0 }}>
      {status === "open" ? <button className="btn-s" disabled={pending} onClick={() => act(() => setPostStatus(id, "closed"))}>Close post</button> : <button className="btn-s" disabled={pending} onClick={() => act(() => setPostStatus(id, "open"))}>Reopen</button>}
      <button className="btn-s ghost" disabled={pending} onClick={() => { if (confirm("Delete this post?")) act(() => setPostStatus(id, "delete")); }}>Delete</button>
      {msg && <span className="inline-msg" role="alert">{msg}</span>}
    </span>
  );
}

// A request on one of my posts, or one I sent. Contact details appear only once the author accepted.
export function RequestRow({ r, title, incoming, person }) {
  const { msg, pending, act } = useAct();
  const [contact, setContact] = useState(null);
  const reveal = () => act(() => connectContact(r.id), (res) => setContact(res.contact));
  return (
    <article className="notice" style={{ "--u": r.status === "accepted" ? "#7fb48a" : r.status === "declined" ? "#bbb" : "#f3b63f" }}>
      <div className="notice-top"><span className="pill soft" style={{ "--c": r.status === "accepted" ? "#7fb48a" : "#f3b63f" }}>{r.status}</span><span className="when">{incoming ? "Wants to join" : "You asked to join"}</span></div>
      <h3 className="notice-title">{title}</h3>
      <p className="audience">{incoming ? "From" : "To"} {person?.full_name || "a student"}{person?.branch ? ` · Year ${person.year}` : ""}</p>
      <p>“{r.message}”</p>
      <div className="notice-actions">
        {incoming && r.status === "pending" && <>
          <button className="btn-s clay" disabled={pending} onClick={() => act(() => respondConnect(r.id, true))}><Check size={16} /> Accept</button>
          <button className="btn-s" disabled={pending} onClick={() => act(() => respondConnect(r.id, false))}><X size={16} /> Decline</button></>}
        {r.status === "accepted" && !contact && <button className="btn-s clay" disabled={pending} onClick={reveal}><Mail size={16} /> Show contact details</button>}
        {contact && <span className="acked"><Mail size={16} /> {contact.full_name}: <a href={`mailto:${contact.email}`}>{contact.email}</a></span>}
        {msg && <span className="inline-msg" role="alert">{msg}</span>}
      </div>
    </article>
  );
}
