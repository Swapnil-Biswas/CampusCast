"use client";
import { useState } from "react";
import { ArrowBigUp, Download, Trash2, Upload } from "lucide-react";
import { BRANCHES } from "../../lib/college";
import { shortBranch } from "../../lib/dash/meta";
import { browserClient } from "../../lib/supabase/client";
import { createNote, deleteNote, toggleVote } from "../../app/dashboard/community-actions";
import { signedUrl } from "../../app/dashboard/actions";
import { ReportBlock, useAct } from "./Common";

const sha256 = async (file) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map((b) => b.toString(16).padStart(2, "0")).join("");

export function NoteUpload({ userId }) {
  const { msg, setMsg, pending, act } = useAct();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const [v, setV] = useState({ kind: "notes", title: "", subject: "", semester: "3", branch: "", description: "" });
  const [ok, setOk] = useState("");
  const set = (k, x) => setV((p) => ({ ...p, [k]: x }));

  const submit = async (e) => {
    e.preventDefault(); setMsg(""); setOk("");
    if (!file) return setMsg("Choose a file to upload.");
    if (file.size > 15 * 1048576) return setMsg("Files can be up to 15 MB.");
    setBusy(true);
    try {
      const hash = await sha256(file);
      const path = `${userId}/${hash.slice(0, 12)}-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const sb = browserClient();
      const up = await sb.storage.from("notes").upload(path, file, { contentType: file.type, upsert: false });
      if (up.error && !/already exists|Duplicate/i.test(up.error.message)) { setMsg(up.error.message); return; }
      const r = await createNote({ ...v, file: { name: file.name, path, size: file.size, type: file.type }, sha256: hash });
      if (r?.error) { if (r.duplicate) await sb.storage.from("notes").remove([path]); setMsg(r.error); return; }
      setOk("Uploaded. It will appear once an admin approves it."); setFile(null); setOpen(false);
      setV({ kind: "notes", title: "", subject: "", semester: "3", branch: "", description: "" });
      act(async () => ({ ok: true }));
    } finally { setBusy(false); }
  };

  if (!open) return <span>{ok && <span className="acked" role="status">{ok} </span>}<button className="btn" onClick={() => setOpen(true)}><Upload size={16} /> Upload</button></span>;
  return (
    <form className="form" onSubmit={submit} style={{ padding: 16, background: "var(--soft)", border: "1.5px solid var(--ink)", borderRadius: 14, maxWidth: "none", marginBottom: 16 }}>
      <div className="field"><label htmlFor="nk">Type</label><select id="nk" value={v.kind} onChange={(e) => set("kind", e.target.value)}><option value="notes">Class notes</option><option value="paper">Previous year paper</option></select></div>
      <div className="field"><label htmlFor="nt">Title</label><input id="nt" type="text" required minLength={3} maxLength={140} value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="Unit 2: Trees and graphs" /></div>
      <div className="field"><label htmlFor="ns">Subject</label><input id="ns" type="text" required minLength={2} maxLength={80} value={v.subject} onChange={(e) => set("subject", e.target.value)} placeholder="Data Structures" /></div>
      <div className="field"><label htmlFor="nsem">Semester</label><select id="nsem" value={v.semester} onChange={(e) => set("semester", e.target.value)}>{[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={s}>Semester {s}</option>)}</select></div>
      <div className="field"><label htmlFor="nb">Branch <small>(optional)</small></label><select id="nb" value={v.branch} onChange={(e) => set("branch", e.target.value)}><option value="">All branches</option>{BRANCHES.map((b) => <option key={b} value={b}>{shortBranch(b)}</option>)}</select></div>
      <div className="field"><label htmlFor="nd">Description <small>(optional)</small></label><textarea id="nd" maxLength={1000} value={v.description} onChange={(e) => set("description", e.target.value)} style={{ minHeight: 70 }} /></div>
      <div className="field"><label htmlFor="nf">File <small>(PDF, image, Word or PowerPoint, up to 15 MB)</small></label><input id="nf" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.pptx" onChange={(e) => setFile(e.target.files[0] || null)} /></div>
      {msg && <p className="form-msg err" role="alert">{msg}</p>}
      <div className="notice-actions"><button className="btn" disabled={busy || pending}>{busy ? "Uploading…" : "Submit for review"}</button><button type="button" className="btn-s" onClick={() => setOpen(false)}>Cancel</button></div>
    </form>
  );
}

export function NoteActions({ id, file, votes, voted, mine, ownerId, status }) {
  const { msg, setMsg, pending, act } = useAct();
  const [count, setCount] = useState(votes);
  const [on, setOn] = useState(voted);
  const vote = () => { const n = !on; setOn(n); setCount(count + (n ? 1 : -1)); act(async () => { const r = await toggleVote(id, n); if (r?.error) { setOn(!n); setCount(count); } return r; }); };
  const open = async () => { const r = await signedUrl("notes", file.path); if (r.url) window.open(r.url, "_blank", "noopener"); else setMsg(r.error); };
  return (
    <span className="notice-actions" style={{ margin: 0 }}>
      {status === "approved" && <button className="btn-s" aria-pressed={on} disabled={pending || mine} onClick={vote} title={mine ? "You cannot upvote your own upload" : "Upvote"} style={on ? { background: "var(--ink)", color: "var(--cream)" } : null}><ArrowBigUp size={18} /> {count}</button>}
      <button className="btn-s clay" onClick={open}><Download size={16} /> Open {file.name}</button>
      {mine ? <button className="btn-s ghost" disabled={pending} onClick={() => { if (confirm("Delete this upload?")) act(() => deleteNote(id)); }}><Trash2 size={16} /> Delete</button> : <ReportBlock kind="note" refId={id} ownerId={ownerId} />}
      {msg && <span className="inline-msg" role="alert">{msg}</span>}
    </span>
  );
}
