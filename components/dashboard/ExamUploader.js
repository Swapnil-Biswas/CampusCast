"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, CloudUpload, FileText, Image as ImageIcon, LoaderCircle, RotateCw, TriangleAlert, X } from "lucide-react";
import { browserClient } from "../../lib/supabase/client";
import { checkDuplicate, registerExamUpload, retryExtraction } from "../../app/dashboard/admin/exams/actions";
import { MAX_PDF_BYTES, STALE_PROCESSING_MS } from "../../lib/exams/constants";
import { fileKind, fmtSize, sha256Hex, uploadToStorage } from "./uploadHelpers";

function summarize(result, meta) {
  const fields = Object.values(meta || {}).filter((m) => m && typeof m === "object" && "needsReview" in m);
  const rows = result?.timetable || [];
  return {
    title: result?.title || null,
    category: result?.examinationCategory || null,
    original: result?.originalExaminationName || null,
    rows: rows.length,
    rowsToCheck: rows.filter((r) => r.needsReview).length,
    fieldsToCheck: fields.filter((m) => m.needsReview).length,
    warnings: (result?.warnings || []).map((w) => w.message),
  };
}

const STEPS = [["uploading", "Upload"], ["saving", "Check file"], ["reading", "Read with AI"], ["done", "Ready to review"]];
const ORDER = { idle: -1, checking: 0, uploading: 0, saving: 1, reading: 2, done: 3, failed: 2 };

