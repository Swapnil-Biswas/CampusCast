import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { getDocumentProxy } from "unpdf";
import { cleanCourseCode, cleanCourseName, downloadName, paperTitle } from "../../lib/papers/constants.js";
import { imagesToPdf } from "../../lib/papers/image-pdf.js";
import { normalizePaper } from "../../lib/papers/normalize.js";
import { readPaper, sha256 } from "../../lib/papers/read.js";
import { PAPER_TASK } from "../../lib/papers/task.js";
import { sniffFile } from "../../lib/exams/pdf.js";

const DEPTS = [{ name: "Computer Science & Engineering", code: "CSE" }, { name: "AI & Machine Learning", code: "AI&ML" }];
const NOW = new Date("2026-11-28T10:00:00+05:30");
const good = {
  documentType: "question_paper", courseCode: "bcs 304", courseName: "Data Structures", department: "CSE", commonToAll: false,
  semester: 3, examType: "ia1", examYear: 2026, containsPersonalData: false,
};
const norm = (over = {}) => normalizePaper({ ...good, ...over }, { departments: DEPTS, now: NOW });

test("course codes are written one way", () => {
  assert.equal(cleanCourseCode(" bcs-304 "), "BCS304");
  assert.equal(cleanCourseCode("21CS51"), "21CS51");
  for (const bad of ["", "304", "DATA", "AB1", "ABCDEFGH123456", null]) assert.equal(cleanCourseCode(bad), null, String(bad));
  assert.equal(cleanCourseName("  Data   Structures "), "Data Structures");
  assert.equal(cleanCourseName("x"), null);
});

test("titles and download names", () => {
  assert.equal(paperTitle({ courseCode: "BCS304", courseName: "Data Structures", examType: "ia1", examYear: 2026 }), "BCS304 Data Structures · IA 1 · 2026");
  assert.equal(paperTitle({ courseCode: "BCS304", courseName: null, examType: "final", examYear: 2025 }), "BCS304 · Final · 2025");
  assert.equal(downloadName({ course_code: "BCS304", exam_type: "ia2", exam_year: 2026, semester: 3 }, "pdf"), "BCS304_IA2_2026_Sem3.pdf");
  assert.equal(downloadName({ title: "Unit 2: Trees / graphs" }, "docx"), "Unit_2_Trees_graphs.docx");
});

test("a clear question paper passes the check", () => {
  const r = norm();
  assert.equal(r.passed, true);
  assert.deepEqual(r.reasons, []);
  assert.deepEqual(r.fields, { courseCode: "BCS304", courseName: "Data Structures", department: "Computer Science & Engineering", departmentKnown: true, semester: 3, examType: "ia1", examYear: 2026 });
});

test("common subjects, unknown departments and wrapped answers", () => {
  const common = norm({ department: null, commonToAll: true });
  assert.deepEqual([common.fields.department, common.fields.departmentKnown], [null, true]);
  const unknown = norm({ department: "Astrology" });
  assert.deepEqual([unknown.fields.department, unknown.fields.departmentKnown, unknown.passed], [null, false, true]);
  assert.equal(normalizePaper({ record_study_document: good }, { departments: DEPTS, now: NOW }).passed, true);
});

test("anything doubtful goes to an admin", () => {
  for (const over of [
    { documentType: "answer_script" }, { documentType: "notes" }, { documentType: "other" },
    { containsPersonalData: true }, { containsPersonalData: undefined }, { containsPersonalData: "false" },
    { courseCode: null }, { courseCode: "???" }, { semester: 9 }, { semester: null }, { examType: "ia4" }, { examType: null }, { examYear: 2031 }, { examYear: 1990 },
  ]) {
    const r = norm(over);
    assert.equal(r.passed, false, JSON.stringify(over));
    assert.ok(r.reasons.length >= 1, JSON.stringify(over));
  }
  for (const bad of [null, "text", [], {}, { documentType: "approved" }]) assert.equal(normalizePaper(bad, { departments: DEPTS }).ok, false);
});

test("the AI is told that the document is not to be obeyed", () => {
  assert.match(PAPER_TASK.system, /untrusted/i);
  assert.equal(PAPER_TASK.tool.input_schema.additionalProperties, false);
});

const photo = async (width, height) => ({ jpeg: new Uint8Array(await sharp({ create: { width, height, channels: 3, background: "#ccc" } }).jpeg().toBuffer()), width, height });

test("photos become one readable PDF, a page each", async () => {
  const pdf = imagesToPdf([await photo(600, 800), await photo(800, 600), await photo(100, 100)]);
  const sniff = sniffFile(Buffer.from(pdf));
  assert.deepEqual([sniff.ok, sniff.kind, sniff.pageCount], [true, "pdf", 3]);
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  assert.equal(doc.numPages, 3);
  const view = (await doc.getPage(2)).view;
  assert.deepEqual([view[2], view[3]], [595, 446]);
  assert.ok((await (await doc.getPage(1)).getOperatorList()).fnArray.length > 0);
  assert.throws(() => imagesToPdf([]));
});

// ---------- reading a stored file ----------
const fakeSupabase = (bytes) => ({
  storage: { from: () => ({ download: async () => ({ data: new Blob([bytes]), error: null }) }) },
  from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: DEPTS }) }) }) }),
});
const gemini = (answer) => async () => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(answer) }] } }] }), { status: 200 });
const providers = [{ provider: "gemini", apiKey: "test", model: "gemini-test" }];

test("reading saves the check with the file's fingerprint, only through the server client", async () => {
  const bytes = Buffer.from(imagesToPdf([await photo(200, 300)]));
  const saved = [];
  const admin = { from: (table) => ({ upsert: async (row) => { saved.push([table, row]); return { error: null }; } }) };
  const args = { supabase: fakeSupabase(bytes), userId: "u1", path: "u1/f.pdf", filename: "f.pdf", providers, fetchImpl: gemini(good), now: NOW };

  const out = await readPaper({ ...args, admin });
  assert.deepEqual([out.ok, out.instant, out.fields.courseCode], [true, true, "BCS304"]);
  assert.equal(saved[0][0], "note_checks");
  assert.deepEqual([saved[0][1].path, saved[0][1].uploader_id, saved[0][1].passed, saved[0][1].sha256], ["u1/f.pdf", "u1", true, sha256(bytes)]);

  const without = await readPaper({ ...args, admin: null });
  assert.deepEqual([without.ok, without.instant, saved.length], [true, false, 1]);

  const broken = { from: () => ({ upsert: async () => ({ error: { message: "no table" } }) }) };
  const log = console.error; console.error = () => {};
  try { assert.equal((await readPaper({ ...args, admin: broken })).instant, false); } finally { console.error = log; }
});

test("a file that is not a PDF is never sent to the AI", async () => {
  let called = 0;
  const out = await readPaper({ supabase: fakeSupabase(Buffer.from("hello")), admin: null, userId: "u1", path: "u1/f.pdf", providers, fetchImpl: async () => { called++; } });
  assert.deepEqual([out.ok, called], [false, 0]);
});
