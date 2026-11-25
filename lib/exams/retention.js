// Removes the original PDF of exam notices once their exams are long over (storage on the free plan is limited).
// The notice and its timetable stay; only the file goes. The database decides what has expired (exam_expired_pdfs)
// and only lets approvers act on their own departments; here we delete the stored files and record it.

export const DEFAULT_RETENTION_DAYS = 20;

export function retentionDays(env = process.env) {
  const n = Number.parseInt(env.EXAM_PDF_RETENTION_DAYS, 10);
  return Number.isFinite(n) && n >= 1 && n <= 365 ? n : DEFAULT_RETENTION_DAYS;
}

/** @returns { removed: number, failed: number } and never throws: this is housekeeping, it must not break a page. */
export async function purgeExpiredPdfs(supabase, days = DEFAULT_RETENTION_DAYS) {
  try {
    const { data: due, error } = await supabase.rpc("exam_expired_pdfs", { p_days: days });
    if (error || !due?.length) return { removed: 0, failed: 0 };
    const byPath = new Map(due.map((d) => [d.storage_path, d.document_id]));
    const { data: gone, error: rmErr } = await supabase.storage.from("exam-pdfs").remove([...byPath.keys()]);
    if (rmErr) return { removed: 0, failed: due.length };
    // Only files storage confirmed as removed are marked, so a failed delete is tried again next time.
    const ids = (gone || []).map((o) => byPath.get(o.name)).filter(Boolean);
    if (ids.length) {
      const { error: markErr } = await supabase.rpc("exam_mark_pdfs_deleted", { p_ids: ids, p_days: days });
      if (markErr) return { removed: 0, failed: due.length };
    }
    return { removed: ids.length, failed: due.length - ids.length };
  } catch {
    return { removed: 0, failed: 0 };
  }
}
