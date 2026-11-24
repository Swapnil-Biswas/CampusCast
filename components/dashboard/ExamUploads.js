"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, RotateCw, Trash2 } from "lucide-react";
import { browserClient } from "../../lib/supabase/client";
import { removeUpload, retryExtraction } from "../../app/dashboard/admin/exams/actions";

const NOTICE_STATUS = {
  draft: ["Draft", "#d9c8a8"], pending_approval: ["Waiting for approval", "#f3b63f"], changes_requested: ["Changes requested", "#e8603c"],
  approved: ["Approved", "#8ec5d6"], rejected: ["Rejected", "#e8603c"], published: ["Published", "#7fb48a"], archived: ["Archived", "#d9c8a8"],
};
const READING = new Set(["queued", "processing"]);
const when = (iso) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// rows: [{ docId, noticeId, filename, pages, created, title, category, noticeStatus, depts, x: { id, status, error, retryable } | null }]
export default function ExamUploads({ rows: initial }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [note, setNote] = useState({});
  const [busy, setBusy] = useState(null);
  const alive = useRef(true);
  useEffect(() => { setRows(initial); }, [initial]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // While something is being read, check on it every few seconds.
  const waiting = rows.filter((r) => r.x && READING.has(r.x.status)).map((r) => r.x.id);
  useEffect(() => {
    if (!waiting.length) return;
    const t = setInterval(async () => {
      const { data } = await browserClient().from("exam_extractions").select("id, status, error, field_meta").in("id", waiting);
      if (!alive.current || !data) return;
      const byId = new Map(data.map((d) => [d.id, d]));
      let finished = false;
      setRows((rs) => rs.map((r) => {
        const d = r.x && byId.get(r.x.id);
        if (!d || d.status === r.x.status) return r;
        if (!READING.has(d.status)) finished = true;
        return { ...r, x: { ...r.x, status: d.status, error: d.error, retryable: d.field_meta?._failure?.retryable !== false } };
      }));
      if (finished) router.refresh();
    }, 4000);
    return () => clearInterval(t);
  }, [waiting.join(","), router]);

  const retry = async (r) => {
    setBusy(r.docId); setNote((n) => ({ ...n, [r.docId]: "" }));
    const res = await retryExtraction(r.x.id);
    if (res.error) { setNote((n) => ({ ...n, [r.docId]: res.error })); setBusy(null); return; }
    const start = await fetch("/api/exams/extract", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ extractionId: res.extractionId }) });
    if (!start.ok && start.status !== 503) setNote((n) => ({ ...n, [r.docId]: "Could not start reading the document." }));
    setBusy(null);
    router.refresh();
  };

  const remove = async (r) => {
    if (!confirm(`Remove "${r.filename}" and its draft? This cannot be undone.`)) return;
    setBusy(r.docId);
    const res = await removeUpload(r.noticeId);
    if (res.error) setNote((n) => ({ ...n, [r.docId]: res.error }));
    setBusy(null);
    router.refresh();
  };

  if (!rows.length) return <div className="empty"><h2>No uploads yet</h2><p>Upload an official PDF above and it will appear here.</p></div>;

  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead><tr><th>Document</th><th>For</th><th>Category</th><th>Reading</th><th>Notice</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => {
            const [label, color] = NOTICE_STATUS[r.noticeStatus] || [r.noticeStatus, "#d9c8a8"];
            const x = r.x;
            return (
              <tr key={r.docId}>
                <td><b>{r.filename}</b><small>{r.pages ? `${r.pages} page${r.pages === 1 ? "" : "s"} · ` : ""}{when(r.created)}</small></td>
                <td>{r.depts.join(", ")}</td>
                <td>{r.category ? <b>{r.category}</b> : <span className="pill soft" style={{ "--c": "#f3b63f" }}>Requires admin review</span>}</td>
                <td>
                  {!x ? "—" : READING.has(x.status)
                    ? <span className="inline-msg"><LoaderCircle size={14} className="spin" /> {x.status === "queued" ? "Waiting" : "Reading…"}</span>
                    : x.status === "completed" ? <span className="pill soft" style={{ "--c": "#7fb48a" }}>Ready for review</span>
                    : <span className="pill soft" style={{ "--c": "#e8603c" }} title={x.error || ""}>Failed</span>}
                  {x?.status === "failed" && <small>{x.error}</small>}
                  {note[r.docId] && <small role="alert">{note[r.docId]}</small>}
                </td>
                <td><span className="pill soft" style={{ "--c": color }}>{label}</span></td>
                <td className="row-actions">
                  {(!x || !READING.has(x.status)) && <Link className="btn-s" href={`/dashboard/admin/exams/${r.noticeId}`}>{["draft", "changes_requested"].includes(r.noticeStatus) ? "Review" : "View"}</Link>}
                  {x?.status === "failed" && x.retryable && <button type="button" className="btn-s" disabled={busy === r.docId} onClick={() => retry(r)}><RotateCw size={14} /> Retry</button>}
                  {r.noticeStatus === "draft" && <button type="button" className="icon-btn" disabled={busy === r.docId} onClick={() => remove(r)} aria-label={`Remove ${r.filename}`}><Trash2 size={16} /></button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
