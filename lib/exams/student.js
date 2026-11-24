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
