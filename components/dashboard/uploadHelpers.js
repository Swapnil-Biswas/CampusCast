import { supabaseKey, supabaseUrl } from "../../lib/supabase/config";

// Small browser-side helpers shared by the exam and hackathon uploaders.

export const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export async function sha256Hex(file) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// What the file really is, judged from its first bytes (never its name): a PDF or a JPEG / PNG / WebP photo.
// Returns "pdf" | "jpg" | "png" | "webp" (also the extension used for the stored copy) or null.
export async function fileKind(file) {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = (from, to) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 5) === "%PDF-") return "pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x89 && ascii(1, 4) === "PNG") return "png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  return null;
}

// Upload straight into a private storage bucket with real progress (fetch cannot report upload progress).
export function uploadToStorage(file, path, token, onProgress, bucket = "exam-pdfs") {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${supabaseUrl}/storage/v1/object/${bucket}/${path}`);
    xhr.setRequestHeader("apikey", supabaseKey);
    xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      // Say what storage actually objected to (for example a file type the bucket does not allow yet).
      let why = "";
      try { why = String(JSON.parse(xhr.responseText)?.message || "").slice(0, 160); } catch { /* not JSON */ }
      if (/mime|not supported|not allowed/i.test(why)) return reject(new Error("Supabase storage does not accept this file type yet. Run the latest SQL file for this feature in the Supabase SQL Editor, then try again."));
      if (/exceeded|too large|size/i.test(why)) return reject(new Error("The file is larger than the storage limit."));
      reject(new Error(`Upload failed (${xhr.status})${why ? `: ${why}` : "."}`));
    };
    xhr.onerror = () => reject(new Error("The upload was interrupted. Check your connection and try again."));
    const form = new FormData();   // same shape the Supabase client sends
    form.append("cacheControl", "3600");
    form.append("", file);
    xhr.send(form);
  });
}
