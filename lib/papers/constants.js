// Shared by the browser and the server: what a question paper is described by.

export const EXAMS = [["ia1", "IA 1"], ["ia2", "IA 2"], ["ia3", "IA 3"], ["final", "Final"]];
export const EXAM_LABEL = Object.fromEntries(EXAMS);
export const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];
export const FIRST_YEAR = 2000;

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;   // the "notes" storage bucket limit
export const MAX_PHOTOS = 20;

export const OFFICE_MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** "bcs 304", "BCS-304" -> "BCS304"; null when it cannot be a course code (letters and digits, 4 to 12). */
export function cleanCourseCode(value) {
  const code = String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^(?=.*[A-Z])(?=.*\d)[A-Z0-9]{4,12}$/.test(code) ? code : null;
}

export const cleanCourseName = (value) => {
  const name = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 80).trim();
  return name.length >= 2 ? name : null;
};

// The stored title of a question paper. publish_checked_note() in dashboard-11-notes-papers.sql builds the same text.
export function paperTitle({ courseCode, courseName, examType, examYear }) {
  const course = [courseCode, courseName && courseName !== courseCode ? courseName : null].filter(Boolean).join(" ");
  return [course, EXAM_LABEL[examType], examYear].filter(Boolean).join(" · ");
}

/** A tidy name for the downloaded file, never the uploader's own file name. */
export function downloadName({ course_code, exam_type, exam_year, semester, title }, ext) {
  const parts = course_code ? [course_code, exam_type && EXAM_LABEL[exam_type].replace(" ", ""), exam_year, semester && `Sem${semester}`] : [title];
  const base = parts.filter(Boolean).join("_").replace(/[^\w-]+/g, "_").slice(0, 80) || "campuscast";
  return `${base}.${ext}`;
}
