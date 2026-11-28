import { createHash } from "node:crypto";
import { extractWithFallback } from "../exams/chain.js";
import { sniffFile } from "../exams/pdf.js";
import { ExtractionError } from "../exams/provider.js";
import { normalizePaper } from "./normalize.js";
import { PAPER_TASK } from "./task.js";

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * Reads one stored upload with AI and, when the server has its secret key, records what it found so the database can
 * publish the paper without an admin.
 *
 * @param supabase  the uploader's own client (row-level security applies to the download)
 * @param admin     the service-role client, or null
 * @returns { ok: true, documentType, fields, reasons, instant } | { ok: false, code, message }
 */
export async function readPaper({ supabase, admin, userId, path, filename, providers, fetchImpl, sleep, now }) {
  const { data: file, error } = await supabase.storage.from("notes").download(path);
  if (error || !file) return { ok: false, code: "storage", message: "Could not open the uploaded file." };
  const bytes = Buffer.from(await file.arrayBuffer());
  const sniff = sniffFile(bytes);
  if (!sniff.ok) return { ok: false, code: sniff.code, message: sniff.message };

  const { data: departments } = await supabase.from("departments").select("name, code").eq("active", true).order("sort");
  let ai;
  try {
    ai = await extractWithFallback({ providers, pdf: bytes, mime: sniff.mime, task: PAPER_TASK, filename, departments: departments || [], fetchImpl, sleep });
  } catch (e) {
    if (e instanceof ExtractionError) return { ok: false, code: e.code, message: e.message };
    throw e;
  }
  const norm = normalizePaper(ai.input, { departments: departments || [], now });
  if (!norm.ok) return { ok: false, code: "invalid_output", message: norm.error };

  let instant = false;
  if (admin) {
    const { error: saveError } = await admin.from("note_checks").upsert({
      path, uploader_id: userId, sha256: sha256(bytes), passed: norm.passed, fields: norm.fields, reasons: norm.reasons,
    });
    if (saveError) console.error("[paper check] could not be saved:", saveError.code || "", saveError.message);
    instant = norm.passed && !saveError;
  }
  return { ok: true, documentType: norm.documentType, fields: norm.fields, reasons: norm.reasons, instant };
}
