"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ExternalLink, LoaderCircle, Plus, Save, Send, Trash2 } from "lucide-react";
import { saveReview } from "../../app/dashboard/admin/exams/actions";
import { instructionText } from "../../lib/exams/constants";

const CATEGORIES = [["ia1", "IA 1"], ["ia2", "IA 2"], ["ia3", "IA 3"], ["final", "Final Examination"], ["special", "Special Examination"]];
const SPECIAL = [["supplementary", "Supplementary"], ["practical", "Practical"], ["laboratory", "Laboratory"], ["revaluation", "Revaluation"], ["other", "Other"]];
const TYPES = [["timetable", "Timetable"], ["notification", "Notification"], ["guidelines", "Guidelines"], ["result", "Result"], ["circular", "Circular"]];
const GROUPS = [["examination", "Examination instructions"], ["hallTicket", "Hall ticket"], ["requiredDocuments", "Required documents"], ["important", "Important notes"], ["other", "Other"]];
const STATUS = {
  draft: ["Draft", "#d9c8a8"], pending_approval: ["Waiting for approval", "#f3b63f"], changes_requested: ["Changes requested", "#e8603c"],
  approved: ["Approved", "#8ec5d6"], rejected: ["Rejected", "#e8603c"], published: ["Published", "#7fb48a"], archived: ["Archived", "#d9c8a8"],
};
const ACTION = { submit: "Submitted for approval", resubmit: "Submitted again", approve: "Approved", reject: "Rejected", request_changes: "Changes requested", publish: "Published", archive: "Archived" };
const when = (iso) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const hhmm = (t) => (t ? String(t).slice(0, 5) : "");

let counter = 0;
const rowFromDb = (e) => ({
  k: `r${++counter}`, id: e.id, department: e.department || "", semester: e.semester ?? "", originalExamName: e.original_exam_name || "",
  subjectName: e.subject_name || "", subjectCode: e.subject_code || "", examDate: e.exam_date || "", startTime: hhmm(e.start_time), endTime: hhmm(e.end_time),
  reportingTime: hhmm(e.reporting_time), session: e.session || "", notes: e.notes || "", sourcePage: e.source_page, confidence: e.confidence === null ? null : Number(e.confidence), needsReview: e.needs_review,
});
const blankRow = (n) => ({ k: `r${++counter}`, id: null, department: n.audience.length === 1 ? n.audience[0] : "", semester: n.semesters.length === 1 ? n.semesters[0] : "", originalExamName: n.originalExamName, subjectName: "", subjectCode: "", examDate: "", startTime: "", endTime: "", reportingTime: "", session: "", notes: "", sourcePage: null, confidence: null, needsReview: false });

