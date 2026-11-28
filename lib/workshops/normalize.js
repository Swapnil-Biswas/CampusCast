import { REVIEW_CONFIDENCE, SOURCES } from "../exams/constants.js";
import { clean } from "../exams/normalize.js";
import { cleanEmail, cleanPhone, cleanUrl, matchClub, parseDateTime, parseRupees } from "../hackathons/normalize.js";

// Turns the AI's answer about a workshop poster into what CampusCast stores. Nothing the model says is trusted blindly:
// dates, seats, money, phone numbers, emails and links are re-checked, the club must be a configured one, strings are
// capped, unknown keys are dropped, and anything doubtful is left empty or flagged for the organiser to check.

export const DEFAULT_SEATS = 50;
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const empty = (v) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

function readField(obj, name) {
  const f = isObj(obj) ? obj[name] : null;
  const value = isObj(f) ? f.value : null;
  let source = isObj(f) && SOURCES.includes(f.source) ? f.source : empty(value) ? "missing" : "inferred";
  if (empty(value)) source = "missing";
  else if (source === "missing") source = "inferred";
  return {
    value: empty(value) ? null : value, source,
    confidence: empty(value) ? 0 : Math.min(1, Math.max(0, Number.isFinite(f.confidence) ? f.confidence : 0.5)),
    pages: isObj(f) && Array.isArray(f.pages) ? f.pages.filter((p) => Number.isInteger(p) && p >= 1 && p <= 5000).slice(0, 20) : [],
    evidence: isObj(f) ? clean(f.evidence, 240) : "",
  };
}
const listOf = (v, max, len) => (Array.isArray(v) ? v : []).map((x) => clean(typeof x === "string" ? x : "", len)).filter(Boolean).slice(0, max);

/**
 * @param raw  the tool input returned by the model
 * @returns { ok: true, result, fieldMeta, warnings, requiresReview } | { ok: false, error }
 */
