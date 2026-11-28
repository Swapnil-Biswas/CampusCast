import { EXAM_LABEL, FIRST_YEAR, cleanCourseCode, cleanCourseName } from "./constants.js";

// Turns the AI's answer into form values and decides whether the paper may be published without an admin.
// Nothing the model says is trusted blindly: every value is re-checked, unknown keys are dropped, and anything
// missing or doubtful sends the upload to a person.

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const key = (s) => String(s ?? "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const whole = (v, min, max) => {
  const n = typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v) : v;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};
const TYPES = ["question_paper", "notes", "answer_script", "other"];

/**
 * @param input        the AI's answer
 * @param departments  [{ name, code }] configured departments
 * @returns { ok: true, documentType, fields, passed, reasons } | { ok: false, error }
 *   fields: { courseCode, courseName, department, departmentKnown, semester, examType, examYear } (null = not read)
 *   reasons: plain-language reasons why an admin has to look first (empty when passed)
 */
export function normalizePaper(input, { departments = [], now = new Date() } = {}) {
  const raw = isObj(input) && isObj(input[Object.keys(input)[0]]) && Object.keys(input).length === 1 ? Object.values(input)[0] : input;
  if (!isObj(raw) || !TYPES.includes(raw.documentType)) return { ok: false, error: "The AI answer could not be understood." };

  const wanted = key(raw.department);
  const dept = wanted ? departments.find((d) => key(d.name) === wanted || key(d.code) === wanted)?.name || null : null;
  const common = raw.commonToAll === true && !dept;
  const fields = {
    courseCode: cleanCourseCode(raw.courseCode),
    courseName: cleanCourseName(raw.courseName),
    department: dept,
    departmentKnown: Boolean(dept) || common,
    semester: whole(raw.semester, 1, 8),
    examType: Object.hasOwn(EXAM_LABEL, raw.examType) ? raw.examType : null,
    examYear: whole(raw.examYear, FIRST_YEAR, now.getFullYear()),
  };

  const reasons = [];
  if (raw.documentType === "answer_script") reasons.push("It looks like a student's answers, not a question paper.");
  else if (raw.documentType !== "question_paper") reasons.push("It does not look like a question paper.");
  // anything but a clear "no" counts as possibly personal
  if (raw.containsPersonalData !== false) reasons.push("It may show a student's name, USN, signature or marks.");
  const missing = [["courseCode", "course code"], ["semester", "semester"], ["examType", "exam"], ["examYear", "year"]].filter(([k]) => fields[k] === null).map(([, label]) => label);
  if (missing.length) reasons.push(`The ${missing.join(", ")} could not be read from the paper.`);

  return { ok: true, documentType: raw.documentType, fields, passed: reasons.length === 0, reasons };
}