export default function ExamReview({ notice, entries, departments, pdf, extraction, history, canEdit }) {
  const router = useRouter();
  const d = notice.details || {};
  const [n, setN] = useState({
    title: notice.title, noticeType: notice.notice_type, category: notice.category || "", specialKind: notice.special_kind || "",
    originalExamName: notice.original_exam_name || "", semesters: notice.semesters || [], academicYear: notice.academic_year || "",
    regulation: notice.regulation || "", notificationDate: notice.notification_date || "", degreeProgramme: notice.degree_programme || "Bachelor's",
    resultLink: notice.result_link || "", audience: notice.audience_depts,
  });
  const [rows, setRows] = useState(() => entries.map(rowFromDb));
  const [dates, setDates] = useState(() => (d.importantDates || []).map((x) => ({ k: `d${++counter}`, label: x.label || "", date: x.date || "", dateText: x.dateText || "", page: x.page ?? null })));
  const [ins, setIns] = useState(() => Object.fromEntries(GROUPS.map(([g]) => [g, (d.instructions?.[g] || []).map(instructionText).filter(Boolean).join("\n")])));
  const [touched, setTouched] = useState({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const top = useRef(null);

  const [statusLabel, statusColor] = STATUS[notice.status] || [notice.status, "#d9c8a8"];
  const meta = extraction?.fieldMeta || {};
  const flagged = (name) => canEdit && !touched[name] && meta[name]?.needsReview;
  const set = (key, value, metaName = key) => { setN((s) => ({ ...s, [key]: value })); setTouched((t) => ({ ...t, [metaName]: true })); setDirty(true); };
  const toggle = (key, value, metaName) => set(key, n[key].includes(value) ? n[key].filter((x) => x !== value) : [...n[key], value], metaName);
  const patchRow = (k, p) => { setRows((rs) => rs.map((r) => (r.k === k ? { ...r, ...p, needsReview: false } : r))); setDirty(true); };
  const patchDate = (k, p) => { setDates((ds) => ds.map((x) => (x.k === k ? { ...x, ...p } : x))); setDirty(true); };
  const lines = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);

  const payload = () => ({
    noticeId: notice.id, submit: false,
    notice: { ...n, audienceDepts: n.audience, semesters: n.semesters, importantDates: dates.map(({ label, date, dateText, page }) => ({ label, date, dateText, page })), instructions: Object.fromEntries(GROUPS.map(([g]) => [g, lines(ins[g])])) },
    rows: rows.map(({ k, ...r }) => r),
  });

  const run = async (submit) => {
    setMsg(null);
    if (submit && !confirm("Send this notice to the central admin for approval? You will not be able to edit it while it waits.")) return;
    setBusy(submit ? "submit" : "save");
    const res = await saveReview({ ...payload(), submit });
    setBusy(null);
    if (res.error) { setMsg({ err: true, text: res.saved ? `Your changes were saved, but it was not submitted: ${res.error}` : res.error }); if (res.saved) setDirty(false); top.current?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    setDirty(false);
    if (res.submitted) { router.push("/dashboard/admin/exams"); router.refresh(); return; }
    setMsg({ text: "Draft saved." });
    router.refresh();
  };

  const needsCheck = useMemo(() => rows.filter((r) => r.needsReview).length, [rows]);
  const unclear = !n.category;
  const Badge = ({ name }) => flagged(name)
    ? <span className="chk" title={[meta[name].source !== "explicit" ? `Not stated directly in the PDF (${meta[name].source})` : "Low confidence", meta[name].pages?.length ? `page ${meta[name].pages.join(", ")}` : "", meta[name].evidence ? `“${meta[name].evidence}”` : ""].filter(Boolean).join(" · ")}><AlertTriangle size={12} /> Check</span>
    : null;

  return (
    <div className="rv" ref={top}>
      <div className="page-head">
        <div>
          <h1>{n.title || "Exam notice"}</h1>
          <p><span className="pill soft" style={{ "--c": statusColor }}>{statusLabel}</span> {n.audience.join(", ")}</p>
        </div>
      </div>

      {notice.status === "changes_requested" && notice.review_note && (
        <div className="banner"><h2>Changes requested</h2><p style={{ margin: 0 }}>{notice.review_note}</p></div>
      )}
      {notice.status === "rejected" && notice.review_note && <div className="banner"><h2>Rejected</h2><p style={{ margin: 0 }}>{notice.review_note}</p></div>}
      {!canEdit && ["pending_approval", "approved", "published", "archived"].includes(notice.status) && (
        <p className="form-msg">This notice is {statusLabel.toLowerCase()} and can no longer be edited here.</p>
      )}
      {msg && <p className={`form-msg${msg.err ? " err" : ""}`} role={msg.err ? "alert" : "status"}>{msg.text}</p>}

      {extraction && (
        <div className={`form-msg${extraction.status === "failed" ? " err" : ""}`}>
          {extraction.status === "completed" ? <>The AI filled in what it could read. <b>Please check every value against the PDF</b>; anything marked <span className="chk"><AlertTriangle size={12} /> Check</span> was unclear or not stated directly.{extraction.ocr && " This looks like a scanned document, so read it extra carefully."}</>
            : extraction.status === "failed" ? <>The AI could not read this document: {extraction.error}. You can fill the notice in by hand, or go back and retry.</>
            : <>The document is still being read. Come back in a minute.</>}
          {extraction.warnings.length > 0 && <ul className="warn">{extraction.warnings.map((w, i) => <li key={i}><AlertTriangle size={14} /> {w.message}</li>)}</ul>}
        </div>
      )}

      <div className="rv-grid">
        <aside className="rv-pdf">
          <div className="rv-pdf-head">
            <b>{pdf?.filename || "Original file"}</b>
            {pdf?.url && <a className="btn-s" href={pdf.url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open</a>}
          </div>
          {pdf?.url ? (pdf.mime?.startsWith("image/") ? <img className="rv-img" src={pdf.url} alt="Original notice (photo)" /> : <iframe title="Original examination PDF" src={pdf.url} />) : <div className="empty"><p>{pdf?.removed ? "The original file was removed some days after the exams ended, to save storage. The details above are kept." : "The original file could not be loaded."}</p></div>}
        </aside>

        <form className="rv-form" onSubmit={(e) => { e.preventDefault(); run(false); }}>
          <fieldset disabled={!canEdit || Boolean(busy)} className="rv-fs">
            <section className="rv-card">
              <h2>Notice details</h2>
              <div className="field"><label htmlFor="rv-title">Title <Badge name="title" /></label><input id="rv-title" type="text" value={n.title} maxLength={200} onChange={(e) => set("title", e.target.value)} /></div>
              <div className="rv-two">
                <div className="field"><label htmlFor="rv-type">Kind of notice <Badge name="noticeType" /></label>
                  <select id="rv-type" value={n.noticeType} onChange={(e) => set("noticeType", e.target.value, "noticeType")}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                <div className="field"><label htmlFor="rv-cat">Examination category <Badge name="category" /></label>
                  <select id="rv-cat" value={n.category} onChange={(e) => { set("category", e.target.value, "category"); if (e.target.value !== "special") setN((s) => ({ ...s, specialKind: "" })); }}>
                    <option value="">Requires admin review</option>{CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  {unclear && <small>Choose a category before you can submit. Only pick Final Examination if the PDF clearly says so.</small>}</div>
              </div>
              {n.category === "special" && (
                <div className="field"><label htmlFor="rv-sk">Kind of special examination</label>
                  <select id="rv-sk" value={n.specialKind} onChange={(e) => set("specialKind", e.target.value)}><option value="">Not specified</option>{SPECIAL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              )}
              <div className="field"><label htmlFor="rv-orig">Examination name as written in the PDF <Badge name="originalExamName" /></label>
                <input id="rv-orig" type="text" value={n.originalExamName} maxLength={120} placeholder="e.g. CIE 2, SEE, Makeup Exam" onChange={(e) => set("originalExamName", e.target.value, "originalExamName")} />
                <small>Kept exactly as the college wrote it, even when the category above is a standard one.</small></div>
              <div className="field"><span className="lab">Departments <Badge name="departments" /></span>
                <div className="chips">{departments.map((dep) => (
                  <button type="button" key={dep.name} className={`chip${n.audience.includes(dep.name) ? " on" : ""}`} aria-pressed={n.audience.includes(dep.name)} onClick={() => toggle("audience", dep.name, "departments")}>{dep.name}</button>))}</div>
                <small>Students see this notice only if their department and semester match.</small></div>
              <div className="field"><span className="lab">Semesters <Badge name="semesters" /></span>
                <div className="chips">{[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <button type="button" key={s} className={`chip${n.semesters.includes(s) ? " on" : ""}`} aria-pressed={n.semesters.includes(s)} onClick={() => toggle("semesters", s, "semesters")}>Sem {s}</button>))}</div>
                <small>{n.semesters.length ? "Only students in the selected semesters will see it." : "No semester selected: every semester of the chosen departments will see it."}</small></div>
              <div className="rv-two">
                <div className="field"><label htmlFor="rv-ay">Academic year <Badge name="academicYear" /></label><input id="rv-ay" type="text" value={n.academicYear} placeholder="2026-27" maxLength={7} onChange={(e) => set("academicYear", e.target.value, "academicYear")} /></div>
                <div className="field"><label htmlFor="rv-reg">Regulation / scheme <Badge name="regulation" /></label><input id="rv-reg" type="text" value={n.regulation} maxLength={80} onChange={(e) => set("regulation", e.target.value, "regulation")} /></div>
                <div className="field"><label htmlFor="rv-nd">Notice date <Badge name="notificationDate" /></label><input id="rv-nd" type="date" value={n.notificationDate} onChange={(e) => set("notificationDate", e.target.value, "notificationDate")} /></div>
                <div className="field"><label htmlFor="rv-deg">Degree programme <Badge name="degreeProgramme" /></label><input id="rv-deg" type="text" value={n.degreeProgramme} maxLength={80} onChange={(e) => set("degreeProgramme", e.target.value, "degreeProgramme")} /></div>
              </div>
              {n.noticeType === "result" && <div className="field"><label htmlFor="rv-link">Link to the results</label><input id="rv-link" type="text" value={n.resultLink} placeholder="https://" onChange={(e) => set("resultLink", e.target.value)} /></div>}
            </section>

            <section className="rv-card">
              <h2>Timetable {rows.length > 0 && <small>{rows.length} row{rows.length === 1 ? "" : "s"}{needsCheck ? ` · ${needsCheck} to check` : ""}</small>}</h2>
              {rows.length === 0 && <p className="inline-msg">{n.noticeType === "timetable" ? "No rows yet. A timetable needs at least one row with a subject and a date before it can be submitted." : "A timetable is optional for this kind of notice."}</p>}
              {rows.length > 0 && (
                <div className="table-wrap"><table className="tbl rv-tt">
                  <thead><tr><th>Department</th><th>Sem</th><th>Subject</th><th>Code</th><th>Date</th><th>Start</th><th>End</th><th>Session</th><th>Notes</th><th /></tr></thead>
                  <tbody>{rows.map((r) => (
                    <tr key={r.k} className={r.needsReview ? "chk-row" : ""}>
                      <td><select aria-label="Department" value={r.department} onChange={(e) => patchRow(r.k, { department: e.target.value })}><option value="">—</option>{n.audience.map((x) => <option key={x} value={x}>{x}</option>)}</select></td>
                      <td><select aria-label="Semester" value={r.semester} onChange={(e) => patchRow(r.k, { semester: e.target.value === "" ? "" : Number(e.target.value) })}><option value="">—</option>{[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={s}>{s}</option>)}</select></td>
                      <td><input type="text" aria-label="Subject" value={r.subjectName} maxLength={200} onChange={(e) => patchRow(r.k, { subjectName: e.target.value })} />{r.needsReview && <span className="chk" title={r.sourcePage ? `Page ${r.sourcePage}` : "Unclear in the PDF"}><AlertTriangle size={12} /> Check{r.sourcePage ? ` p.${r.sourcePage}` : ""}</span>}</td>
                      <td><input type="text" aria-label="Subject code" value={r.subjectCode} maxLength={40} onChange={(e) => patchRow(r.k, { subjectCode: e.target.value })} /></td>
                      <td><input type="date" aria-label="Date" value={r.examDate} onChange={(e) => patchRow(r.k, { examDate: e.target.value })} /></td>
                      <td><input type="time" aria-label="Start time" value={r.startTime} onChange={(e) => patchRow(r.k, { startTime: e.target.value })} /></td>
                      <td><input type="time" aria-label="End time" value={r.endTime} onChange={(e) => patchRow(r.k, { endTime: e.target.value })} /></td>
                      <td><input type="text" aria-label="Session" value={r.session} maxLength={40} onChange={(e) => patchRow(r.k, { session: e.target.value })} /></td>
                      <td><input type="text" aria-label="Notes" value={r.notes} maxLength={500} onChange={(e) => patchRow(r.k, { notes: e.target.value })} /></td>
                      <td><button type="button" className="icon-btn" aria-label="Remove this row" onClick={() => { setRows((rs) => rs.filter((x) => x.k !== r.k)); setDirty(true); }}><Trash2 size={16} /></button></td>
                    </tr>))}</tbody>
                </table></div>
              )}
              <button type="button" className="btn-s" onClick={() => { setRows((rs) => [...rs, blankRow(n)]); setDirty(true); }}><Plus size={14} /> Add a row</button>
            </section>

            <section className="rv-card">
              <h2>Important dates</h2>
              {dates.length === 0 && <p className="inline-msg">None listed.</p>}
              {dates.map((x) => (
                <div className="rv-date" key={x.k}>
                  <input type="text" aria-label="What happens" placeholder="e.g. Last date to pay fees" value={x.label} maxLength={160} onChange={(e) => patchDate(x.k, { label: e.target.value })} />
                  <input type="date" aria-label="Date" value={x.date} onChange={(e) => patchDate(x.k, { date: e.target.value })} />
                  <button type="button" className="icon-btn" aria-label="Remove this date" onClick={() => { setDates((ds) => ds.filter((y) => y.k !== x.k)); setDirty(true); }}><Trash2 size={16} /></button>
                </div>))}
              <button type="button" className="btn-s" onClick={() => { setDates((ds) => [...ds, { k: `d${++counter}`, label: "", date: "", dateText: "", page: null }]); setDirty(true); }}><Plus size={14} /> Add a date</button>
            </section>

            <section className="rv-card">
              <h2>Guidelines</h2>
              <p className="inline-msg">One point per line, as written in the PDF.</p>
              {GROUPS.map(([g, label]) => (
                <div className="field" key={g}><label htmlFor={`rv-${g}`}>{label}</label>
                  <textarea id={`rv-${g}`} rows={Math.min(8, Math.max(2, ins[g].split("\n").length))} value={ins[g]} onChange={(e) => { setIns((s) => ({ ...s, [g]: e.target.value })); setDirty(true); }} /></div>))}
            </section>
          </fieldset>

          {canEdit && (
            <div className="rv-bar">
              <span className="inline-msg">{dirty ? "You have unsaved changes." : "All changes saved."}</span>
              <button type="submit" className="btn-s" disabled={Boolean(busy) || !dirty}>{busy === "save" ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />} Save draft</button>
              <button type="button" className="btn" disabled={Boolean(busy) || unclear} title={unclear ? "Choose a category first" : ""} onClick={() => run(true)}>{busy === "submit" ? <LoaderCircle size={16} className="spin" /> : <Send size={16} />} {notice.status === "changes_requested" ? "Submit again" : "Submit for approval"}</button>
            </div>
          )}
        </form>
      </div>

      <h2 className="sub-h">Submission history</h2>
      {history.length === 0 ? <p className="inline-msg">Nothing yet. It appears here once the notice is submitted.</p> : (
        <ol className="rv-hist">{history.map((h) => (
          <li key={h.id}><b>{ACTION[h.action] || h.action}</b> · {h.by} · <time dateTime={h.at}>{when(h.at)}</time>{h.reason && <p>“{h.reason}”</p>}</li>))}</ol>
      )}
    </div>
  );
}
