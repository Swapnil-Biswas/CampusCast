import { extractWithFallback } from "../exams/chain.js";
import { ExtractionError } from "../exams/provider.js";
import { sniffFile } from "../exams/pdf.js";
import { pdfPages } from "../exams/pdftext.js";
import { fetchGitHub, githubText } from "./github.js";
import { profileTask } from "./task.js";
import { buildDraft } from "./draft.js";
import { redact } from "./redact.js";
import { MAX_FILE_MB } from "./limits.js";

// One reading from start to finish: gather the sources, remove private details from all text, ask the AI once, check
// the answer. Pure apart from the network calls passed in, so it is fully testable. Saves nothing.

export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
export const MAX_PASTE = 20_000;
const MAX_SOURCE = 25_000;                           // characters of text per source sent to the AI
const MIN_PDF_TEXT = 200;                            // fewer than this: a scanned PDF, sent as a file

/**
 * @param files   [{ label: "Resume" | "LinkedIn export", name, bytes }]
 * @returns { ok, draft, warnings: [..], used: [..], error? }
 *          ok false with a draft means the AI failed but the GitHub facts were still filled in.
 */
export async function readProfileSources({
  files = [], linkedinText = "", github = "", faculty = false, providers = [],
  fetchImpl, sleep, extract = extractWithFallback, readPages = pdfPages,
}) {
  const warnings = [], used = [], texts = [];
  let attachment = null;
  const fail = (error, draft = { fields: {}, notes: [] }) => ({ ok: false, error, draft, warnings, used });

  for (const f of files) {
    if (f.bytes.length > MAX_FILE_BYTES) { warnings.push(`${f.label}: the file is larger than ${MAX_FILE_MB} MB.`); continue; }
    const sniff = sniffFile(f.bytes);
    if (!sniff.ok) { warnings.push(`${f.label}: ${sniff.message}`); continue; }
    let text = "";
    if (sniff.kind === "pdf") {
      try { text = (await readPages(f.bytes)).join("\n").trim(); } catch { text = ""; }
    }
    if (text.length >= MIN_PDF_TEXT) { texts.push([f.label, redact(text).slice(0, MAX_SOURCE)]); used.push(f.label); }
    else if (!attachment) { attachment = { label: f.label, bytes: f.bytes, mime: sniff.mime, name: f.name }; used.push(f.label); }
    else warnings.push(`${f.label}: only one scanned or photo file can be read at a time. Read it separately.`);
  }

  const pasted = String(linkedinText || "").trim();
  if (pasted) {
    if (pasted.length > MAX_PASTE) warnings.push("The pasted text was long, so only the first part was read.");
    texts.push(["LinkedIn text (pasted)", redact(pasted.slice(0, MAX_PASTE))]);
    used.push("Pasted text");
  }

  let gh = null;
  if (String(github || "").trim()) {
    try {
      gh = await fetchGitHub(github, fetchImpl ? { fetchImpl } : {});
      texts.push(["GitHub", redact(githubText(gh))]);
      used.push("GitHub");
    } catch (e) {
      warnings.push(`GitHub: ${e.message}`);
    }
  }

  if (!texts.length && !attachment) return fail(warnings.length ? "None of the sources could be read." : "Add a resume, a LinkedIn export, some text or a GitHub username first.");

  const body = texts.map(([label, t]) => `=== ${label} ===\n${t}`).join("\n\n");
  // With a scanned file, that file is attached and the other text rides along in the message; otherwise it is all text.
  const pdf = attachment ? attachment.bytes : Buffer.from(body, "utf8");
  const mime = attachment ? attachment.mime : "text/plain";
  const options = { faculty, sourceText: body, verifiable: !attachment, github: gh };

  try {
    const ai = await extract({
      providers, pdf, mime, task: profileTask({ faculty, extra: attachment ? body : "" }),
      filename: attachment ? attachment.name : "profile-sources.txt", departments: [], fetchImpl, sleep,
    });
    const draft = buildDraft(ai.input, options);
    if (!Object.keys(draft.fields).length) return fail("The AI found nothing it could put on a profile in these sources.", draft);
    return { ok: true, draft, warnings, used, provider: ai.provider };
  } catch (e) {
    if (!(e instanceof ExtractionError)) throw e;
    const why = e.code === "image_unsupported" || e.code === "scanned"
      ? "This file is a scan or photo, and the AI reader that can read pictures was not available. Try again later, or upload a PDF with selectable text."
      : e.message;
    return fail(why, buildDraft(null, { ...options, verifiable: false }));
  }
}
