import { cleanGitHub, cleanHttpsUrl, cleanLinkedIn } from "./links.js";

// Checks and tidies what a person saves in the Connect profile editor. The form is never trusted; the database
// enforces the same limits again. A bad value is refused with a message (see `errors`), not silently dropped.

export const LIMITS = { headline: 120, about: 1200, goals: 800, career: 1200, openTo: 400, designation: 120, skill: 40, area: 80, title: 140, detail: 400, venue: 140 };
export const MAX = { skills: 20, interests: 20, achievements: 15, areas: 15, publications: 30, work: 15 };

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
 * @param input  { visible, showEmail, headline, about, skills, interests, goals, achievements, designation, researchAreas,
 *                 publications, work, career, openTo, linkedin, github, website }
 * @param opts   { faculty: boolean }  faculty-only fields are ignored for students (the database empties them too)
 * @returns { ok: true, row } | { ok: false, errors: string[] }   row uses the database column names
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
    about: long("about", "About", LIMITS.about),
    goals: long("goals", "Goals", LIMITS.goals),
    skills: over("skills", cleanTags(i.skills, 100), MAX.skills, errors),
    interests: over("interests", cleanTags(i.interests, 100), MAX.interests, errors),
    achievements: over("achievements", items(i.achievements, "Achievement", errors), MAX.achievements, errors),
    linkedin_url: link(cleanLinkedIn, i.linkedin),
    github_url: link(cleanGitHub, i.github),
    website_url: link((v) => cleanHttpsUrl(v, "website link"), i.website),
    designation: null, research_areas: [], publications: [], work: [], career: null, open_to: null,
  };
  if (faculty) {
    row.designation = long("designation", "Designation", LIMITS.designation);
    row.career = long("career", "Career path", LIMITS.career);
    row.open_to = long("openTo", "Open to", LIMITS.openTo);
    row.research_areas = over("research areas", cleanTags(i.researchAreas, 100, LIMITS.area), MAX.areas, errors);
    row.publications = over("papers", items(i.publications, "Paper", errors), MAX.publications, errors);
    row.work = over("related work items", items(i.work, "Work", errors), MAX.work, errors);
  }
  return errors.length ? { ok: false, errors } : { ok: true, row };
}

// The editor's one-item-per-line textarea format:  "Title | detail | year | https://link"  (paper: "Title | venue | year | link").
export function parseLines(text_, kind) {
  return String(text_ || "").split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const [title = "", second = "", year = "", url = ""] = line.split("|").map((x) => x.trim());
    return kind === "Paper" ? { title, venue: second, year, url } : kind === "Work" ? { title, detail: second, year: "", url: year || url } : { title, detail: second, year, url };
  });
}

export function formatLines(list, kind) {
  return (Array.isArray(list) ? list : []).map((x) => {
    const parts = kind === "Paper" ? [x.title, x.venue, x.year, x.url] : kind === "Work" ? [x.title, x.detail, x.url] : [x.title, x.detail, x.year];
    const cells = parts.map((p) => (p == null ? "" : String(p)));
    while (cells.length > 1 && !cells[cells.length - 1]) cells.pop();
    return cells.join(" | ");
  }).join("\n");
}

export const initials = (name) => String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
