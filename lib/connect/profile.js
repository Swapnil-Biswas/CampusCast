import { cleanGitHub, cleanHttpsUrl, cleanLinkedIn } from "./links.js";

// Checks and tidies what a person saves in the Connect profile editor. The form is never trusted; the database
// enforces the same limits again. A bad value is refused with a message (see `errors`), not silently dropped.

// A profile is deliberately short and easy to scan: only the essentials, and only a few of each.
//   Everyone: headline, LinkedIn, GitHub.   Students: skills, interests, goal, key achievements.
//   Faculty: designation, research areas, main papers, and one short note on where their work is heading.
export const LIMITS = { headline: 120, goals: 240, career: 300, designation: 120, skill: 30, area: 60, title: 140, detail: 120, venue: 100 };
export const MAX = { skills: 8, interests: 5, achievements: 4, areas: 6, publications: 5 };

// Faculty pick their position from this list instead of typing it.
export const POSITIONS = ["Professor", "Associate Professor", "Assistant Professor", "Head of Department", "Professor and Head of Department", "Dean", "Principal", "Lecturer", "Visiting / Adjunct Faculty", "Lab Instructor"];

/** A written job title ("Assoc. Prof., Dept. of ISE") -> the position in the list it means, or "". */
export function matchPosition(v) {
  const s = String(v ?? "").toLowerCase().replace(/\./g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const exact = POSITIONS.find((p) => p.toLowerCase() === s);
  if (exact) return exact;
  const head = /\bhod\b|\bh o d\b|\bhead\b[^,]{0,20}\bdep|\bdep[a-z]* head\b/.test(s);
  if (head) return /(^|[^a-z])prof(essor)?\b/.test(s) && !/\b(assistant|associate|asst|assoc)\b/.test(s) ? "Professor and Head of Department" : "Head of Department";
  if (/\bdean\b/.test(s)) return "Dean";
  if (/\bprincipal\b(?! (investigator|scientist|engineer))/.test(s)) return "Principal";
  if (/\b(visiting|adjunct|guest)\b/.test(s)) return "Visiting / Adjunct Faculty";
  if (/\b(associate|assoc) prof/.test(s)) return "Associate Professor";
  if (/\b(assistant|asst) prof/.test(s)) return "Assistant Professor";
  if (/\blab(oratory)? instructor\b/.test(s)) return "Lab Instructor";
  if (/\blecturer\b/.test(s)) return "Lecturer";
  return /\bprof(essor)?\b/.test(s) ? "Professor" : "";
}

const text = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "");
const orNull = (s) => (s ? s : null);

// "react, python\nml" -> ["react", "python", "ml"] (lower-case, no duplicates)
export function cleanTags(v, maxItems, maxLen = LIMITS.skill) {
  const parts = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n]/) : [];
  const out = [];
  for (const p of parts) {
    const t = text(String(p), maxLen).toLowerCase().replace(/\s+/g, " ");
    if (t && !out.includes(t)) out.push(t);
  }
  return out.slice(0, maxItems);
}

const thisYear = () => new Date().getFullYear();
const yearOf = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return { ok: true, value: null };
  const n = Number(s);
  return Number.isInteger(n) && n >= 1950 && n <= thisYear() + 1 ? { ok: true, value: n } : { ok: false };
};

// A list typed one item per line in the form, or already an array of objects. Each item: { title, detail?, year?, venue?, url? }.
function items(raw, kind, errors) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  list.forEach((r, i) => {
    const n = i + 1;
    const title = text(r?.title, LIMITS.title);
    const detail = text(r?.detail, LIMITS.detail);
    const venue = text(r?.venue, LIMITS.venue);
    const urlRaw = typeof r?.url === "string" ? r.url.trim() : "";
    const yr = yearOf(r?.year);
    if (!title && !detail && !venue && !urlRaw && !String(r?.year ?? "").trim()) return;      // an empty row is just skipped
    if (!title) { errors.push(`${kind} ${n}: add a title.`); return; }
    if (!yr.ok) { errors.push(`${kind} ${n}: the year must be a year like 2024.`); return; }
    const item = { title };
    if (detail) item.detail = detail;
    if (venue && kind === "Paper") item.venue = venue;
    if (yr.value) item.year = yr.value;
    if (urlRaw) {
      const u = cleanHttpsUrl(urlRaw, `link of ${kind.toLowerCase()} ${n}`);
      if (!u.ok) { errors.push(`${kind} ${n}: ${u.error}`); return; }
      item.url = u.value;
    }
    out.push(item);
  });
  return out;
}

