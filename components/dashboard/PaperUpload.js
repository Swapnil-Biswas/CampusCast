"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, CircleCheck, CloudUpload, FileText, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { browserClient } from "../../lib/supabase/client";
import { submitUpload } from "../../app/dashboard/notes/actions";
import { EXAMS, FIRST_YEAR, MAX_PHOTOS, MAX_UPLOAD_BYTES, OFFICE_MIME, SEMESTERS, cleanCourseCode, cleanCourseName } from "../../lib/papers/constants";
import { imagesToPdf } from "../../lib/papers/image-pdf";
import { shortBranch } from "../../lib/dash/meta";
import { fileKind, fmtSize, uploadToStorage } from "./uploadHelpers";

const isPhoto = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name);
const officeExt = (f) => /\.(docx|pptx)$/i.exec(f.name)?.[1]?.toLowerCase() || null;

// Redraws a photo as a JPEG of a sensible size. Redrawing also drops the hidden data a phone stores in a photo
// (such as where it was taken).
async function toJpeg(file, longSide, quality) {
  let bitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error(`"${file.name}" could not be opened as a photo. Use JPG, PNG or WebP.`); }
  const scale = Math.min(1, longSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", quality));
  if (!blob) throw new Error("This browser could not prepare the photo.");
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
}

async function photosToPdf(photos) {
  for (const [longSide, quality] of [[2200, 0.82], [1800, 0.75], [1400, 0.7]]) {
    const pages = [];
    for (const p of photos) pages.push(await toJpeg(p, longSide, quality));
    const pdf = imagesToPdf(pages);
    if (pdf.length <= MAX_UPLOAD_BYTES) return new File([pdf], "photos.pdf", { type: "application/pdf" });
  }
  throw new Error("These photos are too large together. Upload fewer pages at a time.");
}

