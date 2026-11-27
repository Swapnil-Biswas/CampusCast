"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, RotateCw, Sparkles, Trash2 } from "lucide-react";
import { browserClient } from "../../lib/supabase/client";
import { readMyProfileSources, removeMyProfileFile, removeMyReadingData } from "../../app/dashboard/connect/autofill-actions";
import { EXT, kindOf } from "../../lib/connect/files";
import { FIELD_LABELS } from "../../lib/connect/draft";
import { MAX_FILE_MB } from "../../lib/connect/limits";

const BUCKET = "profile-files";
const LABEL = { resume: "Resume", linkedin: "LinkedIn export" };

// "Fill my profile automatically": upload, read, hand the draft to the form. It never saves the profile.
export default function ProfileAutofill({ userId, files: stored, reading, aiReady, defaultGithub, onDraft }) {
  const router = useRouter();
  const [picked, setPicked] = useState({ resume: null, linkedin: null });
  const [paste, setPaste] = useState("");
  const [github, setGithub] = useState(defaultGithub || "");
  const [busy, setBusy] = useState("");            // "" | "upload" | "read" | "remove"
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [last, setLast] = useState(reading || null);
  const [inputKey, setInputKey] = useState(0);

  const pick = (kind, file) => {
    setError("");
    if (file && !EXT[file.type]) return setError("Choose a PDF, or a JPG, PNG or WebP photo.");
    if (file && file.size > MAX_FILE_MB * 1048576) return setError(`That file is larger than ${MAX_FILE_MB} MB.`);
    setPicked((p) => ({ ...p, [kind]: file }));
  };

  const read = async () => {
    setError(""); setResult(null);
    try {
      const paths = new Map(stored.map((f) => [kindOf(f), f]));
      const storage = browserClient().storage.from(BUCKET);
      for (const kind of ["resume", "linkedin"]) {
        const file = picked[kind];
        if (!file) continue;
        setBusy("upload");
        const path = `${userId}/${kind}-${crypto.randomUUID()}.${EXT[file.type]}`;
        const { error: upErr } = await storage.upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw new Error(/bucket not found/i.test(upErr.message) ? "Run supabase/dashboard-10-connect-autofill.sql in Supabase first." : `${LABEL[kind]} could not be uploaded.`);
        const old = stored.filter((p) => kindOf(p) === kind);      // one file of each kind is enough
        if (old.length) await storage.remove(old);
        paths.set(kind, path);
      }
      setBusy("read");
      const r = await readMyProfileSources({ paths: [...paths.values()], linkedinText: paste, github });
      setPicked({ resume: null, linkedin: null }); setInputKey((k) => k + 1);
      if (r.error) setError(r.error);
      else {
        const applied = onDraft(r.draft);
        setResult({ ...r.draft, ...applied });
        if (Object.keys(r.draft.fields).length) setLast(r.draft);
      }
      router.refresh();
    } catch (e) {
      setError(e?.message || "Something went wrong. Please try again.");
    } finally { setBusy(""); }
  };

  const fillAgain = () => { setError(""); setResult({ ...last, ...onDraft(last), error: null, warnings: [] }); };
  const remove = async (fn) => {
    setBusy("remove"); setError("");
    const r = await fn();
    setBusy("");
    if (r?.error) setError(r.error); else router.refresh();
  };

  const file = (kind, label, hint, accept) => (
    <div className="field">
      <label htmlFor={`af-${kind}`}>{label} <small>{hint}</small></label>
      <input key={inputKey} id={`af-${kind}`} type="file" accept={accept} disabled={!!busy} onChange={(e) => pick(kind, e.target.files?.[0] || null)} />
    </div>
  );
  const nothing = !picked.resume && !picked.linkedin && !stored.length && !paste.trim() && !github.trim();

  return (
    <section className="autofill" aria-label="Fill my profile automatically">
      <h2><Sparkles size={18} aria-hidden="true" /> Fill my profile automatically</h2>
      <p className="audience">Give what you have. AI fills the form below, you check it and press Save. Nothing is saved or shown to anyone before that.</p>
      {!aiReady && <p className="form-msg err">AI reading is not switched on for this server (no <code>GEMINI_API_KEY</code>, <code>GROQ_API_KEY</code> or other AI key). Only GitHub details can be filled.</p>}
      {file("resume", "Resume", `PDF or photo, up to ${MAX_FILE_MB} MB`, "application/pdf,image/jpeg,image/png,image/webp")}
      {file("linkedin", "LinkedIn profile PDF", "on your LinkedIn profile: More (or Resources) > Save to PDF", "application/pdf")}
      <details>
        <summary>Or paste your LinkedIn profile text</summary>
        <textarea aria-label="LinkedIn profile text" value={paste} maxLength={20000} onChange={(e) => setPaste(e.target.value)} placeholder="Copy the text of your own profile and paste it here" />
      </details>
      <div className="field"><label htmlFor="af-gh">GitHub username or link <small>only public details are read</small></label>
        <input id="af-gh" type="text" value={github} maxLength={200} onChange={(e) => setGithub(e.target.value)} placeholder="your-github-name" autoComplete="off" /></div>
      <p className="audience"><small>CampusCast does not open your LinkedIn page (LinkedIn does not allow it). Files you upload are private to you. Their text is sent to the AI service to be read, and free AI services may keep what they receive. Phone numbers, addresses, birth dates, USN and email addresses are not put on your profile.</small></p>

      {stored.length > 0 && (
        <div>
          <b>Your uploaded files</b>
          <ul className="files">{stored.map((p) => (
            <li key={p}><span className="file">{LABEL[kindOf(p)]} ({p.split(".").pop().toUpperCase()}) <button type="button" className="btn-s" disabled={!!busy} onClick={() => remove(() => removeMyProfileFile(p))}><Trash2 size={14} /> Remove</button></span></li>
          ))}</ul>
        </div>
      )}

      <div className="notice-actions">
        <button type="button" className="btn" disabled={!!busy || nothing} onClick={read}>
          {busy === "upload" || busy === "read" ? <><LoaderCircle size={16} className="spin" /> {busy === "upload" ? "Uploading…" : "Reading… up to a few minutes"}</> : "Read and fill the form"}
        </button>
        {last && <button type="button" className="btn-s" disabled={!!busy} onClick={fillAgain} title="Uses the last reading, without calling the AI again"><RotateCw size={14} /> Fill again from the last reading</button>}
        {(stored.length > 0 || last) && <button type="button" className="btn-s ghost" disabled={!!busy} onClick={() => { if (confirm("Delete your uploaded files and the saved reading? Your profile stays as it is.")) remove(async () => { const r = await removeMyReadingData(); if (!r.error) { setLast(null); setResult(null); } return r; }); }}>Delete my files and reading</button>}
      </div>

      {error && <p className="form-msg err" role="alert">{error}</p>}
      {result && (
        <div className={`form-msg${result.error ? " err" : ""}`} role="status">
          {result.error && <p><b>The reading did not fully work.</b> {result.error}</p>}
          <p>{result.filled.length ? <>Filled below, marked <b>Check</b>: {result.filled.map((k) => FIELD_LABELS[k]).join(", ")}. Check them, then press <b>Confirm and save</b>.</> : "No empty field was filled."}</p>
          {result.suggested.length > 0 && <p>You had already written: {result.suggested.map((k) => FIELD_LABELS[k]).join(", ")}. Nothing was changed there; the suggestions are shown under those fields.</p>}
          {(result.warnings?.length > 0 || result.notes?.length > 0) && <ul>{[...(result.warnings || []), ...(result.notes || [])].map((w, i) => <li key={i}>{w}</li>)}</ul>}
        </div>
      )}
    </section>
  );
}
