"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Check, LoaderCircle, MessageSquareWarning, Megaphone, X } from "lucide-react";
import { decideNotice } from "../../app/dashboard/admin/exams/actions";

// What a central admin can do depends on where the notice is in the workflow. The database enforces the same rules.
export default function ExamDecision({ noticeId, status, category, audience, ownSubmission = false }) {
  const router = useRouter();
  const [ask, setAsk] = useState(null);       // "reject" | "request_changes" while a reason is being written
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const go = async (action, why) => {
    setMsg(null); setBusy(action);
    const res = await decideNotice({ noticeId, action, reason: why });
    setBusy(null);
    if (res.error) { setMsg(res.error); return; }
    setAsk(null); setReason("");
    router.refresh();
  };
  const confirmGo = (action, text) => { if (confirm(text)) go(action); };

  if (!["pending_approval", "approved", "published", "rejected"].includes(status)) return null;
  const off = Boolean(busy);
  const Spin = ({ a, icon }) => (busy === a ? <LoaderCircle size={14} className="spin" /> : icon);

  return (
    <section className="rv-card rv-decide" aria-label="Approval decision">
      <h2>Decision</h2>
      {status === "pending_approval" && (
        <>
          <p className="inline-msg">Check the details and the timetable against the PDF. {!category && <b>This notice has no category yet and cannot be approved.</b>}</p>
          {ownSubmission && <p className="form-msg err" role="status">You submitted this notice, so someone else (another head of department, a cluster head or a central admin) has to approve it. You can still send it back or reject it.</p>}
          {!ask ? (
            <div className="dz-actions">
              <button type="button" className="btn" disabled={off || !category || ownSubmission} onClick={() => go("approve")}><Spin a="approve" icon={<Check size={16} />} /> Approve</button>
              <button type="button" className="btn-s" disabled={off} onClick={() => setAsk("request_changes")}><MessageSquareWarning size={14} /> Request changes</button>
              <button type="button" className="btn-s" disabled={off} onClick={() => setAsk("reject")}><X size={14} /> Reject</button>
            </div>
          ) : (
            <form className="field" onSubmit={(e) => { e.preventDefault(); go(ask, reason); }}>
              <label htmlFor="rv-reason">{ask === "reject" ? "Why is it rejected?" : "What needs to change?"}</label>
              <textarea id="rv-reason" rows={3} value={reason} maxLength={1000} autoFocus required minLength={3} onChange={(e) => setReason(e.target.value)} />
              <small>The department admin sees this exactly as written.</small>
              <div className="dz-actions">
                <button type="submit" className="btn" disabled={off || reason.trim().length < 3}><Spin a={ask} icon={<Check size={16} />} /> {ask === "reject" ? "Reject notice" : "Send back for changes"}</button>
                <button type="button" className="btn-s ghost" disabled={off} onClick={() => { setAsk(null); setReason(""); }}>Cancel</button>
              </div>
            </form>
          )}
        </>
      )}
      {status === "approved" && (
        <>
          <p className="inline-msg">Approved. Students in {audience.join(", ")} are told about it only when you publish.</p>
          <div className="dz-actions">
            <button type="button" className="btn" disabled={off || ownSubmission} title={ownSubmission ? "Someone else must publish it" : ""} onClick={() => confirmGo("publish", "Publish this notice now? Matching students will be notified.")}><Spin a="publish" icon={<Megaphone size={16} />} /> Publish to students</button>
            <button type="button" className="btn-s" disabled={off} onClick={() => confirmGo("archive", "Archive this notice? It will not be published.")}><Archive size={14} /> Archive</button>
          </div>
        </>
      )}
      {(status === "published" || status === "rejected") && (
        <div className="dz-actions">
          <button type="button" className="btn-s" disabled={off} onClick={() => confirmGo("archive", status === "published" ? "Archive this notice? Students will no longer see it." : "Archive this rejected notice?")}><Spin a="archive" icon={<Archive size={14} />} /> Archive</button>
        </div>
      )}
      {msg && <p className="form-msg err" role="alert">{msg}</p>}
    </section>
  );
}
