import { CATEGORY_CODES, MAX_TIMETABLE_ROWS, NOTICE_TYPES, SPECIAL_KINDS } from "./constants.js";

// Server-side checks for what a department admin saves from the review screen. Pure functions: the browser's
// form is never trusted, and the database enforces the same rules again (CHECK constraints, RLS, triggers).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => UUID.test(String(v));

const text = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "");
const orNull = (s) => (s ? s : null);

export function isRealDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return false;
  const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return t.getUTCFullYear() === +m[1] && t.getUTCMonth() === +m[2] - 1 && t.getUTCDate() === +m[3];
}
// "09:30" or "09:30:00" -> "09:30", else null
export function timeOf(s) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(String(s || ""));
  return m ? `${m[1]}:${m[2]}` : null;
}

const list = (v, maxItems, maxLen) => (Array.isArray(v) ? v : []).map((x) => text(x, maxLen)).filter(Boolean).slice(0, maxItems);

/** @returns { ok: true, value } | { ok: false, errors: string[] }  value is ready for exam_notices.update() */
export function validateNotice(input, { allowedDepartments } = {}) {
  const errors = [];
  const i = input && typeof input === "object" ? input : {};

  const title = text(i.title, 200);
  if (title.length < 3) errors.push("Give the notice a title (at least 3 characters).");

  const noticeType = NOTICE_TYPES.includes(i.noticeType) ? i.noticeType : null;
  if (!noticeType) errors.push("Choose what kind of notice this is.");

  // Empty category = "requires admin review": allowed while drafting, blocked at submit by the database.
  let category = null;
  if (i.category) {
    if (!CATEGORY_CODES.includes(i.category)) errors.push("Unknown examination category.");
    else category = i.category;
  }
  let specialKind = null;
  if (category === "special" && i.specialKind) {
    if (!SPECIAL_KINDS.includes(i.specialKind)) errors.push("Unknown kind of special examination.");
    else specialKind = i.specialKind;
  }

  let semesters = null;
  if (Array.isArray(i.semesters) && i.semesters.length) {
    const s = [...new Set(i.semesters.map(Number))].sort((a, b) => a - b);
    if (s.some((n) => !Number.isInteger(n) || n < 1 || n > 8)) errors.push("Semesters must be between 1 and 8.");
    else semesters = s;
  }

  let academicYear = null;
  if (text(i.academicYear, 20)) {
    academicYear = text(i.academicYear, 20);
    const m = /^(\d{4})-(\d{2})$/.exec(academicYear);
    if (!m || (+m[1] + 1) % 100 !== +m[2]) errors.push("Academic year looks like 2026-27.");
  }

  let notificationDate = null;
  if (text(i.notificationDate, 12)) {
    if (!isRealDate(i.notificationDate)) errors.push("The notice date is not a real date.");
    else notificationDate = i.notificationDate;
  }

  let resultLink = null;
  if (text(i.resultLink, 500)) {
    resultLink = text(i.resultLink, 500);
    let ok = false;
    try { const u = new URL(resultLink); ok = u.protocol === "https:" || u.protocol === "http:"; } catch { ok = false; }
    if (!ok) errors.push("The result link must start with http:// or https://.");
  }

  // Who the notice is for can be narrowed or changed, but only to departments this admin manages.
  let audience;
  if (i.audienceDepts !== undefined) {
    audience = [...new Set((Array.isArray(i.audienceDepts) ? i.audienceDepts : []).filter((d) => typeof d === "string"))];
    if (!audience.length) errors.push("Choose at least one department.");
    else if (allowedDepartments && audience.some((d) => !allowedDepartments.includes(d))) errors.push("You can only choose departments you manage.");
  }

  const importantDates = (Array.isArray(i.importantDates) ? i.importantDates : []).slice(0, 50).map((d) => {
    const date = text(d?.date, 12);
    return { label: text(d?.label, 160), date: date && isRealDate(date) ? date : null, dateText: orNull(text(d?.dateText, 60)), page: Number.isInteger(d?.page) ? d.page : null };
  }).filter((d) => d.label || d.date);
  if ((Array.isArray(i.importantDates) ? i.importantDates : []).some((d) => text(d?.date, 12) && !isRealDate(text(d.date, 12)))) errors.push("One of the important dates is not a real date.");

  const ins = i.instructions && typeof i.instructions === "object" ? i.instructions : {};
  const instructions = {
    examination: list(ins.examination, 60, 600), hallTicket: list(ins.hallTicket, 60, 600), requiredDocuments: list(ins.requiredDocuments, 60, 600),
    important: list(ins.important, 60, 600), other: list(ins.other, 60, 600),
  };

  if (errors.length) return { ok: false, errors };
  const value = {
    title, notice_type: noticeType, category, special_kind: specialKind,
    original_exam_name: orNull(text(i.originalExamName, 120)), semesters, academic_year: academicYear,
    regulation: orNull(text(i.regulation, 80)), notification_date: notificationDate,
    degree_programme: text(i.degreeProgramme, 80) || "Bachelor's", result_link: resultLink,
  };
  if (audience) value.audience_depts = audience;
  return { ok: true, value, details: { importantDates, instructions } };
}

