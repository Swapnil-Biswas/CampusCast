import { cleanGitHub, cleanHttpsUrl, cleanLinkedIn } from "./links.js";
import { LIMITS, MAX, cleanTags, formatLines } from "./profile.js";
import { hasPrivate, redact } from "./redact.js";

// Turns the AI's answer (and the GitHub facts) into a DRAFT for the profile editor. Nothing is trusted: each field is
// checked on its own, so one bad value never empties the whole form. What is doubtful is left out and said so, and
// everything that is filled in is marked for the person to check. Nothing here is saved to a profile.
//
// A draft is { fields: { <form field>: { value, flag } }, notes: [..] }. Values are what the form holds (text, or
// one item per line). flag: "read" (written in the sources) or "check" (worked out, or could not be confirmed).

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\|/g, "/").replace(/\s+/g, " ").trim().slice(0, max) : "");
// Letters and digits only, so line breaks, hyphenation and punctuation in a PDF do not hide a match.
const squash = (v) => String(v ?? "").normalize("NFKD").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const FACULTY_FIELDS = ["designation", "researchAreas", "publications", "work", "career", "openTo"];
export const FIELD_LABELS = {
  headline: "Headline", about: "About", skills: "Skills", interests: "Interests", goals: "Goals", achievements: "Achievements",
  designation: "Designation", researchAreas: "Research areas", publications: "Research papers", work: "Related work", career: "Career path", openTo: "Open to",
  linkedin: "LinkedIn", github: "GitHub", website: "Website",
};

/**
 * @param raw   the AI's structured answer, or null if the AI could not be used
 * @param opts  { faculty, sourceText: all text that was read, verifiable: true when EVERY source was text,
 *                github: result of fetchGitHub or null, linkedinUrl: the link the person already saved or null }
 */
