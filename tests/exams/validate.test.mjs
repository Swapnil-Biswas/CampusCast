import test from "node:test";
import assert from "node:assert/strict";
import { isRealDate, timeOf, validateNotice, validateRows } from "../../lib/exams/validate.js";

const AIML = "AI & Machine Learning";
const CSE = "Computer Science & Engineering";
const good = (over = {}) => ({ title: "Time Table for CIE 2", noticeType: "timetable", category: "ia2", semesters: [4, 2], academicYear: "2026-27", notificationDate: "2026-03-05", audienceDepts: [AIML], ...over });
const row = (over = {}) => ({ subjectName: "Data Structures", examDate: "2026-03-10", startTime: "09:30", endTime: "11:00", department: AIML, semester: 4, ...over });

test("dates must be real and times must be valid 24-hour times", () => {
  assert.equal(isRealDate("2026-02-28"), true);
  assert.equal(isRealDate("2026-02-31"), false);
  assert.equal(isRealDate("10/03/2026"), false);
  assert.equal(timeOf("09:30"), "09:30");
  assert.equal(timeOf("09:30:00"), "09:30");
  assert.equal(timeOf("24:00"), null);
  assert.equal(timeOf("9:30"), null);
});

test("a good notice passes and is cleaned up", () => {
  const r = validateNotice(good({ title: "  Time Table for CIE 2  " }), { allowedDepartments: [AIML] });
  assert.equal(r.ok, true);
  assert.equal(r.value.title, "Time Table for CIE 2");
  assert.deepEqual(r.value.semesters, [2, 4]);
  assert.equal(r.value.category, "ia2");
  assert.deepEqual(r.value.audience_depts, [AIML]);
});

test("an empty category is allowed while drafting (requires admin review)", () => {
  const r = validateNotice(good({ category: "" }));
  assert.equal(r.ok, true);
  assert.equal(r.value.category, null);
});

test("an unknown category or kind of notice is refused", () => {
  assert.equal(validateNotice(good({ category: "midterm" })).ok, false);
  assert.equal(validateNotice(good({ noticeType: "memo" })).ok, false);
});

test("a special kind is only kept for special examinations", () => {
  assert.equal(validateNotice(good({ category: "ia1", specialKind: "supplementary" })).value.special_kind, null);
  assert.equal(validateNotice(good({ category: "special", specialKind: "supplementary" })).value.special_kind, "supplementary");
  assert.equal(validateNotice(good({ category: "special", specialKind: "bogus" })).ok, false);
});

test("bad titles, years, dates, semesters and links are refused", () => {
  assert.equal(validateNotice(good({ title: "ab" })).ok, false);
  assert.equal(validateNotice(good({ academicYear: "2026-30" })).ok, false);
  assert.equal(validateNotice(good({ academicYear: "2026-27" })).ok, true);
  assert.equal(validateNotice(good({ notificationDate: "2026-02-31" })).ok, false);
  assert.equal(validateNotice(good({ semesters: [9] })).ok, false);
  assert.equal(validateNotice(good({ resultLink: "javascript:alert(1)" })).ok, false);
  assert.equal(validateNotice(good({ resultLink: "https://results.example.edu/x" })).ok, true);
});

test("an admin cannot aim a notice at a department they do not manage", () => {
  const r = validateNotice(good({ audienceDepts: [AIML, CSE] }), { allowedDepartments: [AIML] });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /manage/);
  assert.equal(validateNotice(good({ audienceDepts: [] })).ok, false);
});

test("important dates and guideline lists are trimmed, capped, and bad dates are refused", () => {
  const r = validateNotice(good({ importantDates: [{ label: "Fee deadline", date: "2026-03-01" }, { label: "", date: "" }], instructions: { hallTicket: ["  Carry ID ", "", "x".repeat(900)] } }));
  assert.equal(r.ok, true);
  assert.equal(r.details.importantDates.length, 1);
  assert.equal(r.details.instructions.hallTicket[0], "Carry ID");
  assert.equal(r.details.instructions.hallTicket[1].length, 600);
  assert.equal(validateNotice(good({ importantDates: [{ label: "x", date: "2026-13-01" }] })).ok, false);
});

test("timetable rows are validated and take the notice's category", () => {
  const r = validateRows([row(), row({ subjectName: "DBMS", startTime: "14:00:00", endTime: "15:30" })], { category: "ia2", audience: [AIML] });
  assert.equal(r.ok, true);
  assert.equal(r.rows[1].start_time, "14:00");
  assert.equal(r.rows[0].category, "ia2");
  assert.deepEqual(r.rows.map((x) => x.sort), [0, 1]);
});

test("timetable rows with impossible values are refused with the row number", () => {
  const bad = (over, re) => { const r = validateRows([row(), row(over)], { audience: [AIML] }); assert.equal(r.ok, false); assert.match(r.errors[0], re); };
  bad({ examDate: "2026-02-30" }, /Row 2.*date/);
  bad({ startTime: "25:00" }, /Row 2.*start/);
  bad({ endTime: "08:00" }, /Row 2.*after/);
  bad({ semester: 9 }, /Row 2.*semester/);
  bad({ department: CSE }, /Row 2/);
});

test("a row may be incomplete while drafting (the database blocks submitting it)", () => {
  const r = validateRows([{ subjectName: "", examDate: "" }], { audience: [AIML] });
  assert.equal(r.ok, true);
  assert.equal(r.rows[0].subject_name, null);
  assert.equal(r.rows[0].exam_date, null);
});

test("row ids must be real ids, and too many rows are refused", () => {
  assert.equal(validateRows([row({ id: "not-a-uuid" })]).rows[0].id, null);
  assert.equal(validateRows([row({ id: "3f0c1c52-0000-4000-8000-000000000001" })]).rows[0].id, "3f0c1c52-0000-4000-8000-000000000001");
  assert.equal(validateRows(Array.from({ length: 501 }, () => row())).ok, false);
});
