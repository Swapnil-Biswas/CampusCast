"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CircleCheck, CloudUpload, FileText, Image as ImageIcon, LoaderCircle, Plus, RotateCw, TriangleAlert, X } from "lucide-react";
import { browserClient } from "../../lib/supabase/client";
import { checkWorkshopDuplicate, createBlankWorkshop, registerWorkshopUpload, retryWorkshopExtraction } from "../../app/dashboard/workshops/manage/actions";
import { MAX_PDF_BYTES, STALE_PROCESSING_MS } from "../../lib/exams/constants";
const NO_CLUB = "No club (department or college)";
import { fileKind, fmtSize, sha256Hex, uploadToStorage } from "./uploadHelpers";

const STEPS = [["uploading", "Upload"], ["saving", "Check file"], ["reading", "Read with AI"], ["done", "Ready to review"]];
const ORDER = { idle: -1, checking: 0, uploading: 0, saving: 1, reading: 2, done: 3, failed: 2 };

// Upload a poster, brochure or photo: it is read by the AI into a DRAFT that the organiser reviews and publishes.
export default function WorkshopUploader({ userId, clubs, isAdmin, aiReady }) {
  const router = useRouter();
  const alive = useRef(true);
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState("jpg");
  const [preview, setPreview] = useState(null);
  const [clubId, setClubId] = useState(clubs.length === 1 ? clubs[0].id : "");
  const [over, setOver] = useState(false);
  const [phase, setPhaseRaw] = useState("idle");
  const lastPhase = useRef("idle");
  const to = (p) => { if (p !== "failed") lastPhase.current = p; setPhaseRaw(p); };
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("queued");
  const [error, setError] = useState("");
  const [retryable, setRetryable] = useState(true);
  const [dups, setDups] = useState([]);
  const [ids, setIds] = useState({ workshopId: null, extractionId: null });
  const busy = ["checking", "uploading", "saving", "reading"].includes(phase);

  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const reset = () => {
    setFile(null); setPreview(null); to("idle"); setProgress(0); setError(""); setDups([]); setIds({ workshopId: null, extractionId: null });
    if (inputRef.current) inputRef.current.value = "";
  };

  const pick = async (f) => {
    if (!f || busy) return;
    setError(""); setDups([]); to("idle");
    if (/\.hei[cf]$/i.test(f.name) || /hei[cf]/i.test(f.type)) return setError("HEIC photos are not supported. Save or share the photo as JPG or PNG and choose that.");
    if (f.size === 0) return setError("That file is empty.");
    if (f.size > MAX_PDF_BYTES) return setError(`That file is ${fmtSize(f.size)}. The limit is ${fmtSize(MAX_PDF_BYTES)}.`);
    const k = await fileKind(f);
    if (!k) return setError("Please choose a PDF, or a JPG, PNG or WebP photo of the poster. That file is none of those, even if its name says otherwise.");
    setKind(k); setFile(f); setPreview(URL.createObjectURL(f));
  };

  const watch = useCallback(async (id, workshopId) => {
    to("reading"); setStage("queued");
    const stopAt = Date.now() + STALE_PROCESSING_MS + 30_000;
    while (alive.current && Date.now() < stopAt) {
      const { data } = await browserClient().from("workshop_extractions").select("status, error, field_meta").eq("id", id).maybeSingle();
      if (!alive.current) return;
      if (data) {
        setStage(data.status);
        if (data.status === "completed") { to("done"); router.refresh(); return; }
        if (data.status === "failed") { setError(data.error || "The document could not be read."); setRetryable(data.field_meta?._failure?.retryable !== false); to("failed"); router.refresh(); return; }
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
    if (alive.current) { setError("This is taking longer than expected."); setRetryable(true); to("failed"); }
  }, [router]);

  const startExtraction = async (id, workshopId) => {
    setIds({ workshopId, extractionId: id });
    const res = await fetch("/api/workshops/extract", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ extractionId: id }) });
    if (!res.ok && res.status !== 503) { const j = await res.json().catch(() => ({})); throw new Error(j.error || "Could not start reading the document."); }
    await watch(id, workshopId);
  };

  const go = async (allowDuplicate = false) => {
    if (!file || busy) return;
    if (!clubId && !isAdmin) return setError("Choose the club that is organising this workshop.");
    setError(""); setProgress(0);
    try {
      to("checking");
      const sha = await sha256Hex(file);
      if (!allowDuplicate) {
        const { duplicates } = await checkWorkshopDuplicate(sha);
        if (duplicates?.length) { setDups(duplicates); to("idle"); return; }
      }
      to("uploading");
      const { data: { session } } = await browserClient().auth.getSession();
      if (!session) throw new Error("Your session has expired. Please sign in again.");
      const path = `${userId}/${crypto.randomUUID()}.${kind}`;
      await uploadToStorage(file, path, session.access_token, setProgress, "workshop-files");
      to("saving");
      const reg = await registerWorkshopUpload({ path, filename: file.name, clubId: clubId || null, allowDuplicate });
      if (reg.error) throw new Error(reg.error);
      router.refresh();
      await startExtraction(reg.extractionId, reg.workshopId);
    } catch (e) {
      if (!alive.current) return;
      setError(e.message || "Something went wrong."); setRetryable(false); to("failed");
    }
  };

  const retry = async () => {
    if (!ids.extractionId) return reset();
    setError("");
    const r = await retryWorkshopExtraction(ids.extractionId);
    if (r.error) { setError(r.error); return; }
    try { await startExtraction(r.extractionId, ids.workshopId); } catch (e) { setError(e.message); to("failed"); }
  };

  const blank = async () => {
    if (!clubId && !isAdmin) return setError("Choose the club that is organising this workshop.");
    setError("");
    const r = await createBlankWorkshop({ clubId: clubId || null });
    if (r.error) return setError(r.error);
    router.push(`/dashboard/workshops/manage/${r.workshopId}`);
  };

  const step = ORDER[phase === "failed" ? lastPhase.current : phase];
  const clubPicker = (
    <label className="field">
      <span className="lab">Which club is hosting it?</span>
      <select value={clubId} onChange={(e) => setClubId(e.target.value)} aria-label="Organising club">
        {(isAdmin || clubs.length !== 1) && <option value="">{isAdmin ? NO_CLUB : "Choose your club"}</option>}
        {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </label>
  );

  return (
    <section className="exam-up" aria-label="Upload a workshop poster">
      {!aiReady && (
        <p className="form-msg err" role="status">AI reading is not switched on for this server yet (<code>GEMINI_API_KEY</code> or <code>GROQ_API_KEY</code> is missing). You can still upload a poster and fill the details in by hand.</p>
      )}

      {!file && (
        <>
          <label
            className={`drop${over ? " over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); }}
          >
            <CloudUpload size={34} aria-hidden="true" />
            <b>Drop a workshop poster or brochure here</b>
            <span>or <u>browse files</u> · PDF, or a JPG / PNG / WebP photo (a WhatsApp poster works) · up to {fmtSize(MAX_PDF_BYTES)}</span>
            <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          <div className="dz-actions">
            <button type="button" className="btn-s" onClick={blank}><Plus size={14} /> Or start with an empty form</button>
            {clubs.length > 1 || isAdmin ? <span className="inline-msg">Club: </span> : null}
            {(clubs.length > 1 || isAdmin) && <select value={clubId} onChange={(e) => setClubId(e.target.value)} aria-label="Club for the empty form">{isAdmin && <option value="">{NO_CLUB}</option>}{!isAdmin && <option value="">Choose your club</option>}{clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
          </div>
        </>
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
              <details className="dz-preview" open>
                <summary>{kind === "pdf" ? "Preview the PDF" : "Preview the poster"}</summary>
                {preview && (kind === "pdf"
                  ? <object data={preview} type="application/pdf" aria-label="PDF preview"><a href={preview} target="_blank" rel="noopener noreferrer">Open the PDF in a new tab</a></object>
                  : <img src={preview} alt="The poster you chose" />)}
              </details>
              {clubPicker}
              {dups.length > 0 && (
                <div className="form-msg err" role="alert">
                  <b>This exact file is already uploaded:</b>
                  <ul>{dups.map((d) => <li key={d.id}><Link href={`/dashboard/workshops/manage/${d.id}`}>{d.title}</Link> <small>({d.status})</small></li>)}</ul>
                  <button type="button" className="btn-s" onClick={() => { setDups([]); go(true); }}>Upload it again anyway</button>
                </div>
              )}
              <div className="dz-actions">
                <button type="button" className="btn" onClick={() => go(false)}>Upload and read the poster</button>
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
              {phase === "reading" && <p className="inline-msg" role="status">{stage === "queued" ? "Waiting to start…" : "Reading the poster and picking out the name, date, topics, speaker, venue, seats and contact…"}</p>}

              {phase === "failed" && (
                <div className="form-msg err" role="alert">
                  <p><b>It did not work.</b> {error}</p>
                  <div className="dz-actions">
                    {ids.extractionId && retryable && <button type="button" className="btn-s clay" onClick={retry}><RotateCw size={16} /> Try again</button>}
                    {ids.workshopId && <Link className="btn-s" href={`/dashboard/workshops/manage/${ids.workshopId}`}>Fill the details in by hand</Link>}
                    <button type="button" className="btn-s" onClick={reset}>Choose another file</button>
                  </div>
                </div>
              )}

              {phase === "done" && (
                <div className="form-msg" role="status">
                  <p><b>Done. The poster was read and saved as a draft.</b> Nothing is public yet: check the details, then publish. Anything the AI was unsure about is marked <b>Check</b>.</p>
                  <div className="dz-actions">
                    <Link className="btn" href={`/dashboard/workshops/manage/${ids.workshopId}`}>Review and publish</Link>
                    <button type="button" className="btn-s" onClick={reset}>Upload another</button>
                  </div>
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
