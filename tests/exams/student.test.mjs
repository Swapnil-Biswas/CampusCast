import test from "node:test";
import assert from "node:assert/strict";
import { countByCategory, dayName, isOver, pickTab, rowsForStudent, sortRows, time12, timeRange } from "../../lib/exams/student.js";

const AIML = "AI & Machine Learning";
const CSE = "Computer Science & Engineering";

test("a student only sees timetable rows for their own department and semester", () => {
  const rows = [
    { id: 1, department: AIML, semester: 4 }, { id: 2, department: CSE, semester: 4 }, { id: 3, department: AIML, semester: 6 },
    { id: 4, department: null, semester: null }, { id: 5, department: AIML, semester: null },
  ];
  assert.deepEqual(rowsForStudent(rows, { branch: AIML, semester: 4 }).map((r) => r.id), [1, 4, 5]);
});

test("when the student's semester is unknown, rows are not hidden by semester", () => {
  const rows = [{ id: 1, department: AIML, semester: 4 }, { id: 2, department: AIML, semester: 6 }];
  assert.equal(rowsForStudent(rows, { branch: AIML, semester: null }).length, 2);
});

test("the first tab with content opens by default, and a valid request wins", () => {
  assert.equal(pickTab(undefined, { ia2: 1, final: 2 }), "ia2");
  assert.equal(pickTab("final", { ia2: 1 }), "final");
  assert.equal(pickTab("bogus", { ia3: 1 }), "ia3");
  assert.equal(pickTab(undefined, {}), "ia1");
});

test("notices without a category are not counted under any tab", () => {
  assert.deepEqual(countByCategory([{ category: "ia1" }, { category: "ia1" }, { category: null }, { category: "final" }]), { ia1: 2, final: 1 });
});

test("day names come from the calendar date, not the time zone", () => {
  assert.equal(dayName("2026-03-10"), "Tuesday");
  assert.equal(dayName("2026-03-01"), "Sunday");
  assert.equal(dayName("nonsense"), "");
});

test("times are shown in 12-hour form", () => {
  assert.equal(time12("09:30:00"), "9:30 AM");
  assert.equal(time12("00:15"), "12:15 AM");
  assert.equal(time12("12:00"), "12:00 PM");
  assert.equal(time12("13:30"), "1:30 PM");
  assert.equal(timeRange("09:30", "11:00"), "9:30 AM – 11:00 AM");
  assert.equal(timeRange("09:30", null), "9:30 AM");
  assert.equal(timeRange(null, null), "");
});

test("rows sort by date then time, with undated rows last", () => {
  const out = sortRows([{ id: "c", exam_date: null }, { id: "b", exam_date: "2026-03-12", start_time: "09:00" }, { id: "a2", exam_date: "2026-03-10", start_time: "14:00" }, { id: "a1", exam_date: "2026-03-10", start_time: "09:00" }]);
  assert.deepEqual(out.map((r) => r.id), ["a1", "a2", "b", "c"]);
});

test("a notice is over only when every dated row is in the past", () => {
  assert.equal(isOver([{ exam_date: "2026-03-10" }, { exam_date: "2026-03-12" }], "2026-03-13"), true);
  assert.equal(isOver([{ exam_date: "2026-03-10" }, { exam_date: "2026-03-12" }], "2026-03-12"), false);
  assert.equal(isOver([], "2026-03-13"), false);
});
