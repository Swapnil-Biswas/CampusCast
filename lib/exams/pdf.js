import { MAX_PDF_BYTES } from "./constants.js";

// Cheap structural checks on an uploaded file, done on the server before anything is sent to the AI.
// This is not a full PDF parser: it rejects the common bad cases (not a PDF, empty, cut off, password-protected)
// and makes a best-effort page count. The file is never opened or executed here.
//
// Returns { ok: true, pageCount } or { ok: false, code, message }.
export function sniffPdf(bytes) {
  const size = bytes?.length ?? 0;
  if (size === 0) return fail("empty", "The file is empty.");
  if (size > MAX_PDF_BYTES) return fail("too_large", `The file is larger than ${MAX_PDF_BYTES / 1048576} MB.`);

  const text = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("latin1");
  if (!text.slice(0, 1024).includes("%PDF-")) return fail("not_pdf", "This is not a PDF file.");
  if (!text.slice(-2048).includes("%%EOF")) return fail("truncated", "The PDF looks incomplete or corrupted. Please export it again and re-upload.");
  if (/\/Encrypt\b/.test(text)) return fail("encrypted", "The PDF is password-protected. Please upload an unlocked copy.");

  return { ok: true, pageCount: countPages(text) };
}

function fail(code, message) {
  return { ok: false, code, message };
}

// Counts page objects. PDFs that pack objects into compressed streams hide them from this scan:
// then the largest "/Count n" is used, and if that is missing too the count is unknown (null).
function countPages(text) {
  const pages = (text.match(/\/Type\s*\/Page(?![A-Za-z])/g) || []).length;
  if (pages > 0) return pages;
  let max = 0;
  for (const m of text.matchAll(/\/Count\s+(\d{1,5})\b/g)) max = Math.max(max, Number(m[1]));
  return max > 0 ? max : null;
}
