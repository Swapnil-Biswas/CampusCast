import { CATEGORY_LABELS, MAX_TIMETABLE_ROWS, NOTICE_TYPES, REVIEW_CONFIDENCE, SOURCES, SPECIAL_KINDS } from "./constants.js";

// Turns the model's answer into the structure CampusCast stores. Nothing the model says is trusted blindly:
// dates and times are re-checked, categories are cross-checked against the PDF's own wording, departments must
// match the configured list, strings are cleaned and capped, unknown keys are dropped, and anything doubtful
// is left empty and flagged for the department admin. The result is always "requires review"; publishing
// is a separate, human step.

// ---------- small helpers ----------
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
export const clean = (v, max = 200) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const clamp01 = (v, d = 0.5) => Math.min(1, Math.max(0, num(v, d)));
const pageNo = (v) => (Number.isInteger(v) && v >= 1 && v <= 5000 ? v : null);
const pageList = (v) => (Array.isArray(v) ? [...new Set(v.map(pageNo).filter(Boolean))].slice(0, 20) : []);
const uniq = (a) => [...new Set(a)];

// ---------- dates and times ----------
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

function isoOf(y, m, d) {
  if (!(y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;   // rejects 31 Feb
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Returns { iso, converted } or null. ISO is accepted as is; other formats are read day-first (Indian notices)
// and reported as converted so the admin can check them.
export function parseDate(s) {
  const t = clean(s, 60);
  if (!t) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) { const iso = isoOf(+m[1], +m[2], +m[3]); return iso ? { iso, converted: false } : null; }
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})$/.exec(t);
  if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; const iso = isoOf(y, +m[2], +m[1]); return iso ? { iso, converted: true } : null; }
  m = /^(\d{1,2})(?:st|nd|rd|th)?[\s.-]+([A-Za-z]{3,9})\.?,?[\s.-]+(\d{4})$/.exec(t);
  if (m) { const mo = MONTHS[m[2].slice(0, 4).toLowerCase()] || MONTHS[m[2].slice(0, 3).toLowerCase()]; const iso = mo ? isoOf(+m[3], mo, +m[1]) : null; return iso ? { iso, converted: true } : null; }
  return null;
}

