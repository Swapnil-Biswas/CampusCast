import { CATEGORY_LABELS } from "./constants.js";

// Helpers for the student Examinations page. Pure, so they can be tested.
// The database already limits which published notices a student can read; these decide which timetable rows
// inside a notice are theirs, and how things are grouped and shown.

export const TAB_ORDER = ["ia1", "ia2", "ia3", "final", "special"];
export const TAB_LABELS = { ...CATEGORY_LABELS, special: "Special Examinations" };

/** Rows for the student's own department and semester. A row with no department or semester applies to everyone in the notice. */
export function rowsForStudent(entries, { branch, semester }) {
  return (entries || []).filter((e) => (!e.department || e.department === branch) && (e.semester == null || semester == null || e.semester === semester));
}

/** Which tab opens first: the requested one if it exists, else the first tab that has something, else IA 1. */
export function pickTab(requested, counts) {
  if (TAB_ORDER.includes(requested)) return requested;
  return TAB_ORDER.find((t) => counts[t] > 0) || TAB_ORDER[0];
}

export function countByCategory(notices) {
  const c = {};
  for (const n of notices) if (n.category) c[n.category] = (c[n.category] || 0) + 1;
  return c;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** "2026-03-10" -> "Tuesday". Works on the calendar date alone, so the viewer's time zone cannot shift it. */
export function dayName(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? DAYS[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()] : "";
}

/** "13:30:00" -> "1:30 PM" */
export function time12(t) {
  const m = /^(\d{2}):(\d{2})/.exec(String(t || ""));
  if (!m) return "";
  const h = +m[1];
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

export function timeRange(start, end) {
  const a = time12(start), b = time12(end);
  return a && b ? `${a} – ${b}` : a || b || "";
}

/** Dated rows first in date and time order, undated ones last. */
export function sortRows(rows) {
  return [...rows].sort((a, b) => {
    if (!a.exam_date !== !b.exam_date) return a.exam_date ? -1 : 1;
    return String(a.exam_date || "").localeCompare(String(b.exam_date || "")) || String(a.start_time || "").localeCompare(String(b.start_time || "")) || (a.sort ?? 0) - (b.sort ?? 0);
  });
}

/** Has every dated row of this notice already passed? (today is an ISO date) */
export function isOver(rows, today) {
  const dates = rows.map((r) => r.exam_date).filter(Boolean);
  return dates.length > 0 && dates.every((d) => d < today);
}

// ---------- countdown ----------
// Exam dates and times in notices are college-local (India), so they are read as Asia/Kolkata (+05:30), whatever the
// viewer's own time zone is. A row with no start time counts down to the start of that day.
export function examInstant(date, time) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ? date : null;
  if (!d) return null;
  const t = /^(\d{2}:\d{2})/.exec(String(time || ""));
  const ms = Date.parse(`${d}T${t ? t[1] : "00:00"}:00+05:30`);
  return Number.isNaN(ms) ? null : ms;
}

/** Today's date in India as YYYY-MM-DD. */
export function todayIST(nowMs = Date.now()) {
  return new Date(nowMs + 5.5 * 3600e3).toISOString().slice(0, 10);
}

/** ms -> { d, h, m, s } (never negative) */
export function splitDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(total / 86400), h: Math.floor((total % 86400) / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}

/**
 * The next exam that has not started yet (or is in progress), across rows that already belong to the student.
 * rows: [{ exam_date, start_time, end_time, subject_name, ... }]
 * @returns { row, startsAt, endsAt, hasTime } | null
 */
export function nextExam(rows, nowMs = Date.now()) {
  let best = null;
  for (const row of rows) {
    const startsAt = examInstant(row.exam_date, row.start_time);
    if (startsAt === null) continue;
    const endsAt = examInstant(row.exam_date, row.end_time) ?? (row.start_time ? startsAt + 3 * 3600e3 : startsAt + 24 * 3600e3);
    if (endsAt <= nowMs) continue;
    if (!best || startsAt < best.startsAt) best = { row, startsAt, endsAt, hasTime: Boolean(row.start_time) };
  }
  return best;
}

// ---------- soonest first ----------
/**
 * Orders exam notices so the one with the nearest coming exam is first. Notices whose exams are all over (or that have no
 * dates) follow, most recently finished first.
 * @param items [{ id, rows, publishedAt }]  rows are already the student's own
 * @returns the same items, sorted, each with .next (the nextExam result or null)
 */
export function sortNoticesSoonestFirst(items, nowMs = Date.now()) {
  const withNext = items.map((it) => ({ ...it, next: nextExam(it.rows, nowMs) }));
  const lastEnd = (it) => Math.max(0, ...it.rows.map((r) => examInstant(r.exam_date, r.end_time || r.start_time) ?? 0));
  return withNext.sort((a, b) => {
    if (!a.next !== !b.next) return a.next ? -1 : 1;                       // upcoming before finished
    if (a.next) return a.next.startsAt - b.next.startsAt;                    // nearest first
    return lastEnd(b) - lastEnd(a) || String(b.publishedAt || "").localeCompare(String(a.publishedAt || ""));
  });
}

// ---------- calendar ----------
/**
 * Timetable rows -> calendar items (the shape lib/dash/calendar.js uses). Only the student's own rows.
 * entries: rows from exam_timetable_entries with a .notice { category, title }.
 */
export function examAgendaItems(entries, { branch, semester }, labels = TAB_LABELS) {
  return rowsForStudent(entries, { branch, semester })
    .map((e) => {
      const at = examInstant(e.exam_date, e.start_time);
      if (at === null) return null;
      const end = examInstant(e.exam_date, e.end_time);
      const cat = e.notice?.category;
      return {
        key: "x" + e.id, kind: "exam", at: new Date(at).toISOString(), end: end ? new Date(end).toISOString() : null,
        title: `${cat ? labels[cat] + " · " : ""}${e.subject_name || "Examination"}${e.subject_code ? ` (${e.subject_code})` : ""}${e.start_time ? "" : " (time not stated)"}`,
        place: e.notice?.title || null, href: `/dashboard/exams?tab=${cat || "ia1"}`, mine: true, tag: e.session || "",
      };
    })
    .filter(Boolean);
}