export default function ExamUploader({ userId, departments, aiReady, keyName = "ANTHROPIC_API_KEY" }) {
  const router = useRouter();
  const alive = useRef(true);
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState("pdf");
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(departments.length === 1 ? [departments[0].name] : []);
  const [over, setOver] = useState(false);
  const [phase, setPhaseRaw] = useState("idle");     // idle | checking | uploading | saving | reading | done | failed
  const lastPhase = useRef("idle");                    // the step that was running, so a failure is shown on the right step
  const to = (p) => { if (p !== "failed") lastPhase.current = p; setPhaseRaw(p); };
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("queued");      // the extraction's own status while reading
  const [error, setError] = useState("");
  const [retryable, setRetryable] = useState(true);
  const [dups, setDups] = useState([]);
  const [summary, setSummary] = useState(null);
  const [extractionId, setExtractionId] = useState(null);
  const busy = ["checking", "uploading", "saving", "reading"].includes(phase);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const reset = () => {
    setFile(null); setPreview(null); to("idle"); setProgress(0); setError(""); setDups([]); setSummary(null); setExtractionId(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const pick = async (f) => {
    if (!f || busy) return;
    setError(""); setDups([]); setSummary(null); to("idle");
    if (/\.hei[cf]$/i.test(f.name) || /hei[cf]/i.test(f.type)) return setError("HEIC photos are not supported. Share or save the photo as JPG or PNG and choose that.");
    if (f.size === 0) return setError("That file is empty.");
    if (f.size > MAX_PDF_BYTES) return setError(`That file is ${fmtSize(f.size)}. The limit is ${fmtSize(MAX_PDF_BYTES)}.`);
    const k = await fileKind(f);
    if (!k) return setError("Please choose a PDF, or a JPG, PNG or WebP photo of the notice. That file is none of those, even if its name says otherwise.");
    setKind(k);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const watch = useCallback(async (id) => {
    to("reading"); setStage("queued");
    const stopAt = Date.now() + STALE_PROCESSING_MS + 30_000;
    while (alive.current && Date.now() < stopAt) {
      const { data } = await browserClient().from("exam_extractions").select("status, error, field_meta, result").eq("id", id).maybeSingle();
      if (!alive.current) return;
      if (data) {
        setStage(data.status);
        if (data.status === "completed") { setSummary(summarize(data.result, data.field_meta)); to("done"); router.refresh(); return; }
        if (data.status === "failed") {
          setError(data.error || "The document could not be read."); setRetryable(data.field_meta?._failure?.retryable !== false);
          to("failed"); router.refresh(); return;
        }
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
    if (alive.current) { setError("This is taking longer than expected."); setRetryable(true); to("failed"); }
  }, [router]);

  const startExtraction = async (id) => {
    setExtractionId(id);
    const res = await fetch("/api/exams/extract", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ extractionId: id }) });
    if (!res.ok && res.status !== 503) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || "Could not start reading the document.");
    }
    await watch(id);
  };

  const go = async (allowDuplicate = false) => {
    if (!file || busy) return;
    if (!selected.length) return setError("Choose at least one department.");
    setError(""); setProgress(0);
    try {
      to("checking");
      const sha = await sha256Hex(file);
      if (!allowDuplicate) {
        const { duplicates } = await checkDuplicate(sha);
        if (duplicates?.length) { setDups(duplicates); to("idle"); return; }
      }
      to("uploading");
      const { data: { session } } = await browserClient().auth.getSession();
      if (!session) throw new Error("Your session has expired. Please sign in again.");
      const path = `${userId}/${crypto.randomUUID()}.${kind}`;
      await uploadToStorage(file, path, session.access_token, setProgress);
      to("saving");
      const reg = await registerExamUpload({ path, filename: file.name, departments: selected, allowDuplicate });
      if (reg.error) throw new Error(reg.error);
      router.refresh();
      await startExtraction(reg.extractionId);
    } catch (e) {
      if (!alive.current) return;
      setError(e.message || "Something went wrong."); setRetryable(false); to("failed");
    }
  };

  const retry = async () => {
    if (!extractionId) return reset();
    setError("");
    const r = await retryExtraction(extractionId);
    if (r.error) { setError(r.error); return; }
    try { await startExtraction(r.extractionId); } catch (e) { setError(e.message); to("failed"); }
  };

  const toggle = (name) => setSelected((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]));
  const step = ORDER[phase === "failed" ? lastPhase.current : phase];

  return (
    <section className="exam-up" aria-label="Upload an examination notice (PDF or photo)">
      {!aiReady && (
        <p className="form-msg err" role="status">
          AI reading is not switched on for this server yet (the <code>GEMINI_API_KEY</code>, <code>OPENROUTER_API_KEY</code> or <code>GROQ_API_KEY</code> setting is missing). You can still upload, but the document will not be read until it is added.
        </p>
      )}

      {!file && (
        <label
          className={`drop${over ? " over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); }}
        >
          <CloudUpload size={34} aria-hidden="true" />
          <b>Drop an official examination PDF or photo here</b>
          <span>or <u>browse files</u> · PDF, or a JPG / PNG / WebP photo (for example one shared on WhatsApp) · up to {fmtSize(MAX_PDF_BYTES)}</span>
          <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
      )}

      {file && (
        <div className="dz-card">
          <div className="dz-file">
            {kind === "pdf" ? <FileText size={28} aria-hidden="true" /> : <ImageIcon size={28} aria-hidden="true" />}
            <div><b>{file.name}</b><small>{fmtSize(file.size)} · {kind === "pdf" ? "PDF" : "Photo"}</small></div>
            {!busy && phase !== "done" && <button type="button" className="icon-btn" onClick={reset} aria-label="Remove this file"><X size={18} /></button>}
          </div>

          {phase === "idle" && (
            <>
              <details className="dz-preview">
                <summary>{kind === "pdf" ? "Preview the PDF" : "Preview the photo"}</summary>
                {preview && (kind === "pdf"
                  ? <object data={preview} type="application/pdf" aria-label="PDF preview"><a href={preview} target="_blank" rel="noopener noreferrer">Open the PDF in a new tab</a></object>
                  : <img src={preview} alt="The photo you chose" />)}
              </details>

              <fieldset className="dz-depts">
                <legend>Which department(s) is this notice for?</legend>
                {departments.map((d) => (
                  <label key={d.name} className={`chip${selected.includes(d.name) ? " on" : ""}`}>
                    <input type="checkbox" checked={selected.includes(d.name)} onChange={() => toggle(d.name)} /> {d.code}<small>{d.name}</small>
                  </label>
                ))}
              </fieldset>

              {dups.length > 0 && (
                <div className="form-msg err" role="alert">
                  <b>This exact file is already uploaded:</b>
                  <ul>{dups.map((d) => <li key={d.id}>{d.title} <small>({d.status.replace("_", " ")})</small></li>)}</ul>
                  <button type="button" className="btn-s" onClick={() => { setDups([]); go(true); }}>Upload it again anyway</button>
                </div>
              )}

              <div className="dz-actions">
                <button type="button" className="btn" onClick={() => go(false)} disabled={!selected.length}>{kind === "pdf" ? "Upload and read the PDF" : "Upload and read the photo"}</button>
                <button type="button" className="btn-s ghost" onClick={reset}>Replace file</button>
              </div>
            </>
          )}

          {phase !== "idle" && (
            <>
              <ol className="steps" aria-label="Progress">
                {STEPS.map(([key, label], i) => (
                  <li key={key} className={i < step ? "done" : i === step ? (phase === "failed" ? "bad" : phase === "done" ? "done" : "now") : ""}>
                    <span>{i < step || phase === "done" ? <CircleCheck size={16} /> : i === step && phase === "failed" ? <TriangleAlert size={16} /> : i === step ? <LoaderCircle size={16} className="spin" /> : i + 1}</span>
                    {label}
                  </li>
                ))}
              </ol>
              {phase === "uploading" && <div className="progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress}%` }} /><small>{progress}%</small></div>}
              {phase === "checking" && <p className="inline-msg">Checking whether this file was uploaded before…</p>}
              {phase === "saving" && <p className="inline-msg">Checking the file and saving the draft…</p>}
              {phase === "reading" && <p className="inline-msg" role="status">{stage === "queued" ? "Waiting to start…" : "Reading every page and filling in the details. Long timetables can take a minute or two."}</p>}

              {phase === "failed" && (
                <div className="form-msg err" role="alert">
                  <p><b>It did not work.</b> {error}</p>
                  <div className="dz-actions">
                    {extractionId && retryable && <button type="button" className="btn-s clay" onClick={retry}><RotateCw size={16} /> Try again</button>}
                    <button type="button" className="btn-s" onClick={reset}>Choose another file</button>
                  </div>
                </div>
              )}

              {phase === "done" && summary && (
                <div className="form-msg" role="status">
                  <p><b>Done. The {kind === "pdf" ? "PDF" : "photo"} was read and saved as a draft.</b> Nothing is published: a person checks everything first.</p>
                  <ul>
                    <li>{summary.category ? <>Category: <b>{summary.category}</b>{summary.original && <> (the notice says &ldquo;{summary.original}&rdquo;)</>}</> : <b>Category not clear in the notice: requires admin review.</b>}</li>
                    {summary.title && <li>Title: {summary.title}</li>}
                    <li>{summary.rows} timetable row{summary.rows === 1 ? "" : "s"} found{summary.rowsToCheck ? `, ${summary.rowsToCheck} to check` : ""}</li>
                    <li>{summary.fieldsToCheck} detail{summary.fieldsToCheck === 1 ? "" : "s"} marked for checking</li>
                  </ul>
                  {summary.warnings.length > 0 && <ul className="warn">{summary.warnings.map((w, i) => <li key={i}><TriangleAlert size={14} /> {w}</li>)}</ul>}
                  <div className="dz-actions"><button type="button" className="btn-s" onClick={reset}>Upload another</button></div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {error && phase === "idle" && <p className="form-msg err" role="alert">{error}</p>}
    </section>
  );
}