/** @returns { ok: true, rows } | { ok: false, errors: string[] }  rows are ready for exam_timetable_entries */
export function validateRows(input, { category = null, audience = [] } = {}) {
  const src = Array.isArray(input) ? input : [];
  if (src.length > MAX_TIMETABLE_ROWS) return { ok: false, errors: [`A timetable can have at most ${MAX_TIMETABLE_ROWS} rows.`] };
  const errors = [];
  const rows = src.map((r, idx) => {
    const n = idx + 1;
    const row = r && typeof r === "object" ? r : {};
    const subject = text(row.subjectName, 200);
    const date = text(row.examDate, 12);
    if (date && !isRealDate(date)) errors.push(`Row ${n}: the date is not a real date.`);
    const start = text(row.startTime, 8), end = text(row.endTime, 8), rep = text(row.reportingTime, 8);
    const st = start ? timeOf(start) : null, en = end ? timeOf(end) : null, rt = rep ? timeOf(rep) : null;
    if (start && !st) errors.push(`Row ${n}: the start time is not valid.`);
    if (end && !en) errors.push(`Row ${n}: the end time is not valid.`);
    if (rep && !rt) errors.push(`Row ${n}: the reporting time is not valid.`);
    if (st && en && en <= st) errors.push(`Row ${n}: the end time must be after the start time.`);
    let semester = null;
    if (row.semester !== null && row.semester !== undefined && row.semester !== "") {
      semester = Number(row.semester);
      if (!Number.isInteger(semester) || semester < 1 || semester > 8) { errors.push(`Row ${n}: the semester must be between 1 and 8.`); semester = null; }
    }
    const dept = text(row.department, 120);
    if (dept && audience.length && !audience.includes(dept)) errors.push(`Row ${n}: "${dept}" is not one of this notice's departments.`);
    return {
      id: isUuid(row.id) ? row.id : null,
      department: orNull(dept), semester, category,
      original_exam_name: orNull(text(row.originalExamName, 120)),
      subject_name: orNull(subject), subject_code: orNull(text(row.subjectCode, 40)),
      exam_date: date && isRealDate(date) ? date : null, start_time: st, end_time: en, reporting_time: rt,
      session: orNull(text(row.session, 40)), notes: orNull(text(row.notes, 500)),
      source_page: Number.isInteger(row.sourcePage) && row.sourcePage > 0 ? row.sourcePage : null,
      confidence: typeof row.confidence === "number" && row.confidence >= 0 && row.confidence <= 1 ? Math.round(row.confidence * 100) / 100 : null,
      needs_review: Boolean(row.needsReview),
      sort: idx,
    };
  });
  if (errors.length) return { ok: false, errors: errors.slice(0, 12) };
  return { ok: true, rows };
}
