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

// ---------- photos as well as PDFs ----------
// Notices are sometimes only shared as a photo or screenshot (for example in a WhatsApp group). The AI can read those
// directly, so JPEG, PNG and WebP are accepted too. Like the PDF check this only looks at the file's own first and last
// bytes (never at its name or declared type), and never opens or runs it.

export const FILE_KINDS = {
  pdf: { mime: "application/pdf", ext: "pdf", label: "PDF" },
  jpeg: { mime: "image/jpeg", ext: "jpg", label: "photo" },
  png: { mime: "image/png", ext: "png", label: "photo" },
  webp: { mime: "image/webp", ext: "webp", label: "photo" },
};
export const ACCEPTED_MIMES = Object.values(FILE_KINDS).map((k) => k.mime);
export const ACCEPTED_EXTENSIONS = Object.values(FILE_KINDS).map((k) => k.ext);

/** Which kind of file is this, judged from its first bytes only? Returns a key of FILE_KINDS or null. */
export function detectKind(bytes) {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(bytes.byteLength, 1024));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "webp";
  if (b.toString("latin1").includes("%PDF-")) return "pdf";
  return null;
}

/**
 * Checks an uploaded PDF or photo.
 * @returns { ok: true, kind, mime, ext, isImage, pageCount } | { ok: false, code, message }
 */
export function sniffFile(bytes) {
  const size = bytes?.length ?? 0;
  if (size === 0) return fail("empty", "The file is empty.");
  if (size > MAX_PDF_BYTES) return fail("too_large", `The file is larger than ${MAX_PDF_BYTES / 1048576} MB.`);
  const kind = detectKind(bytes);
  if (!kind) return fail("unsupported", "This file type is not supported. Upload a PDF, or a JPG, PNG or WebP photo of the notice.");
  const info = FILE_KINDS[kind];
  if (kind === "pdf") {
    const r = sniffPdf(bytes);
    return r.ok ? { ok: true, kind, mime: info.mime, ext: info.ext, isImage: false, pageCount: r.pageCount } : r;
  }
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tail = buf.subarray(Math.max(0, buf.length - 1024));
  const complete =
    kind === "jpeg" ? tail.includes(Buffer.from([0xff, 0xd9]))
    : kind === "png" ? tail.includes(Buffer.from("IEND", "latin1"))
    : buf.readUInt32LE(4) + 8 <= buf.length;                       // WebP: the size written in the header fits the file
  if (!complete) return fail("truncated", "The photo looks incomplete or corrupted. Please send it again and re-upload.");
  return { ok: true, kind, mime: info.mime, ext: info.ext, isImage: true, pageCount: 1 };
}