export function normalizeWorkshop(raw, { clubs = [], filename = null, pageCount = null, now = new Date(), qrLinks = [] } = {}) {
  if (!isObj(raw) || !isObj(raw.workshop)) return { ok: false, error: "The AI did not return a workshop in the expected format." };
  const w = raw.workshop;
  const warnings = [];
  const warn = (f, code, message) => warnings.push({ field: f, code, message });
  const fieldMeta = {};
  // Records where a value came from. A value that could not be used counts as missing.
  const meta = (name, f, value, extraReview = false) => {
    const used = empty(value) ? { ...f, source: "missing", confidence: 0 } : f;
    fieldMeta[name] = {
      confidence: used.confidence, source: used.source, pages: used.pages, evidence: used.evidence,
      needsReview: extraReview || empty(value) || used.source !== "explicit" || used.confidence < REVIEW_CONFIDENCE,
    };
    return value;
  };
  const read = (name, make) => { const f = readField(w, name); return meta(name, f, make(f.value, f)); };
  const text = (name, max) => read(name, (v) => clean(v, max) || null);

  const name = read("name", (v) => { const s = clean(v, 140); return s.length >= 3 ? s : null; });
  const tagline = text("tagline", 160);
  const description = text("description", 2000);
  const venue = text("venue", 200);
  const speakerName = text("speakerName", 120);
  const speakerAbout = text("speakerAbout", 300);
  const eligibility = text("eligibility", 300);
  const prerequisites = text("prerequisites", 500);
  const feeNote = text("feeNote", 200);
  const contactName = text("contactName", 80);
  const topics = read("topics", (v) => listOf(v, 30, 160));
  const perks = read("perks", (v) => listOf(v, 20, 160));
  const organizerName = text("organizer", 120);

  const clubRaw = readField(w, "clubName");
  const club = matchClub(clubRaw.value ?? "", clubs) || (organizerName ? matchClub(organizerName, clubs) : null);
  if (clubRaw.value && !matchClub(clubRaw.value, clubs)) warn("clubName", "club_unrecognised", `"${clean(clubRaw.value, 60)}" is not one of the configured clubs.`);
  meta("clubName", clubRaw, club);

  const mode = read("mode", (v) => (["online", "offline", "hybrid"].includes(v) ? v : null));

  const dt = (key, fallbackTime) => {
    const f = readField(w, key);
    const p = parseDateTime(f.value, { dateOnlyTime: fallbackTime });
    if (f.value && !p) warn(key, "date_unreadable", `The ${key} could not be read as a date, so it was left empty.`);
    let iso = p ? `${p.date}T${p.time}:00+05:30` : null;
    if (p && !p.hasTime) warn(key, "time_not_stated", `No time is printed for the ${key}; ${fallbackTime === "23:59" ? "end of day (11:59 PM)" : "start of day (12:00 AM)"} was used. Please set the real time.`);
    if (p?.ambiguous) warn(key, "time_ambiguous", `The ${key} time ${p.time} could be morning or afternoon. Please check.`);
    if (iso) {                                   // a year that is far off is almost always a misread digit
      const t = new Date(iso).getTime(), n = now.getTime();
      if (t < n - 2 * 365 * 864e5 || t > n + 3 * 365 * 864e5) { warn(key, "date_out_of_range", `The ${key} (${p.date}) is far from today, so it was left empty.`); iso = null; }
    }
    meta(key, f, iso, Boolean(p && (!p.hasTime || p.ambiguous || p.converted)));
    return iso;
  };
  const startsAt = dt("startsAt", "00:00");
  let endsAt = dt("endsAt", "23:59");
  const deadline = dt("registrationDeadline", "23:59");
  if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) { warn("endsAt", "ends_before_start", "The end is before the start, so the end was left empty."); endsAt = null; fieldMeta.endsAt.needsReview = true; }

  const seats = read("seats", (v) => (Number.isInteger(v) && v >= 1 && v <= 5000 ? v : null));
  if (seats === null) warn("seats", "seats_not_stated", `No seat limit is printed, so ${DEFAULT_SEATS} seats were set. Please change it if needed.`);
  const feeRaw = readField(w, "feeAmount");
  const feeAmount = parseRupees(feeRaw.value);
  meta("feeAmount", feeRaw, feeAmount);

  const phoneRaw = readField(w, "contactPhone"), mailRaw = readField(w, "contactEmail");
  const contactPhone = cleanPhone(phoneRaw.value), contactEmail = cleanEmail(mailRaw.value);
  if (phoneRaw.value && !contactPhone) warn("contactPhone", "phone_unreadable", "The contact number did not look like a phone number, so it was left empty.");
  if (mailRaw.value && !contactEmail) warn("contactEmail", "email_unreadable", "The contact email did not look valid, so it was left empty.");
  meta("contactPhone", phoneRaw, contactPhone);
  meta("contactEmail", mailRaw, contactEmail);

  const links = {};
  for (const [key, label] of [["websiteUrl", "website"], ["registrationUrl", "registration link"], ["mapLink", "map link"]]) {
    const f = readField(w, key), u = cleanUrl(f.value);
    if (f.value && !u) warn(key, "link_unusable", `The ${label} was not a normal web address, so it was left empty.`);
    links[key] = meta(key, f, u);
  }
  // Links decoded from QR codes on the poster (not by the AI). A printed link is never replaced; each is flagged.
  const qrUrls = [...new Set((Array.isArray(qrLinks) ? qrLinks : []).map(cleanUrl).filter(Boolean))].slice(0, 3);
  const qrLabel = clean(readField(w, "qrCodeLabel").value, 80).toLowerCase();
  const wantsRegister = !qrLabel || /regist|apply|join|sign ?up|enrol|participate|form/.test(qrLabel);
  for (const u of qrUrls) {
    if (Object.values(links).includes(u)) continue;
    const order = wantsRegister ? ["registrationUrl", "websiteUrl"] : ["websiteUrl", "registrationUrl"];
    const key = order.find((k) => !links[k]);
    if (!key) break;
    links[key] = u;
    fieldMeta[key] = { confidence: 1, source: "explicit", pages: [1], evidence: "Read from the QR code on the poster", needsReview: true };
    warn(key, "qr_link_used", `The ${key === "registrationUrl" ? "registration link" : "website link"} was read from the QR code on the poster (${new URL(u).host}). Please open it and check it is the right page.`);
  }

  const kind = ["digital", "scanned", "mixed"].includes(raw.documentKind) ? raw.documentKind : null;
  const result = {
    name, tagline, description, topics, organizerName, clubName: club, speakerName, speakerAbout, mode, venue, mapUrl: links.mapLink,
    startsAt, endsAt, deadline, seats, feeAmount, feeNote, eligibility, prerequisites, perks,
    contactName, contactPhone, contactEmail, websiteUrl: links.websiteUrl, registrationUrl: links.registrationUrl, qrLinks: qrUrls,
    sourceDocument: { filename, pageCount, kind },
    extractionStatus: "completed", requiresReview: true, extractedAt: now.toISOString(),
  };
  return { ok: true, result, fieldMeta, warnings, requiresReview: true };
}