export default function PaperUpload({ userId, departments, known, start, aiReady, instantReady }) {
  const [photos, setPhotos] = useState([]);
  const [phase, setPhase] = useState("pick");   // pick -> preparing -> uploading -> reading -> details -> done
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [upload, setUpload] = useState(null);   // { path, name, size, ext }
  const [read, setRead] = useState(null);       // what the AI answered
  const [readNote, setReadNote] = useState("");
  const [v, setV] = useState({ ...start, courseName: "", examYear: String(new Date().getFullYear()), title: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [duplicate, setDuplicate] = useState(null);
  const [over, setOver] = useState(false);
  const stored = useRef(null);                  // a file in storage that no upload points to yet
  const waiting = useRef(null);                 // the file whose AI answer is still wanted
  const set = (k, x) => setV((p) => ({ ...p, [k]: x }));

  const discard = () => { if (stored.current) { browserClient().storage.from("notes").remove([stored.current]); stored.current = null; } };
  useEffect(() => discard, []);   // leaving the page removes a file that was never submitted

  const reset = () => { discard(); setPhotos([]); setUpload(null); setRead(null); setReadNote(""); setError(""); setDuplicate(null); setResult(null); setPhase("pick"); setV({ ...start, courseName: "", examYear: String(new Date().getFullYear()), title: "", description: "" }); };

  const pick = (list) => {
    const files = [...(list || [])];
    if (!files.length) return;
    setError("");
    if (files.every(isPhoto)) {
      setPhotos((p) => [...p, ...files].slice(0, MAX_PHOTOS));
      return;
    }
    if (files.length > 1 || photos.length) return setError("Choose one PDF, Word or PowerPoint file, or only photos.");
    send(files[0]);
  };
  const move = (i, by) => setPhotos((p) => { const n = [...p]; [n[i], n[i + by]] = [n[i + by], n[i]]; return n; });

  async function send(chosen) {
    setError(""); setProgress(0);
    try {
      let file = chosen, name = chosen?.name, ext = chosen && officeExt(chosen);
      if (!chosen) {
        setPhase("preparing");
        file = await photosToPdf(photos);
        name = "photos.pdf"; ext = "pdf";
      } else if (ext) {
        file = new File([chosen], name, { type: OFFICE_MIME[ext] });
      } else if ((await fileKind(chosen)) === "pdf") {
        ext = "pdf";
        file = new File([chosen], name, { type: "application/pdf" });
      } else throw new Error("Upload a PDF, a Word (.docx) or PowerPoint (.pptx) file, or photos.");
      if (file.size > MAX_UPLOAD_BYTES) throw new Error(`Files can be up to ${fmtSize(MAX_UPLOAD_BYTES)}.`);

      setPhase("uploading");
      const { data: { session } } = await browserClient().auth.getSession();
      if (!session) throw new Error("Your session has expired. Please sign in again.");
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      await uploadToStorage(file, path, session.access_token, setProgress, "notes");
      stored.current = path;
      setUpload({ path, name, size: file.size, ext });

      if (ext === "pdf" && aiReady) {
        waiting.current = path;
        setPhase("reading");
        await readIt(path, name);
        if (waiting.current !== path) return;   // skipped: leave the form as it is
      } else setReadNote(ext === "pdf" ? "AI reading is not switched on, so please fill in the details." : "Word and PowerPoint files are not read by AI yet, so please fill in the details.");
      setPhase("details");
    } catch (e) {
      setError(e.message || "Something went wrong."); setPhase("pick");
    }
  }

  async function readIt(path, filename) {
    try {
      const res = await fetch("/api/papers/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, filename }) });
      const out = await res.json().catch(() => ({}));
      if (waiting.current !== path) return;
      if (!res.ok) { setReadNote(out.error || "The file could not be read, so please fill in the details."); return; }
      setRead(out);
      const f = out.fields;
      setV((p) => ({
        ...p,
        kind: out.documentType === "notes" ? "notes" : out.documentType === "question_paper" ? "paper" : p.kind,
        courseCode: f.courseCode || p.courseCode,
        courseName: f.courseName || known.find((k) => k.course_code === f.courseCode && k.subject !== k.course_code)?.subject || p.courseName,
        branch: f.departmentKnown ? f.department || "" : p.branch,
        semester: f.semester || p.semester,
        examType: f.examType || p.examType,
        examYear: f.examYear ? String(f.examYear) : p.examYear,
      }));
    } catch {
      if (waiting.current === path) setReadNote("The file could not be read, so please fill in the details.");
    }
  }

  const code = cleanCourseCode(v.courseCode);
  const codes = useMemo(() => [...new Map(known.map((k) => [k.course_code, k.subject])).entries()].sort(), [known]);
  const same = v.kind === "paper" && code ? known.filter((k) => k.kind === "paper" && k.course_code === code && k.exam_type === v.examType && String(k.exam_year) === v.examYear) : [];
  // Mirrors the database rule, only to tell the student what will happen. The database decides.
  const f = read?.fields;
  const instant = instantReady && read?.instant && v.kind === "paper" && code === f.courseCode && v.examType === f.examType && v.examYear === String(f.examYear)
    && Number(v.semester) === f.semester && (!f.departmentKnown || (v.branch || null) === f.department) && (cleanCourseName(v.courseName) || code) === (f.courseName || f.courseCode);

  const submit = async (e) => {
    e.preventDefault(); setError(""); setDuplicate(null); setSaving(true);
    try {
      const r = await submitUpload({ ...v, path: upload.path, filename: upload.name });
      if (r.error) { setError(r.error); if (r.duplicate) { stored.current = null; setDuplicate(r); } return; }
      stored.current = null;
      setResult(r); setPhase("done");
    } catch {
      setError("Could not save the upload. Please try again.");
    } finally { setSaving(false); }
  };

  if (phase === "done") {
    return (
      <div className="empty" role="status">
        <CircleCheck size={40} color="#2f7a4a" aria-hidden="true" />
        <h2>{result.status === "approved" ? "It's live. Thank you!" : "Sent for review. Thank you!"}</h2>
        <p>{result.status === "approved" ? "Your juniors can find it now." : "An admin will check it. You will get a notification when it is live."}</p>
        <div className="notice-actions" style={{ justifyContent: "center" }}>
          <button type="button" className="btn" onClick={reset}>Upload another</button>
          <Link className="btn-s" href={result.status === "approved" ? `/dashboard/notes?course=${code}&dept=all${v.kind === "notes" ? "&tab=notes" : ""}` : "/dashboard/notes?tab=mine"}>See it</Link>
        </div>
      </div>
    );
  }

  if (phase !== "details") {
    const busy = phase !== "pick";
    return (
      <section className="exam-up" aria-label="Choose a file">
        {error && <p className="form-msg err" role="alert">{error}</p>}
        {busy ? (
          <div className="dz-card" role="status">
            <p className="pp-busy"><LoaderCircle size={18} className="spin" aria-hidden="true" /> {phase === "preparing" ? "Preparing your photos…" : phase === "uploading" ? `Uploading… ${progress}%` : "AI is reading the details. This can take a minute."}</p>
            {phase === "uploading" && <div className="progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress}%` }} /></div>}
            {phase === "reading" && <button type="button" className="btn-s ghost" onClick={() => { waiting.current = null; setPhase("details"); }}>Skip and fill in myself</button>}
          </div>
        ) : (
          <>
            <label className={`drop${over ? " over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}>
              <CloudUpload size={34} aria-hidden="true" />
              <b>{photos.length ? "Add more pages" : "Drop your file or photos here"}</b>
              <span>or <u>browse files</u> · PDF, Word, PowerPoint, or photos of each page · up to {fmtSize(MAX_UPLOAD_BYTES)}</span>
              <input type="file" multiple accept=".pdf,.docx,.pptx,image/jpeg,image/png,image/webp" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
            </label>
            {photos.length > 0 && (
              <div className="dz-card">
                <b>{photos.length} page{photos.length === 1 ? "" : "s"}, in this order</b>
                <ol className="pp-pages">{photos.map((p, i) => (
                  <li key={`${p.name}-${i}`}>
                    <span>{p.name} <small>{fmtSize(p.size)}</small></span>
                    <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${p.name} up`}><ArrowUp size={16} /></button>
                    <button type="button" className="icon-btn" disabled={i === photos.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${p.name} down`}><ArrowDown size={16} /></button>
                    <button type="button" className="icon-btn" onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))} aria-label={`Remove ${p.name}`}><X size={16} /></button>
                  </li>
                ))}</ol>
                <div className="dz-actions"><button type="button" className="btn" onClick={() => send(null)}>Make one PDF and continue</button></div>
              </div>
            )}
            <p className="pp-privacy">Share question papers and your own notes only, never answer scripts or pages with a name, USN or marks. {aiReady ? "The file is sent to an AI service to read its details." : ""}</p>
          </>
        )}
      </section>
    );
  }

  const risky = read && (read.documentType === "answer_script" || read.reasons.some((r) => r.includes("USN")));
  return (
    <form className="form" onSubmit={submit}>
      <div className="dz-file">
        <FileText size={28} aria-hidden="true" />
        <div><b>{upload.name}</b><small>{fmtSize(upload.size)}</small></div>
        <button type="button" className="btn-s ghost" onClick={reset}>Change file</button>
      </div>

      {read && <p className="form-msg" role="status"><b>Filled in by AI.</b> Please check every detail.</p>}
      {readNote && <p className="form-msg" role="status">{readNote}</p>}
      {read?.reasons.length > 0 && (
        <div className="form-msg err" role="status"><b>An admin will check this one:</b><ul>{read.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          {risky && <span><TriangleAlert size={14} aria-hidden="true" /> If it shows anyone&apos;s name, USN or marks, please cover them and upload again.</span>}
        </div>
      )}

      <div className="field"><span className="lab">What is it?</span>
        <div className="pp-chips">{[["paper", "Question paper"], ["notes", "Class notes"]].map(([k, l]) => <button key={k} type="button" className={"chip" + (v.kind === k ? " on" : "")} aria-pressed={v.kind === k} onClick={() => set("kind", k)}>{l}</button>)}</div>
      </div>
      <div className="field"><label htmlFor="pc">Course code</label>
        <input id="pc" type="text" required maxLength={16} list="pp-codes" placeholder="BCS304" value={v.courseCode} autoCapitalize="characters"
          onChange={(e) => { const x = e.target.value.toUpperCase(); const found = codes.find(([c]) => c === x); setV((p) => ({ ...p, courseCode: x, courseName: p.courseName || (found && found[1] !== x ? found[1] : "") })); }} />
        <datalist id="pp-codes">{codes.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</datalist>
      </div>
      <div className="field"><label htmlFor="pn">Course name <small>(optional)</small></label><input id="pn" type="text" maxLength={80} placeholder="Data Structures" value={v.courseName} onChange={(e) => set("courseName", e.target.value)} /></div>
      <div className="field"><label htmlFor="pd">Department</label>
        <select id="pd" value={v.branch} onChange={(e) => set("branch", e.target.value)}>
          <option value="">All departments (common subject)</option>
          {departments.map((d) => <option key={d} value={d}>{shortBranch(d)} · {d}</option>)}
        </select>
      </div>
      <div className="field"><span className="lab">Semester</span>
        <div className="pp-chips">{SEMESTERS.map((s) => <button key={s} type="button" className={"chip pp-num" + (Number(v.semester) === s ? " on" : "")} aria-pressed={Number(v.semester) === s} onClick={() => set("semester", s)}>{s}</button>)}</div>
      </div>
      {v.kind === "paper" ? (
        <>
          <div className="field"><span className="lab">Exam</span>
            <div className="pp-chips">{EXAMS.map(([k, l]) => <button key={k} type="button" className={"chip" + (v.examType === k ? " on" : "")} aria-pressed={v.examType === k} onClick={() => set("examType", k)}>{l}</button>)}</div>
          </div>
          <div className="field"><label htmlFor="py">Year the exam was held</label>
            <select id="py" value={v.examYear} onChange={(e) => set("examYear", e.target.value)}>
              {Array.from({ length: new Date().getFullYear() - FIRST_YEAR + 1 }, (_, i) => String(new Date().getFullYear() - i)).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </>
      ) : (
        <>
          <div className="field"><label htmlFor="pt">Title</label><input id="pt" type="text" required minLength={3} maxLength={140} placeholder="Unit 2: Trees and graphs" value={v.title} onChange={(e) => set("title", e.target.value)} /></div>
          <div className="field"><label htmlFor="px">Description <small>(optional)</small></label><textarea id="px" maxLength={1000} style={{ minHeight: 70 }} value={v.description} onChange={(e) => set("description", e.target.value)} /></div>
        </>
      )}

      {same.length > 0 && (
        <div className="form-msg err" role="status"><b>This paper may already be here.</b> <a href={`/api/papers/file/${same[0].id}`} target="_blank" rel="noopener noreferrer">Open the existing one</a> and upload only if yours is different or clearer.</div>
      )}
      {error && <p className="form-msg err" role="alert">{error} {duplicate?.existingId && <a href={`/api/papers/file/${duplicate.existingId}`} target="_blank" rel="noopener noreferrer">Open it</a>}</p>}
      <div className="notice-actions">
        <button className="btn" disabled={saving || !!duplicate || !v.semester || (v.kind === "paper" && !v.examType)}>{saving ? "Saving…" : instant ? "Publish" : "Submit for review"}</button>
        <span className="inline-msg">{instant ? "It goes live at once." : v.kind === "paper" && read?.instant && instantReady ? "You changed what the AI read, so an admin will check it." : "It appears after an admin approves it."}</span>
      </div>
    </form>
  );
}
