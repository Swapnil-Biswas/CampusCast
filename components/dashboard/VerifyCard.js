"use client";
import { useState, useTransition } from "react";
import { Check, Eye, X } from "lucide-react";
import { idCardUrl, reviewVerification } from "../../app/dashboard/admin/actions";
import { shortBranch } from "../../lib/dash/meta";
import RelTime from "./RelTime";

// One student waiting for ID review. Photos open through short-lived signed links.
export default function VerifyCard({ p }) {
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState("");
  const [pending, start] = useTransition();

  const view = (path) => start(async () => {
    const r = await idCardUrl(path);
    if (r.url) window.open(r.url, "_blank", "noopener"); else setMsg(r.error);
  });
  const decide = (approve) => start(async () => {
    const r = await reviewVerification(p.id, approve, note);
    if (r?.error) setMsg(r.error); else setDone(approve ? "Approved" : "Sent back");
  });

  return (
    <article className="notice" style={{ "--u": "#8ec5d6" }}>
      <div className="notice-top"><span className="pill soft" style={{ "--c": "#8ec5d6" }}>{p.status === "pending" ? "Waiting" : "Sent back"}</span>
        {p.submitted_at && <RelTime className="when" date={p.submitted_at} />}</div>
      <h3 className="notice-title">{p.full_name || "(no name)"}</h3>
      <p className="audience">{p.email} · USN {p.usn || "-"} · {shortBranch(p.branch)} · Year {p.year} · Batch {p.batch || "-"}</p>
      {p.review_note && <p>Earlier note: {p.review_note}</p>}
      {done ? <p className="acked"><Check size={16} /> {done}</p> : (
        <>
          <div className="notice-actions">
            {p.id_card_front && <button className="btn-s" onClick={() => view(p.id_card_front)} disabled={pending}><Eye size={16} /> ID front</button>}
            {p.id_card_back && <button className="btn-s" onClick={() => view(p.id_card_back)} disabled={pending}><Eye size={16} /> ID back</button>}
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor={"n" + p.id}>Note for the student <small>(required when sending back)</small></label>
            <input id={"n" + p.id} type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. The photo is blurry, please retake it" />
          </div>
          <div className="notice-actions">
            <button className="btn-s clay" onClick={() => decide(true)} disabled={pending}><Check size={16} /> Approve</button>
            <button className="btn-s" onClick={() => decide(false)} disabled={pending}><X size={16} /> Send back</button>
            {msg && <span className="inline-msg" role="alert">{msg}</span>}
          </div>
        </>
      )}
    </article>
  );
}
