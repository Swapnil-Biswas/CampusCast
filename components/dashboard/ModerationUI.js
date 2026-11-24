"use client";
import { useState } from "react";
import { Check, Download, Trash2, X } from "lucide-react";
import { resolveReport, reviewNote } from "../../app/dashboard/community-actions";
import { signedUrl } from "../../app/dashboard/actions";
import { useAct } from "./Common";

const KIND = { connect_post: "Connect post", note: "Note", listing: "Listing", message: "Chat message", user: "Student" };

export function ReportRow({ r }) {
  const { msg, pending, act } = useAct();
  const [note, setNote] = useState("");
  return (
    <article className="notice" style={{ "--u": "#e8603c" }}>
      <div className="notice-top"><span className="pill soft" style={{ "--c": "#e8603c" }}>{KIND[r.kind]}</span><span className="when">Reported by {r.reporter_name || "a student"}</span></div>
      <h3 className="notice-title">{r.preview || (r.kind === "user" ? `Student: ${r.owner_name || "unknown"}` : "(item no longer exists)")}</h3>
      <p className="audience">Posted by {r.owner_name || "unknown"}</p>
      <p><b>Reason:</b> {r.reason}</p>
      <div className="field"><label htmlFor={"rn" + r.id}>Note <small>(optional, kept in the audit log)</small></label><input id={"rn" + r.id} type="text" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></div>
      <div className="notice-actions">
        {r.kind !== "user" && <button className="btn-s clay" disabled={pending} onClick={() => act(() => resolveReport(r.id, true, note))}><Trash2 size={16} /> Remove it</button>}
        <button className="btn-s" disabled={pending} onClick={() => act(() => resolveReport(r.id, false, note))}><Check size={16} /> {r.kind === "user" ? "Mark reviewed" : "Dismiss report"}</button>
        {msg && <span className="inline-msg" role="alert">{msg}</span>}
      </div>
    </article>
  );
}

export function PendingNote({ n, uploader }) {
  const { msg, setMsg, pending, act } = useAct();
  const [why, setWhy] = useState("");
  const open = async () => { const r = await signedUrl("notes", n.file.path); if (r.url) window.open(r.url, "_blank", "noopener"); else setMsg(r.error); };
  return (
    <article className="notice" style={{ "--u": "#8ec5d6" }}>
      <div className="notice-top"><span className="pill soft" style={{ "--c": "#8ec5d6" }}>{n.kind === "paper" ? "Previous paper" : "Notes"}</span><span className="pill soft" style={{ "--c": "#d9c8a8" }}>Sem {n.semester}</span></div>
      <h3 className="notice-title">{n.title}</h3>
      <p className="audience">{n.subject} · from {uploader || "a student"}</p>
      {n.description && <p>{n.description}</p>}
      <div className="field"><label htmlFor={"nr" + n.id}>Reason <small>(required to reject)</small></label><input id={"nr" + n.id} type="text" value={why} maxLength={300} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. Not related to the subject" /></div>
      <div className="notice-actions">
        <button className="btn-s" onClick={open}><Download size={16} /> Open file</button>
        <button className="btn-s clay" disabled={pending} onClick={() => act(() => reviewNote(n.id, true))}><Check size={16} /> Approve</button>
        <button className="btn-s" disabled={pending} onClick={() => act(() => reviewNote(n.id, false, why))}><X size={16} /> Reject</button>
        {msg && <span className="inline-msg" role="alert">{msg}</span>}
      </div>
    </article>
  );
}