export function buildDraft(raw, { faculty = false, sourceText = "", verifiable = false, github = null } = {}) {
  const fields = {}, notes = [];
  const note = (m) => { if (!notes.includes(m)) notes.push(m); };
  const haystack = squash(sourceText);
  const written = (v) => !!squash(v) && haystack.includes(squash(v));
  // A link must be written out in full: a shortened or cut-off address that merely begins the same does not count.
  const linkWritten = (v) => {
    const bare = String(v).trim().replace(/^https?:\/\/(www\.)?/i, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
    if (!bare) return false;
    return new RegExp(`${bare.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=/?(?:$|[\\s)\\],;>"'|?#]|\\.(?:\\s|$)))`, "i").test(sourceText);
  };
  const p = isObj(raw?.profile) ? raw.profile : {};
  const wrap = (k) => (isObj(p[k]) ? p[k] : { value: p[k], source: "inferred" });
  const flagOf = (f) => (f.source === "explicit" && !(Number(f.confidence) < 0.75) ? "read" : "check");
  const put = (key, value, flag) => { if (value) fields[key] = { value, flag }; };
  const privacy = (label) => note(`Private details were left out of ${label}.`);
  const clean = (v, max, label) => {
    const s = str(v, max * 2);
    if (!s) return "";
    if (!hasPrivate(s)) return s.slice(0, max);
    privacy(label);
    return redact(s).replace(/\s+/g, " ").trim().slice(0, max);
  };
  // One field at a time: a surprise in one must not stop the others.
  const safely = (key, fn) => { try { fn(); } catch { note(`${FIELD_LABELS[key]} could not be read.`); } };

  for (const [key, max] of [["headline", LIMITS.headline], ["about", LIMITS.about], ["goals", LIMITS.goals], ["designation", LIMITS.designation], ["career", LIMITS.career], ["openTo", LIMITS.openTo]]) {
    if (!faculty && FACULTY_FIELDS.includes(key)) continue;
    safely(key, () => { const f = wrap(key); if (f.source !== "missing") put(key, clean(f.value, max, FIELD_LABELS[key]), flagOf(f)); });
  }

  for (const [key, maxItems, maxLen] of [["skills", MAX.skills, LIMITS.skill], ["interests", MAX.interests, LIMITS.skill], ["researchAreas", MAX.areas, LIMITS.area]]) {
    if (!faculty && FACULTY_FIELDS.includes(key)) continue;
    safely(key, () => {
      const f = wrap(key);
      const tags = cleanTags((Array.isArray(f.value) ? f.value : []).filter((t) => typeof t === "string" && !hasPrivate(t)).map((t) => t.replace(/[,|]/g, " ")), maxItems, maxLen);
      put(key, tags.join(", "), flagOf(f));
    });
  }

  for (const [key, kind, maxItems] of [["achievements", "Achievement", MAX.achievements], ["publications", "Paper", MAX.publications], ["work", "Work", MAX.work]]) {
    if (faculty ? key === "achievements" : key !== "achievements") continue;
    safely(key, () => {
      const f = wrap(key);
      const out = [];
      let unconfirmed = 0, dropped = 0;
      for (const r of Array.isArray(f.value) ? f.value : []) {
        const title = clean(r?.title, LIMITS.title, FIELD_LABELS[key]);
        if (!title) continue;
        // A paper must really be in the documents. When they were all text we can prove it; a made-up one is dropped.
        if (kind === "Paper" && verifiable && !written(title)) { dropped++; continue; }
        if (!verifiable) unconfirmed++;
        const item = { title };
        const detail = clean(r?.detail, LIMITS.detail, FIELD_LABELS[key]);
        let venue = clean(r?.venue, LIMITS.venue, FIELD_LABELS[key]);
        let year = Number(r?.year);
        if (kind === "Paper" && verifiable) {
          if (venue && !written(venue)) venue = "";
          if (!sourceText.includes(String(year))) year = NaN;
        }
        if (detail) item.detail = detail;
        if (venue) item.venue = venue;
        if (Number.isInteger(year) && year >= 1950 && year <= new Date().getFullYear() + 1) item.year = year;
        if (typeof r?.url === "string" && r.url.trim()) {
          const u = cleanHttpsUrl(r.url);
          if (u.ok && u.value && linkWritten(r.url)) item.url = u.value;
          else note(`A link in ${FIELD_LABELS[key]} was left out because it could not be confirmed as a secure address written in your documents.`);
        }
        out.push(item);
      }
      if (dropped) note(`${dropped} paper${dropped > 1 ? "s were" : " was"} left out because the title could not be found in your documents.`);
      if (unconfirmed && kind === "Paper") note("Your document was read as a picture, so compare every paper title with the original.");
      if (out.length > maxItems) note(`Only the first ${maxItems} ${FIELD_LABELS[key].toLowerCase()} were kept.`);
      put(key, formatLines(out.slice(0, maxItems), kind), verifiable && kind === "Paper" ? "read" : flagOf(f));
    });
  }

  for (const [key, from, fn] of [["linkedin", "linkedinUrl", cleanLinkedIn], ["github", "githubUrl", cleanGitHub], ["website", "websiteUrl", (v) => cleanHttpsUrl(v, "website")]]) {
    safely(key, () => {
      const f = wrap(from);
      const value = typeof f.value === "string" ? f.value.trim() : "";
      if (!value) return;
      const u = fn(value);
      if (u.ok && u.value && (!verifiable || linkWritten(value))) put(key, u.value, verifiable ? "read" : "check");
      else note(`The ${FIELD_LABELS[key]} link in your documents could not be used.`);
    });
  }

  // GitHub facts come straight from GitHub's API, not from the AI.
  if (github) {
    fields.github = { value: github.url, flag: "read" };
    safely("skills", () => {
      const have = (fields.skills?.value || "").split(",").map((s) => s.trim()).filter(Boolean);
      const all = cleanTags([...have, ...github.languages], MAX.skills);
      if (all.length) fields.skills = { value: all.join(", "), flag: fields.skills?.flag || "read" };
    });
    safely("website", () => {
      if (fields.website || !github.website) return;
      const u = cleanHttpsUrl(github.website);
      if (u.ok && u.value) fields.website = { value: u.value, flag: "check" };
    });
  }

  return { fields, notes };
}

// ---------- putting a draft into the form without overwriting what the person wrote ----------
const LISTS = { skills: ",", interests: ",", researchAreas: ",", achievements: "\n", publications: "\n", work: "\n" };
const parts = (key, v) => String(v || "").split(LISTS[key]).map((s) => s.trim()).filter(Boolean);

/** What adding the draft's items to the existing ones gives (no duplicates; for lines, compared by title). */
export function mergeList(key, current, incoming) {
  const id = (s) => squash(LISTS[key] === "\n" ? s.split("|")[0] : s);
  const have = parts(key, current);
  const seen = new Set(have.map(id));
  const add = parts(key, incoming).filter((s) => !seen.has(id(s)));
  return [...have, ...add].join(LISTS[key] === "," ? ", " : "\n");
}
export const isList = (key) => key in LISTS;

/**
 * Empty form fields are filled; a field the person already has is NOT touched, it becomes a suggestion.
 * @returns { values, filled: { key: flag }, suggestions: { key: { value, flag } } }
 */
export function applyDraft(current, draft) {
  const values = { ...current }, filled = {}, suggestions = {};
  for (const [key, f] of Object.entries(draft?.fields || {})) {
    if (typeof current[key] !== "string" || typeof f?.value !== "string" || !f.value.trim()) continue;
    const now = String(current[key] ?? "").trim();
    if (!now) { values[key] = f.value; filled[key] = f.flag; }
    else if (isList(key) ? mergeList(key, now, f.value) !== mergeList(key, now, "") : squash(now) !== squash(f.value)) suggestions[key] = f;
  }
  return { values, filled, suggestions };
}
