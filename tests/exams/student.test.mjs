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

import { examInstant, nextExam, splitDuration, todayIST } from "../../lib/exams/student.js";

test("exam times are read as India time, wherever the viewer is", () => {
  assert.equal(examInstant("2026-03-10", "09:30:00"), Date.UTC(2026, 2, 10, 4, 0));   // 09:30 IST = 04:00 UTC
  assert.equal(examInstant("2026-03-10", null), Date.UTC(2026, 2, 9, 18, 30));         // start of day IST
  assert.equal(examInstant("nonsense", "09:30"), null);
  assert.equal(examInstant(null, "09:30"), null);
});

test("a duration is split into days, hours, minutes and seconds, never below zero", () => {
  assert.deepEqual(splitDuration(((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000), { d: 2, h: 3, m: 4, s: 5 });
  assert.deepEqual(splitDuration(59_999), { d: 0, h: 0, m: 0, s: 59 });
  assert.deepEqual(splitDuration(-5000), { d: 0, h: 0, m: 0, s: 0 });
});

test("today is worked out in India time", () => {
  assert.equal(todayIST(Date.UTC(2026, 2, 9, 19, 0)), "2026-03-10");   // 00:30 IST next day
  assert.equal(todayIST(Date.UTC(2026, 2, 9, 12, 0)), "2026-03-09");
});

test("the next exam is the earliest one that has not finished", () => {
  const rows = [
    { id: "past", exam_date: "2026-03-01", start_time: "09:30", end_time: "11:00" },
    { id: "later", exam_date: "2026-03-12", start_time: "09:30", end_time: "11:00" },
    { id: "soon", exam_date: "2026-03-10", start_time: "14:00", end_time: "15:30" },
    { id: "nodate", exam_date: null, start_time: "09:00" },
  ];
  const now = Date.UTC(2026, 2, 5, 0, 0);
  assert.equal(nextExam(rows, now).row.id, "soon");
  assert.equal(nextExam(rows, now).hasTime, true);
  assert.equal(nextExam(rows, Date.UTC(2026, 2, 20)), null);
});

test("an exam in progress still counts as next until it ends", () => {
  const rows = [{ id: "now", exam_date: "2026-03-10", start_time: "09:30", end_time: "11:00" }];
  assert.equal(nextExam(rows, examInstant("2026-03-10", "10:00")).row.id, "now");
  assert.equal(nextExam(rows, examInstant("2026-03-10", "11:00")), null);
});

test("a row with no time counts down to the start of its day and lasts that day", () => {
  const rows = [{ id: "x", exam_date: "2026-03-10" }];
  const n = nextExam(rows, examInstant("2026-03-09", "12:00"));
  assert.equal(n.hasTime, false);
  assert.equal(n.startsAt, examInstant("2026-03-10", null));
  assert.equal(nextExam(rows, examInstant("2026-03-11", "01:00")), null);
});

import { examAgendaItems, sortNoticesSoonestFirst } from "../../lib/exams/student.js";

const row = (date, start, extra = {}) => ({ id: `${date}-${start}`, exam_date: date, start_time: start, end_time: start ? `${String(+start.slice(0, 2) + 1).padStart(2, "0")}:00` : null, ...extra });
const NOW = examInstant("2026-11-25", "12:00");

test("notices are ordered by their nearest coming exam, soonest first", () => {
  const out = sortNoticesSoonestFirst([
    { id: "far", rows: [row("2026-12-20", "10:00")] },
    { id: "near", rows: [row("2026-11-27", "10:00"), row("2026-12-05", "10:00")] },
    { id: "mid", rows: [row("2026-12-01", "10:00")] },
  ], NOW);
  assert.deepEqual(out.map((x) => x.id), ["near", "mid", "far"]);
});

test("finished notices come after upcoming ones, the most recently finished first", () => {
  const out = sortNoticesSoonestFirst([
    { id: "old", rows: [row("2026-10-01", "10:00")] },
    { id: "recent", rows: [row("2026-11-20", "10:00")] },
    { id: "upcoming", rows: [row("2026-12-30", "10:00")] },
    { id: "nodates", rows: [], publishedAt: "2026-11-01" },
  ], NOW);
  assert.deepEqual(out.map((x) => x.id), ["upcoming", "recent", "old", "nodates"]);
});

test("a notice whose only upcoming exam is later today still counts as upcoming", () => {
  const out = sortNoticesSoonestFirst([{ id: "done", rows: [row("2026-11-24", "10:00")] }, { id: "today", rows: [row("2026-11-25", "15:00")] }], NOW);
  assert.deepEqual(out.map((x) => x.id), ["today", "done"]);
});

test("exam rows become calendar items for the student's own department and semester only", () => {
  const A = "AI & Machine Learning";
  const entries = [
    { id: "1", department: A, semester: 3, subject_name: "Data Structures", subject_code: "1BA1305", exam_date: "2026-11-27", start_time: "09:30:00", end_time: "11:00:00", session: "FN", notice: { category: "ia1", title: "IA 1 circular" } },
    { id: "2", department: "Computer Science & Engineering", semester: 3, subject_name: "Other", exam_date: "2026-11-27", start_time: "09:30", notice: { category: "ia1" } },
    { id: "3", department: A, semester: 5, subject_name: "Other sem", exam_date: "2026-11-27", start_time: "09:30", notice: { category: "ia1" } },
    { id: "4", department: A, semester: 3, subject_name: "No time", exam_date: "2026-11-28", start_time: null, notice: { category: "final" } },
    { id: "5", department: A, semester: 3, subject_name: "No date", exam_date: null, start_time: "10:00", notice: { category: "ia1" } },
  ];
  const items = examAgendaItems(entries, { branch: A, semester: 3 });
  assert.deepEqual(items.map((i) => i.key), ["x1", "x4"]);
  assert.equal(items[0].kind, "exam");
  assert.equal(items[0].title, "IA 1 · Data Structures (1BA1305)");
  assert.equal(items[0].at, "2026-11-27T04:00:00.000Z");          // 09:30 IST
  assert.equal(items[0].end, "2026-11-27T05:30:00.000Z");
  assert.equal(items[0].href, "/dashboard/exams?tab=ia1");
  assert.match(items[1].title, /Final Examination · No time \(time not stated\)/);
});
