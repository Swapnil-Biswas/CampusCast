// Shared constants for the examination module. The category codes and labels mirror public.exam_categories
// (supabase/dashboard-6-exams.sql); the database table is the source of truth for what students see.

export const CATEGORY_LABELS = {
  ia1: "IA 1",
  ia2: "IA 2",
  ia3: "IA 3",
  final: "Final Examination",
  special: "Special Examination",
};
export const CATEGORY_CODES = Object.keys(CATEGORY_LABELS);

export const SPECIAL_KINDS = ["supplementary", "practical", "laboratory", "revaluation", "other"];
export const NOTICE_TYPES = ["notification", "timetable", "guidelines", "result", "circular"];
export const SOURCES = ["explicit", "inferred", "missing"];

export const MAX_PDF_BYTES = 20 * 1024 * 1024;   // matches the exam-pdfs bucket limit
export const MAX_TIMETABLE_ROWS = 500;
export const REVIEW_CONFIDENCE = 0.8;            // below this, a value is flagged for the admin to check

// An extraction stuck in "processing" for longer than this is treated as dead and may be retried.
export const STALE_PROCESSING_MS = 8 * 60 * 1000;

// An instruction is stored as { text, page } when the AI fills it in, and as a plain string once a person saves it.
export const instructionText = (x) => (typeof x === "string" ? x : typeof x?.text === "string" ? x.text : "");
