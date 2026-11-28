"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowBigUp, Download, Eye, Trash2 } from "lucide-react";
import { toggleVote } from "../../app/dashboard/community-actions";
import { deleteUpload } from "../../app/dashboard/notes/actions";
import { ReportBlock, useAct } from "./Common";

// A dropdown that opens the matching page as soon as something is picked.
export function FilterSelect({ label, value, options }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select className="pp-select" aria-label={label} value={value} aria-busy={pending}
      onChange={(e) => { const to = options.find((o) => o.value === e.target.value)?.href; if (to) start(() => router.push(to)); }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function NoteActions({ id, file, votes, voted, mine, ownerId, status }) {
  const { msg, pending, act } = useAct();
  const [count, setCount] = useState(votes);
  const [on, setOn] = useState(voted);
  const vote = () => { const n = !on; setOn(n); setCount(count + (n ? 1 : -1)); act(async () => { const r = await toggleVote(id, n); if (r?.error) { setOn(!n); setCount(count); } return r; }); };
  const url = `/api/papers/file/${id}`;
  const viewable = /\.(pdf|png|jpe?g|webp)$/i.test(file?.path || "");
  return (
    <span className="notice-actions" style={{ margin: 0 }}>
      {viewable && <a className="btn-s clay" href={url} target="_blank" rel="noopener noreferrer"><Eye size={16} /> View</a>}
      <a className={viewable ? "btn-s" : "btn-s clay"} href={`${url}?download=1`}><Download size={16} /> Download</a>
      {status === "approved" && <button className="btn-s" aria-pressed={on} disabled={pending || mine} onClick={vote} title={mine ? "You cannot upvote your own upload" : "Helpful"} style={on ? { background: "var(--ink)", color: "var(--cream)" } : null}><ArrowBigUp size={18} /> {count}</button>}
      {mine ? <button className="btn-s ghost" disabled={pending} onClick={() => { if (confirm("Delete this upload?")) act(() => deleteUpload(id)); }}><Trash2 size={16} /> Delete</button> : <ReportBlock kind="note" refId={id} ownerId={ownerId} />}
      {msg && <span className="inline-msg" role="alert">{msg}</span>}
    </span>
  );
}
