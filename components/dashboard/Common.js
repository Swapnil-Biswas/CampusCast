"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Flag, Send } from "lucide-react";
import { blockUser, fileReport, requestConnect, requestListing } from "../../app/dashboard/community-actions";

// Runs a server action, shows its error inline, refreshes the page on success.
export function useAct() {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const act = (fn, after) => start(async () => { const r = await fn(); if (r?.error) setMsg(r.error); else { setMsg(""); after?.(r); router.refresh(); } });
  return { msg, setMsg, pending, act };
}

// Report (and optionally block the owner) from any card.
export function ReportBlock({ kind, refId, ownerId }) {
  const { msg, setMsg, pending, act } = useAct();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sent, setSent] = useState("");
  if (sent) return <span className="inline-msg" role="status">{sent}</span>;
  return (
    <span className="menu-wrap">
      <button className="btn-s ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}><Flag size={16} /> Report</button>
      {open && (
        <div className="menu" style={{ padding: 10, minWidth: 260, gap: 8 }}>
          <label className="field"><span className="lab">What is wrong?</span><input type="text" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Spam, scam, rude, not appropriate…" /></label>
          <button className="btn-s clay" disabled={pending || reason.trim().length < 3} onClick={() => act(() => fileReport(kind, refId, reason), () => { setSent("Reported. Admins will review it."); setOpen(false); })}><Send size={14} /> Send report</button>
          {ownerId && <button className="btn-s" disabled={pending} onClick={() => { if (confirm("Block this person? You will no longer see each other's posts or be able to contact each other.")) act(() => blockUser(ownerId), () => { setSent("Blocked."); setOpen(false); }); }}><Ban size={14} /> Block this person</button>}
          {msg && <span className="inline-msg" role="alert">{msg}</span>}
        </div>
      )}
    </span>
  );
}

// One-line message box that sends a request ("Say hi", "Ask the seller", ...).
const SENDERS = { connect: requestConnect, listing: requestListing };
export function RequestBox({ kind, id, placeholder, button = "Send request", done = "Request sent." }) {
  const onSend = (text) => SENDERS[kind](id, text);
  const { msg, pending, act } = useAct();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  if (sent) return <span className="acked">{done}</span>;
  if (!open) return <button className="btn-s clay" onClick={() => setOpen(true)}>{button}</button>;
  return (
    <span className="notice-actions" style={{ margin: 0, flex: 1 }}>
      <input type="text" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label={placeholder} style={{ flex: 1, minWidth: 200, padding: "7px 10px", border: "1.5px solid var(--line)", borderRadius: 10, background: "var(--card)", font: "inherit" }} />
      <button className="btn-s clay" disabled={pending || !text.trim()} onClick={() => act(() => onSend(text), () => setSent(true))}><Send size={14} /> Send</button>
      {msg && <span className="inline-msg" role="alert">{msg}</span>}
    </span>
  );
}

export const Person = ({ p }) => p ? <span>{p.full_name || "A student"}{p.branch ? ` · ${p.year ? "Year " + p.year : ""}` : ""}</span> : <span>A student</span>;