const over = (name, list, max, errors) => { if (list.length > max) errors.push(`At most ${max} ${name}.`); return list.slice(0, max); };

/**
 * @param input  { visible, showEmail, headline, skills, interests, goals, achievements, designation, researchAreas,
 *                 publications, career, linkedin, github }
 * @param opts   { faculty: boolean }  decides which fields are kept
 * @returns { ok: true, row } | { ok: false, errors: string[] }   row uses the database column names. Columns that are
 *          not part of a profile are emptied, so nothing the person can no longer see or edit stays behind.
 */
export function normalizeProfile(input, { faculty = false } = {}) {
  const i = input || {};
  const errors = [];
  const long = (key, name, max) => {
    const raw = typeof i[key] === "string" ? i[key].trim() : "";
    if (raw.length > max) errors.push(`${name} is too long (at most ${max} characters).`);
    return orNull(text(raw, max));
  };
  const link = (fn, raw) => { const r = fn(raw); if (!r.ok) { errors.push(r.error); return null; } return r.value; };

  const row = {
    visible: i.visible === true || i.visible === "on" || i.visible === "true",
    show_email: i.showEmail === true || i.showEmail === "on" || i.showEmail === "true",
    headline: long("headline", "The headline", LIMITS.headline),
    linkedin_url: link(cleanLinkedIn, i.linkedin),
    github_url: link(cleanGitHub, i.github),
    skills: [], interests: [], goals: null, achievements: [],
    designation: null, research_areas: [], publications: [], career: null,
    about: null, website_url: null, work: [], open_to: null,
  };
  if (faculty) {
    row.designation = orNull(text(i.designation, LIMITS.designation));
    if (row.designation && !POSITIONS.includes(row.designation)) errors.push("Choose your position from the list.");
    // Position and LinkedIn are the two things a faculty member has to give before the profile can be shown.
    if (row.visible && !row.designation) errors.push("Choose your position before showing your profile.");
    if (row.visible && !String(i.linkedin ?? "").trim()) errors.push("Add your LinkedIn link before showing your profile.");
    row.career = long("career", "Where your work is heading", LIMITS.career);
    row.research_areas = over("research areas", cleanTags(i.researchAreas, 100, LIMITS.area), MAX.areas, errors);
    row.publications = over("papers", items(i.publications, "Paper", errors), MAX.publications, errors);
  } else {
    row.goals = long("goals", "The goal", LIMITS.goals);
    row.skills = over("skills", cleanTags(i.skills, 100), MAX.skills, errors);
    row.interests = over("interests", cleanTags(i.interests, 100), MAX.interests, errors);
    row.achievements = over("achievements", items(i.achievements, "Achievement", errors), MAX.achievements, errors);
  }
  return errors.length ? { ok: false, errors } : { ok: true, row };
}

// The editor's one-item-per-line textarea format:  "Title | detail | year | https://link"  (paper: "Title | venue | year | link").
export function parseLines(text_, kind) {
  return String(text_ || "").split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const [title = "", second = "", year = "", url = ""] = line.split("|").map((x) => x.trim());
    return kind === "Paper" ? { title, venue: second, year, url } : { title, detail: second, year, url };
  });
}

export function formatLines(list, kind) {
  return (Array.isArray(list) ? list : []).map((x) => {
    const parts = kind === "Paper" ? [x.title, x.venue, x.year, x.url] : [x.title, x.detail, x.year];
    const cells = parts.map((p) => (p == null ? "" : String(p)));
    while (cells.length > 1 && !cells[cells.length - 1]) cells.pop();
    return cells.join(" | ");
  }).join("\n");
}

export const initials = (name) => String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
