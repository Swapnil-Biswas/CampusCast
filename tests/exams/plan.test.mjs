import test from "node:test";
import assert from "node:assert/strict";
import { normalizeExtraction } from "../../lib/exams/normalize.js";
import { planApply } from "../../lib/exams/plan.js";
import { DEPTS, F, goodRaw, noWordingRaw, row } from "./fixtures.mjs";

const AIML = "AI & Machine Learning", CSE = "Computer Science & Engineering";
const norm = (raw = goodRaw()) => normalizeExtraction(raw, { departments: DEPTS, filename: "n.pdf", pageCount: 2 });
const draft = (over = {}) => ({ id: "n1", title: "notice", status: "draft", audience_depts: [AIML], degree_programme: "Bachelor's", details: {}, ...over });
const plan = (notice = draft(), n = norm(), opts = {}) => planApply(notice, n, { extractionId: "x1", ...opts });

test("the first extraction fills the draft notice and timetable rows", () => {
  const p = plan();
  assert.equal(p.skip, undefined);
  const n = p.noticePatch;
  assert.equal(n.title, "Time Table for CIE 2 Examinations");
  assert.equal(n.category, "ia2");
  assert.equal(n.original_exam_name, "CIE 2");
  assert.deepEqual(n.semesters, [2]);
  assert.equal(n.academic_year, "2026-27");
  assert.equal(n.notice_type, "timetable");
  assert.equal(n.notification_date, "2026-11-20");
  assert.equal(n.details.extraction.autofilled, true);
  assert.equal(n.details.extraction.extractionId, "x1");
  assert.equal(n.details.extraction.requiresReview, true);
  assert.equal(n.details.instructions.examination[0].text, "Carry the college ID card.");
  assert.equal(p.entries.length, 2);
  const e = p.entries[0];
  assert.deepEqual([e.notice_id, e.subject_name, e.subject_code, e.exam_date, e.start_time, e.end_time, e.category, e.semester, e.department, e.sort],
    ["n1", "Data Structures", "21CS32", "2026-12-10", "10:00", "11:30", "ia2", 2, AIML, 0]);
  assert.equal(e.original_exam_name, "CIE 2");
});

test("it never touches who the notice is for, or its status", () => {
  const p = plan(draft({ audience_depts: [CSE] }));
  assert.equal("audience_depts" in p.noticePatch, false);
  assert.equal("status" in p.noticePatch, false);
  assert.equal("published_at" in p.noticePatch, false);
});

test("a PDF for another department than the one chosen raises a warning", () => {
  const p = plan(draft({ audience_depts: [CSE] }));
  assert.ok(p.warnings.some((w) => w.code === "department_mismatch" && w.message.includes(AIML)));
  assert.ok(p.noticePatch.details.extraction.warnings.some((w) => w.code === "department_mismatch"));
  assert.ok(p.entries.every((e) => e.needs_review), "rows for a department the notice is not set up for are flagged");
  assert.ok(p.warnings.some((w) => w.code === "rows_outside_audience"));
});

test("a second extraction does not overwrite what the admin already has", () => {
  const filled = draft({ details: { extraction: { autofilled: true } } });
  assert.deepEqual(plan(filled), { skip: true });
});

test("re-applying on purpose is possible", () => {
  const filled = draft({ details: { extraction: { autofilled: true } } });
  const p = plan(filled, norm(), { force: true, hasEntries: true });
  assert.equal(p.skip, undefined);
  assert.equal(p.entries.length, 2);
});

test("existing timetable rows are never duplicated", () => {
  const p = plan(draft(), norm(), { hasEntries: true });
  assert.equal(p.entries.length, 0);
  assert.equal(p.noticePatch.category, "ia2");
});

test("empty extracted values do not erase what is already there", () => {
  const n = norm(goodRaw({ regulation: { value: null, source: "missing", confidence: 0, pages: [], evidence: "" }, academicYear: { value: null, source: "missing", confidence: 0, pages: [], evidence: "" } }));
  const p = plan(draft(), n);
  assert.equal("regulation" in p.noticePatch, false);
  assert.equal("academic_year" in p.noticePatch, false);
});

test("an unclear category is left out, so the notice stays 'requires admin review'", () => {
  const p = plan(draft(), norm(noWordingRaw()));
  assert.equal("category" in p.noticePatch, false);
  assert.ok(p.entries.every((e) => e.category === null));
});

test("special kind is only written for special examinations", () => {
  const sp = norm(goodRaw({ originalExamName: F("Supplementary SEE"), category: F("final"), title: F("Supplementary SEE") }));
  const p = plan(draft(), sp);
  assert.equal(p.noticePatch.category, "special");
  assert.equal(p.noticePatch.special_kind, "supplementary");
  const normal = plan();
  assert.equal("special_kind" in normal.noticePatch, false);
});

test("rows without their own semester take the notice's only semester; rows keep their review flags", () => {
  const raw = { ...goodRaw(), timetable: [row({ semester: null }), row({ confidence: 0.3 })] };
  const p = plan(draft(), norm(raw));
  assert.equal(p.entries[0].semester, 2);
  assert.equal(p.entries[0].needs_review, false);
  assert.equal(p.entries[1].needs_review, true);
  assert.equal(p.entries[1].confidence, 0.3);
});

test("existing details on the notice are kept", () => {
  const p = plan(draft({ details: { custom: "keep me" } }));
  assert.equal(p.noticePatch.details.custom, "keep me");
});