// Returns { time: "HH:MM", ambiguous } or null. 24-hour is expected; 12-hour with am/pm is converted.
// A bare hour from 1 to 6 with no am/pm could be morning or afternoon, so it is flagged.
export function parseTime(s) {
  const t = clean(s, 20);
  const m = /^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([ap])\.?m\.?$|^(\d{1,2})[:.](\d{2})(?::\d{2})?$/i.exec(t);
  if (!m) return null;
  let h = +(m[1] ?? m[4]);
  const min = +(m[2] ?? m[5]);
  const mer = (m[3] || "").toLowerCase();
  if (min > 59) return null;
  if (mer) { if (h < 1 || h > 12) return null; h = (h % 12) + (mer === "p" ? 12 : 0); }
  else if (h > 23) return null;
  const ambiguous = !mer && h >= 1 && h <= 6;
  return { time: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`, ambiguous };
}

const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8 };
const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8 };
export function parseSemester(v) {
  if (Number.isInteger(v)) return v >= 1 && v <= 8 ? v : null;
  const t = clean(String(v ?? ""), 20).toLowerCase().replace(/^(\d)(?:st|nd|rd|th)$/, "$1");   // "3rd" -> "3", but not "fourth"
  const n = /^\d$/.test(t) ? +t : ORD[t] ?? ROMAN[t] ?? null;
  return n >= 1 && n <= 8 ? n : null;
}

export function normalizeAcademicYear(v) {
  const m = /(\d{4})\s*[-–/]\s*(\d{4}|\d{2})/.exec(clean(String(v ?? ""), 30));   // four digits first, or "2027" would be read as "20"
  if (!m) return null;
  const y = +m[1], second = m[2].length === 4 ? +m[2] % 100 : +m[2];
  if (y < 2000 || y > 2100 || second !== (y + 1) % 100) return null;   // "2026-27" only; anything else needs a person
  return `${y}-${String(second).padStart(2, "0")}`;
}

// ---------- category ----------
const N = { "1": 1, i: 1, one: 1, first: 1, "1st": 1, "2": 2, ii: 2, two: 2, second: 2, "2nd": 2, "3": 3, iii: 3, three: 3, third: 3, "3rd": 3 };

// What the PDF's own wording says, independent of the model. Returns { category, specialKind } or null.
// Special examinations are recognised first so that "Supplementary SEE" or "SEE practical" can never become Final.
export function detectCategory(text) {
  const original = clean(text, 400);
  const t = original.toLowerCase();
  if (!t) return null;
  if (/supplementary|backlog|arrear|re-?exam|make[- ]?up exam/.test(t)) return { category: "special", specialKind: "supplementary" };
  if (/re-?valuation|scrutiny|photocopy/.test(t)) return { category: "special", specialKind: "revaluation" };
  if (/practical/.test(t)) return { category: "special", specialKind: "practical" };
  if (/laborator|\blab\b/.test(t)) return { category: "special", specialKind: "laboratory" };
  let m = /\b(?:cie|ia|internals?|internal assessment|internal test|continuous internal evaluation)[\s\-–:.]*(?:no\.?\s*)?(1st|2nd|3rd|[123]|iii|ii|i|one|two|three)\b/.exec(t);
  if (m) return { category: `ia${N[m[1]]}`, specialKind: null };
  m = /\b(first|second|third|1st|2nd|3rd)\s+(?:internal|cie|ia\b)/.exec(t);
  if (m) return { category: `ia${N[m[1]]}`, specialKind: null };
  // "SEE" only counts in capitals: the plain word "see" ("please see the attached") must never make a notice Final.
  if (/\bSEE\b/.test(original) || /semester[- ]end|end[- ]?semester|final (?:exam|examination)/.test(t)) return { category: "final", specialKind: null };
  return null;
}

// ---------- departments ----------
const compact = (s) => clean(String(s ?? ""), 120).toLowerCase().replace(/&/g, "").replace(/\band\b/g, "").replace(/[^a-z0-9]+/g, "");

// departments: [{ name, code }] from the database. Returns the department's name, or null.
// Notices spell departments many ways ("Artificial Intelligence and Machine Learning", "AIML", "Dept. of CSE").
// Both sides are reduced to the same key before comparing: "&" and "and", filler words, "Engineering" and spacing
// disappear, and "Artificial Intelligence" becomes "AI".
const deptKey = (s) => clean(String(s ?? ""), 120).toLowerCase()
  .replace(/&/g, " and ")
  .replace(/artificial\s+intelligence/g, " ai ")
  .replace(/\b(department|dept|branch|of|the|engineering|and)\b/g, " ")
  .replace(/[^a-z0-9]+/g, "");

export function matchDepartment(text, departments) {
  // The model sometimes answers "Name (CODE)". Try the whole text first, then the name and the code separately.
  const paren = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(clean(String(text ?? ""), 120));
  const direct = matchOne(text, departments);
  if (direct || !paren) return direct;
  return matchOne(paren[1], departments) || matchOne(paren[2], departments);
}

function matchOne(text, departments) {
  const c = compact(text), k = deptKey(text);
  if (!c) return null;
  for (const d of departments) if (compact(d.name) === c || compact(d.code) === c) return d.name;
  if (!k) return null;
  const hits = departments.filter((d) => deptKey(d.name) === k || deptKey(d.code) === k);
  return hits.length === 1 ? hits[0].name : null;   // an ambiguous short form is left for a person to decide
}

// ---------- the main entry point ----------
function readField(notice, name) {
  const f = isObj(notice) ? notice[name] : null;
  const value = isObj(f) ? f.value : null;
  const empty = value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
  let source = isObj(f) && SOURCES.includes(f.source) ? f.source : empty ? "missing" : "inferred";
  if (empty) source = "missing";
  else if (source === "missing") source = "inferred";   // the AI contradicted itself: keep the value but treat it as a guess
  return {
    value: empty ? null : value,
    source,
    confidence: empty ? 0 : clamp01(isObj(f) ? f.confidence : null),
    pages: isObj(f) ? pageList(f.pages) : [],
    evidence: isObj(f) ? clean(f.evidence, 240) : "",
  };
}

const textList = (v, max = 40) =>
  (Array.isArray(v) ? v : [])
    .map((x) => (typeof x === "string" ? { text: clean(x, 600), page: null } : isObj(x) ? { text: clean(x.text, 600), page: pageNo(x.page) } : null))
    .filter((x) => x && x.text)
    .slice(0, max);

/**
 * @param raw  the tool input returned by the model
 * @param opts { departments: [{name, code}], filename, pageCount, now }
 * @returns { ok: true, result, fieldMeta, warnings, requiresReview } | { ok: false, error }
 */
export function normalizeExtraction(raw, { departments = [], filename = null, pageCount = null, now = new Date() } = {}) {
  if (!isObj(raw) || !isObj(raw.notice)) return { ok: false, error: "The AI did not return a notice in the expected format." };

  const warnings = [];
  const warn = (field, code, message) => warnings.push({ field, code, message });
  const fieldMeta = {};
  const meta = (name, f, value) => {
    fieldMeta[name] = {
      confidence: f.confidence, source: f.source, pages: f.pages, evidence: f.evidence,
      needsReview: value === null || value === undefined || (Array.isArray(value) && !value.length) || f.source !== "explicit" || f.confidence < REVIEW_CONFIDENCE,
    };
  };
  const nf = (name) => readField(raw.notice, name);

  // --- timetable rows (read first: they help decide the notice type) ---
  const rows = [];
  const rawRows = Array.isArray(raw.timetable) ? raw.timetable.slice(0, MAX_TIMETABLE_ROWS) : [];
  if (Array.isArray(raw.timetable) && raw.timetable.length > MAX_TIMETABLE_ROWS) warn("timetable", "row_limit", `Only the first ${MAX_TIMETABLE_ROWS} timetable rows were kept.`);
  rawRows.forEach((r, i) => {
    if (!isObj(r)) return;
    const issues = [];
    const subjectName = clean(r.subjectName, 200) || null;
    const subjectCode = clean(r.subjectCode, 30).toUpperCase() || null;
    const date = parseDate(r.examDate) || parseDate(r.dateText);
    if (!date) issues.push(clean(r.dateText, 60) || r.examDate ? "date could not be read" : "no date");
    else if (date.converted) issues.push("date converted from the written form");
    const st = parseTime(r.startTime), en = parseTime(r.endTime), rep = parseTime(r.reportingTime);
    if (clean(r.startTime, 20) && !st) issues.push("start time could not be read");
    if (clean(r.endTime, 20) && !en) issues.push("end time could not be read");
    if (st?.ambiguous || en?.ambiguous) issues.push("time may be AM or PM");
    let start = st?.time ?? null, end = en?.time ?? null;
    if (start && end && end <= start) { issues.push("end time is not after start time"); end = null; }
    if (!subjectName) issues.push("no subject");
    const dept = r.department ? matchDepartment(r.department, departments) : null;
    if (clean(r.department, 120) && !dept) issues.push("department not recognised");
    const confidence = clamp01(r.confidence, 0.5);
    rows.push({
      subjectName, subjectCode,
      department: dept,
      semester: parseSemester(r.semester),
      originalExamName: clean(r.originalExamName, 200) || null,
      examDate: date?.iso ?? null,
      dateText: clean(r.dateText, 60) || null,
      startTime: start, endTime: end,
      session: clean(r.session, 30) || null,
      reportingTime: rep?.time ?? null,
      notes: clean(r.notes, 300) || null,
      page: pageNo(r.page),
      confidence,
      needsReview: confidence < REVIEW_CONFIDENCE || issues.length > 0,
      issues,
    });
  });
  const rowsNeedingReview = rows.filter((r) => r.needsReview).length;
  if (rowsNeedingReview) warn("timetable", "rows_need_review", `${rowsNeedingReview} of ${rows.length} timetable row(s) need checking.`);

  // --- notice fields ---
  const fTitle = nf("title");
  const title = clean(fTitle.value, 200);
  const titleValue = title.length >= 3 ? title : null;
  meta("title", titleValue ? fTitle : { ...fTitle, source: "missing", confidence: 0 }, titleValue);

  const fType = nf("noticeType");
  let noticeType = NOTICE_TYPES.includes(fType.value) ? fType.value : null;
  if (!noticeType) {
    noticeType = rows.length ? "timetable" : "notification";
    fType.source = "inferred"; fType.confidence = Math.min(fType.confidence, 0.5);
    warn("noticeType", "inferred", `Notice type was not stated; assumed "${noticeType}".`);
  }
  meta("noticeType", fType, noticeType);

  const fOrig = nf("originalExamName");
  const originalExamName = clean(fOrig.value, 200) || null;
  meta("originalExamName", fOrig, originalExamName);

  // category: the PDF's own wording is checked against what the model said
  const fCat = nf("category");
  const modelCat = typeof fCat.value === "string" && CATEGORY_LABELS[fCat.value] ? fCat.value : null;
  const detected = detectCategory([originalExamName, titleValue, ...rows.map((r) => r.originalExamName)].filter(Boolean).join(" | "));
  let category = null, specialKind = null;
  if (detected?.category === "special") {
    category = "special"; specialKind = detected.specialKind;
    if (modelCat && modelCat !== "special") warn("category", "special_kept_separate", `The wording suggests a ${detected.specialKind} examination, so it was not classified as ${CATEGORY_LABELS[modelCat]}.`);
  } else if (detected && modelCat && detected.category !== modelCat && modelCat !== "special") {
    warn("category", "conflict", `The notice wording suggests ${CATEGORY_LABELS[detected.category]} but the AI chose ${CATEGORY_LABELS[modelCat]}. Please choose.`);
  } else if (detected) {
    category = detected.category;
  } else if (modelCat === "special") {
    // "Special Examination" is only ever set from the notice's own wording (supplementary, practical, laboratory,
    // revaluation). An AI label alone is not enough: a placement circular, for example, is not an examination.
    warn("category", "special_no_evidence", "The AI called this a special examination, but the notice does not say it is supplementary, practical, laboratory or a revaluation, so the category was left empty.");
  } else if (modelCat && (fCat.source === "explicit" || (fCat.source === "inferred" && fCat.evidence))) {
    category = modelCat;
  } else if (modelCat) {
    warn("category", "no_evidence", "The AI suggested a category without evidence in the PDF, so it was left empty.");
  }
  if (category === "special") {
    const k = SPECIAL_KINDS.includes(fieldValue(nf("specialKind"))) ? nf("specialKind").value : null;
    specialKind = specialKind ?? k;
  }
  if (!category) warn("category", "requires_review", "Requires admin review: the PDF does not make the examination category clear.");
  meta("category", category && category === modelCat ? fCat : { ...fCat, source: category ? (detected ? "inferred" : fCat.source) : "missing", confidence: category ? Math.min(fCat.confidence || 0.7, 0.9) : 0 }, category);
  if (category && detected && category !== modelCat) fieldMeta.category.needsReview = true;

  // departments must come from the configured list
  const fDept = nf("departments");
  const asWritten = Array.isArray(fDept.value) ? fDept.value.map((d) => clean(d, 120)).filter(Boolean).slice(0, 12) : [];
  const matchedDepts = uniq(asWritten.map((d) => matchDepartment(d, departments)).filter(Boolean));
  const unmatched = asWritten.filter((d) => !matchDepartment(d, departments));
  if (unmatched.length) warn("departments", "unrecognised", `Department not recognised: ${unmatched.join(", ")}.`);
  meta("departments", fDept, matchedDepts);

  const fSem = nf("semesters");
  const semesters = uniq((Array.isArray(fSem.value) ? fSem.value : []).map(parseSemester).filter(Boolean)).sort((a, b) => a - b);
  meta("semesters", fSem, semesters);

  const fAy = nf("academicYear");
  const academicYear = normalizeAcademicYear(fAy.value);
  if (fAy.value && !academicYear) warn("academicYear", "unreadable", `Academic year "${clean(String(fAy.value), 30)}" could not be read as YYYY-YY.`);
  meta("academicYear", fAy, academicYear);

  const fReg = nf("regulation");
  const regulation = clean(fReg.value, 80) || null;
  meta("regulation", fReg, regulation);

  const fDeg = nf("degreeProgramme");
  const degRaw = clean(fDeg.value, 80);
  const degreeProgramme = !degRaw ? null : /\b(b\.?\s?e\.?|b\.?\s?tech|bachelor|undergraduate|ug)\b/i.test(degRaw) ? "Bachelor's" : degRaw;
  meta("degreeProgramme", fDeg, degreeProgramme);

  const fDate = nf("notificationDate");
  const nd = parseDate(fDate.value);
  if (fDate.value && !nd) warn("notificationDate", "unreadable", `Notice date "${clean(String(fDate.value), 40)}" could not be read.`);
  if (nd?.converted) fDate.source = "inferred";
  meta("notificationDate", fDate, nd?.iso ?? null);

  // --- dates, instructions ---
  const importantDates = (Array.isArray(raw.importantDates) ? raw.importantDates : []).slice(0, 50).filter(isObj).map((d) => {
    const p = parseDate(d.date) || parseDate(d.dateText);
    return { label: clean(d.label, 160), date: p?.iso ?? null, dateText: clean(d.dateText, 60) || null, page: pageNo(d.page) };
  }).filter((d) => d.label || d.date);
  const ins = isObj(raw.instructions) ? raw.instructions : {};
  const instructions = {
    examination: textList(ins.examination), hallTicket: textList(ins.hallTicket), requiredDocuments: textList(ins.requiredDocuments),
    important: textList(ins.important), other: textList(ins.other),
  };

  // rows inherit the notice's category; the department falls back to the notice's single department
  for (const r of rows) {
    r.category = category;
    if (!r.department && matchedDepts.length === 1) r.department = matchedDepts[0];
  }

  const kind = ["digital", "scanned", "mixed"].includes(raw.documentKind) ? raw.documentKind : null;
  const examDates = uniq(rows.map((r) => r.examDate).filter(Boolean)).sort();
  const result = {
    title: titleValue,
    examinationCategory: category ? CATEGORY_LABELS[category] : null,
    categoryCode: category,
    specialKind,
    originalExaminationName: originalExamName,
    noticeType,
    degreeProgramme,
    departments: matchedDepts,
    departmentsAsWritten: asWritten,
    semesters,
    academicYear,
    regulation,
    notificationDate: nd?.iso ?? null,
    importantDates,
    examinationDates: examDates,
    subjects: uniq(rows.filter((r) => r.subjectName).map((r) => JSON.stringify([r.subjectName, r.subjectCode]))).map((s) => { const [name, code] = JSON.parse(s); return { name, code }; }),
    timetable: rows,
    instructions,
    sourceDocument: { filename, pageCount, kind },
    extractionStatus: "completed",
    requiresReview: true,
    extractedAt: now.toISOString(),
  };
  return { ok: true, result, fieldMeta, warnings, requiresReview: true };
}

// readField's value for a name, without mutating anything (used for the optional specialKind hint)
function fieldValue(f) { return f?.value; }
