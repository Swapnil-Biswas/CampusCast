import { REVIEW_CONFIDENCE, SOURCES } from "../exams/constants.js";
import { clean, parseDate, parseTime } from "../exams/normalize.js";

// Turns the AI's answer about a hackathon poster into what CampusCast stores. Nothing the model says is trusted
// blindly: dates, times, money, phone numbers, emails and links are re-checked and cleaned, the club must be one of
// the configured clubs, strings are capped, unknown keys are dropped, and anything doubtful is left empty or flagged
// for the club admin. The result always "requires review": publishing is a separate, human step.

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const clamp01 = (v, d = 0.5) => Math.min(1, Math.max(0, num(v, d)));
const pageNo = (v) => (Number.isInteger(v) && v >= 1 && v <= 5000 ? v : null);
const pageList = (v) => (Array.isArray(v) ? [...new Set(v.map(pageNo).filter(Boolean))].slice(0, 20) : []);

export const MAX_SCHEDULE = 100;
export const MAX_PRIZES = 20;

// ---------- one field with its provenance ----------
function readField(obj, name) {
  const f = isObj(obj) ? obj[name] : null;
  const value = isObj(f) ? f.value : null;
  const empty = value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
  let source = isObj(f) && SOURCES.includes(f.source) ? f.source : empty ? "missing" : "inferred";
  if (empty) source = "missing";
  else if (source === "missing") source = "inferred";
  return {
    value: empty ? null : value, source,
    confidence: empty ? 0 : clamp01(isObj(f) ? f.confidence : null),
    pages: isObj(f) ? pageList(f.pages) : [], evidence: isObj(f) ? clean(f.evidence, 240) : "",
  };
}

// ---------- dates and times (India time) ----------
const IST = "+05:30";

/** "2026-12-12 09:00", "12/12/2026 9:30 AM", "12 Dec 2026" -> { date, time, hasTime, converted, ambiguous } or null. */
export function parseDateTime(value, { dateOnlyTime = "00:00" } = {}) {
  const raw = clean(value, 80).replace(/T(?=\d)/, " ");
  if (!raw) return null;
  const tm = /(\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?|\d{1,2}(?:\.\d{2})?\s*[ap]\.?m\.?)/i.exec(raw);
  const datePart = (tm ? raw.replace(tm[1], " ") : raw).replace(/\b(at|on|from|onwards|hrs|hours|ist)\b/gi, " ").replace(/[,]+/g, " ").replace(/\s+/g, " ").trim();
  const d = parseDate(datePart);
  if (!d) return null;
  let time = null, ambiguous = false;
  if (tm) {
    const t = tm[1].replace(/^(\d{1,2})\s*([ap]\.?m\.?)$/i, "$1:00 $2");
    const p = parseTime(t);
    if (p) { time = p.time; ambiguous = p.ambiguous; }
  }
  return { date: d.iso, time: time || dateOnlyTime, hasTime: Boolean(time), converted: d.converted, ambiguous };
}
const toIso = (date, time) => `${date}T${time}:00${IST}`;
const istDate = (iso) => new Date(new Date(iso).getTime() + 5.5 * 3600e3).toISOString().slice(0, 10);
const addDays = (date, n) => new Date(new Date(`${date}T00:00:00Z`).getTime() + n * 86400e3).toISOString().slice(0, 10);

// ---------- money ----------
/** 1,00,000 / "Rs. 50,000" / "1 lakh" / "50K" / "free" -> rupees (number), or null if it is not clearly an amount. */
export function parseRupees(v) {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 && v <= 1e9 ? Math.round(v * 100) / 100 : null;
  const t = clean(typeof v === "string" ? v : "", 60).toLowerCase();
  if (!t) return null;
  if (/^(free|nil|no fee|zero)$/.test(t)) return 0;
  const m = /^(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d+)?)\s*(lakhs?|lacs?|k|thousand|crores?|cr)?\s*(?:\/-|only)?$/.exec(t.replace(/\s+/g, " "));
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const unit = m[2] || "";
  if (/^lakh|^lac/.test(unit)) n *= 1e5; else if (/^k$|thousand/.test(unit)) n *= 1e3; else if (/^cr/.test(unit)) n *= 1e7;
  return n >= 0 && n <= 1e9 ? Math.round(n * 100) / 100 : null;
}

// ---------- contact details and links ----------
/** The first thing that looks like a phone number, reduced to digits, + ( ) - and spaces, or null. */
export function cleanPhone(v) {
  const m = /\+?\d[\d\s().-]{6,19}\d/.exec(clean(v, 80));
  if (!m) return null;
  const p = m[0].replace(/\s+/g, " ").replace(/[^0-9+() -]/g, "").trim();
  const digits = p.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 13 || p.length > 20) return null;
  return p;
}
export function cleanEmail(v) {
  const t = clean(v, 120).toLowerCase().replace(/^mailto:/, "").replace(/[.,;)]+$/, "");
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t) ? t : null;
}
/** http(s) links only; "www.x.com" becomes https://www.x.com. Rejects javascript:, data:, credentials in the address. */
export function cleanUrl(v) {
  let t = clean(v, 500).replace(/[.,;)\]]+$/, "");
  if (!t) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !/^https?:\/\//i.test(t)) return null;
  if (!/^https?:\/\//i.test(t)) { if (!/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(t)) return null; t = `https://${t}`; }
  try {
    const u = new URL(t);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password || !u.hostname.includes(".")) return null;
    return u.toString().slice(0, 500);
  } catch { return null; }
}

// ---------- clubs ----------
const key = (s) => clean(String(s ?? ""), 120).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
/** The configured club this text names, or null. "Coding Club, BMSIT" matches "Coding Club"; ambiguous text matches nothing. */
export function matchClub(text, clubs) {
  const k = key(text);
  if (!k) return null;
  const exact = clubs.find((c) => key(c.name) === k);
  if (exact) return exact.name;
  const hits = clubs.filter((c) => { const kc = key(c.name); return kc.length >= 5 && (k.includes(kc) || kc.includes(k)); });
  return hits.length === 1 ? hits[0].name : null;
}

const listOf = (v, max, len) => (Array.isArray(v) ? v : []).map((x) => clean(typeof x === "string" ? x : "", len)).filter(Boolean).slice(0, max);
const intIn = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);

/**
 * @param raw  the tool input returned by the model
 * @returns { ok: true, result, fieldMeta, warnings, requiresReview } | { ok: false, error }
 */
export function normalizeHackathon(raw, { clubs = [], filename = null, pageCount = null, now = new Date(), qrLinks = [] } = {}) {
  if (!isObj(raw) || !isObj(raw.hackathon)) return { ok: false, error: "The AI did not return a hackathon in the expected format." };
  const h = raw.hackathon;
  const warnings = [];
  const warn = (f, code, message) => warnings.push({ field: f, code, message });
  const fieldMeta = {};
  const meta = (name, f, value, extraReview = false) => {
    fieldMeta[name] = {
      confidence: f.confidence, source: f.source, pages: f.pages, evidence: f.evidence,
      needsReview: extraReview || value === null || value === undefined || (Array.isArray(value) && !value.length) || f.source !== "explicit" || f.confidence < REVIEW_CONFIDENCE,
    };
  };
  const text = (name, max) => { const f = readField(h, name); const v = clean(f.value, max) || null; meta(name, v ? f : { ...f, source: "missing", confidence: 0 }, v); return v; };

  const nameRaw = readField(h, "name");
  const nameV = clean(nameRaw.value, 140);
  const name = nameV.length >= 3 ? nameV : null;
  meta("name", name ? nameRaw : { ...nameRaw, source: "missing", confidence: 0 }, name);
  const tagline = text("tagline", 160);
  const theme = text("theme", 80);
  const venue = text("venue", 200);
  const venueAddress = text("venueAddress", 200);
  const eligibility = text("eligibility", 300);
  const feeNote = text("feeNote", 200);
  const prizeText = text("prizePoolText", 200);
  const contactName = text("contactName", 80);

  // organiser: a configured club if it clearly is one, otherwise the name as written
  const org = readField(h, "organizer"), clubF = readField(h, "clubName");
  const organizerAsWritten = clean(org.value, 120) || null;
  const club = matchClub(clubF.value ?? "", clubs) || (organizerAsWritten ? matchClub(organizerAsWritten, clubs) : null);
  if (clubF.value && !matchClub(clubF.value, clubs)) warn("clubName", "club_unrecognised", `"${clean(clubF.value, 60)}" is not one of the configured clubs.`);
  meta("organizer", organizerAsWritten ? org : { ...org, source: "missing", confidence: 0 }, organizerAsWritten);
  meta("clubName", club ? clubF : { ...clubF, source: club ? clubF.source : "missing", confidence: club ? clubF.confidence : 0 }, club);

  // Is the venue outside BMSIT's own campus? The AI says so; the venue's own words about BMSIT overrule a wrong "yes".
  const offF = readField(h, "offCampus");
  let offCampus = typeof offF.value === "boolean" ? offF.value : null;
  if (offCampus === true && /\bBMSIT\b|BMS\s+Institute\s+of\s+Technology/i.test(`${venue || ""} ${venueAddress || ""}`)) offCampus = false;
  meta("offCampus", offCampus === null ? { ...offF, source: "missing", confidence: 0 } : offF, offCampus, offCampus === true);

  const modeF = readField(h, "mode");
  const mode = ["online", "offline", "hybrid"].includes(modeF.value) ? modeF.value : null;
  meta("mode", mode ? modeF : { ...modeF, source: "missing", confidence: 0 }, mode);

  // ---- dates ----
  const dt = (nameKey, fallbackTime) => {
    const f = readField(h, nameKey);
    const p = parseDateTime(f.value, { dateOnlyTime: fallbackTime });
    if (f.value && !p) warn(nameKey, "date_unreadable", `The ${nameKey} could not be read as a date, so it was left empty.`);
    let iso = p ? toIso(p.date, p.time) : null;
    if (p && !p.hasTime) warn(nameKey, "time_not_stated", `No time is printed for the ${nameKey}; ${fallbackTime === "23:59" ? "end of day (11:59 PM)" : "start of day (12:00 AM)"} was used. Please set the real time.`);
    if (p && p.ambiguous) warn(nameKey, "time_ambiguous", `The ${nameKey} time ${p.time} could be morning or afternoon. Please check.`);
    if (iso) {                                   // a year that is far off is almost always a misread digit
      const t = new Date(iso).getTime(), n = now.getTime();
      if (t < n - 2 * 365 * 864e5 || t > n + 3 * 365 * 864e5) { warn(nameKey, "date_out_of_range", `The ${nameKey} (${p.date}) is far from today, so it was left empty.`); iso = null; }
    }
    meta(nameKey, iso ? f : { ...f, source: "missing", confidence: 0 }, iso, Boolean(p && (!p.hasTime || p.ambiguous || p.converted)));
    return iso;
  };
  let startsAt = dt("startsAt", "00:00");
  let endsAt = dt("endsAt", "23:59");
  let opensAt = dt("registrationOpensAt", "00:00");
  const deadline = dt("registrationDeadline", "23:59");
  if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) { warn("endsAt", "ends_before_start", "The end is before the start, so the end was left empty."); endsAt = null; fieldMeta.endsAt.needsReview = true; }
  if (opensAt && deadline && new Date(opensAt) > new Date(deadline)) { warn("registrationOpensAt", "opens_after_deadline", "Registration opens after it closes, so the opening time was left empty."); opensAt = null; fieldMeta.registrationOpensAt.needsReview = true; }

  // ---- team size ----
  const tMinF = readField(h, "teamMin"), tMaxF = readField(h, "teamMax");
  let teamMin = intIn(tMinF.value, 1, 10), teamMax = intIn(tMaxF.value, 1, 10);
  if (teamMin && teamMax && teamMin > teamMax) { warn("teamMin", "team_swapped", "The smallest team was bigger than the largest, so they were swapped."); [teamMin, teamMax] = [teamMax, teamMin]; }
  meta("teamMin", teamMin ? tMinF : { ...tMinF, source: "missing", confidence: 0 }, teamMin);
  meta("teamMax", teamMax ? tMaxF : { ...tMaxF, source: "missing", confidence: 0 }, teamMax);

  // ---- money ----
  const feeF = readField(h, "feeAmount");
  const feeAmount = parseRupees(feeF.value);
  meta("feeAmount", feeAmount !== null ? feeF : { ...feeF, source: "missing", confidence: 0 }, feeAmount === null ? null : feeAmount === 0 ? "free" : feeAmount);
  const prizes = (Array.isArray(raw.prizes) ? raw.prizes : []).filter(isObj).slice(0, MAX_PRIZES).map((p) => ({
    label: clean(p.label, 80), amount: parseRupees(p.amount), note: clean(p.note, 160) || null, page: pageNo(p.page),
  })).filter((p) => p.label);
  const poolF = readField(h, "prizePoolAmount");
  let prizeAmount = parseRupees(poolF.value);
  const prizeSum = prizes.reduce((n, p) => n + (p.amount || 0), 0);
  let poolFlagged = false;
  if (prizeAmount === null && !prizeText && prizes.length && prizes.every((p) => p.amount !== null) && prizeSum > 0) {
    prizeAmount = prizeSum; poolFlagged = true;
    warn("prizePoolAmount", "prize_total_derived", `No total prize pool is printed; the total (₹${prizeSum.toLocaleString("en-IN")}) was added up from the individual prizes. Please check.`);
  } else if (prizeAmount !== null && prizeSum > prizeAmount) {
    warn("prizePoolAmount", "prize_total_mismatch", `The prizes listed add up to ₹${prizeSum.toLocaleString("en-IN")}, which is more than the stated total of ₹${prizeAmount.toLocaleString("en-IN")}. Please check.`);
    poolFlagged = true;
  }
  meta("prizePoolAmount", prizeAmount !== null ? (poolFlagged ? { ...poolF, source: "inferred" } : poolF) : { ...poolF, source: "missing", confidence: 0 }, prizeAmount, poolFlagged);

  // ---- contact and links ----
  const phoneF = readField(h, "contactPhone"), mailF = readField(h, "contactEmail");
  const contactPhone = cleanPhone(phoneF.value), contactEmail = cleanEmail(mailF.value);
  if (phoneF.value && !contactPhone) warn("contactPhone", "phone_unreadable", "The contact number did not look like a phone number, so it was left empty.");
  if (mailF.value && !contactEmail) warn("contactEmail", "email_unreadable", "The contact email did not look valid, so it was left empty.");
  meta("contactPhone", contactPhone ? phoneF : { ...phoneF, source: "missing", confidence: 0 }, contactPhone);
  meta("contactEmail", contactEmail ? mailF : { ...mailF, source: "missing", confidence: 0 }, contactEmail);
  const links = {};
  for (const [k, label] of [["websiteUrl", "website"], ["registrationUrl", "registration link"], ["mapLink", "map link"]]) {
    const f = readField(h, k), u = cleanUrl(f.value);
    if (f.value && !u) warn(k, "link_unusable", `The ${label} was not a normal web address, so it was left empty.`);
    meta(k, u ? f : { ...f, source: "missing", confidence: 0 }, u);
    links[k] = u;
  }

  // Links read from QR codes on the poster (decoded by lib/hackathons/qr.js, not by the AI). Students open them straight from
  // CampusCast instead of scanning. A link the AI already read from the printed text is not replaced; the caption decides
  // whether a code is the registration page or the website. Every such link is flagged for the club admin to open and confirm.
  const qrUrls = [...new Set((Array.isArray(qrLinks) ? qrLinks : []).map(cleanUrl).filter(Boolean))].slice(0, 3);
  const qrLabelF = readField(h, "qrCodeLabel");
  const qrLabel = clean(qrLabelF.value, 80).toLowerCase();
  const wantsRegister = /regist|apply|join|sign ?up|enrol|participate|form/.test(qrLabel);
  const fromQr = (k, u) => {
    links[k] = u;
    fieldMeta[k] = { confidence: 1, source: "explicit", pages: [1], evidence: "Read from the QR code on the poster", needsReview: true };
    warn(k, "qr_link_used", `The ${k === "registrationUrl" ? "registration link" : "website link"} was read from the QR code on the poster (${new URL(u).host}). Please open it and check it is the right page.`);
  };
  for (const u of qrUrls) {
    if (Object.values(links).includes(u)) continue;
    if (wantsRegister && !links.registrationUrl) fromQr("registrationUrl", u);
    else if (!links.websiteUrl && !wantsRegister) fromQr("websiteUrl", u);
    else if (!links.registrationUrl) fromQr("registrationUrl", u);
    else if (!links.websiteUrl) fromQr("websiteUrl", u);
  }

  const tracks = listOf(readField(h, "tracks").value, 20, 60);
  const perks = listOf(readField(h, "perks").value, 20, 160);
  const rules = listOf(readField(h, "rules").value, 30, 300);
  const sponsors = listOf(readField(h, "sponsors").value, 20, 80);
  for (const [k, v] of [["tracks", tracks], ["perks", perks], ["rules", rules], ["sponsors", sponsors]]) meta(k, readField(h, k), v);

  // ---- schedule: sorted by time; entries with no known day are kept at the end and flagged ----
  const startDate = startsAt ? istDate(startsAt) : null;
  const sameDay = startDate && (!endsAt || istDate(endsAt) === startDate);
  const items = (Array.isArray(raw.schedule) ? raw.schedule : []).filter(isObj).slice(0, MAX_SCHEDULE).map((e, i) => {
    const title = clean(e.title, 140);
    if (!title) return null;
    const t = e.time ? parseTime(e.time) : null, t2 = e.endTime ? parseTime(e.endTime) : null;
    let date = e.date ? parseDate(e.date)?.iso || null : null;
    let flagged = false;
    const dayN = /day\s*(\d{1,2})/i.exec(clean(e.day, 40));
    if (!date && startDate) {
      if (dayN && Number(dayN[1]) >= 1 && Number(dayN[1]) <= 10) date = addDays(startDate, Number(dayN[1]) - 1);
      else if (sameDay) date = startDate;
    }
    if (!date || !t) flagged = true;
    const at = date && t ? toIso(date, t.time) : null;
    const endAt = date && t2 ? toIso(date, t2.time) : null;
    if (at && endAt && new Date(endAt) < new Date(at)) flagged = true;
    if (at && startsAt && (new Date(at) < new Date(startsAt) - 864e5 || (endsAt && new Date(at) > new Date(endsAt).getTime() + 864e5))) flagged = true;
    return { at, endAt: endAt && new Date(endAt) >= new Date(at || endAt) ? endAt : null, title, note: clean(e.note, 200) || null, page: pageNo(e.page), needsReview: flagged || Boolean(t?.ambiguous), order: i };
  }).filter(Boolean);
  const schedule = [...items.filter((e) => e.at).sort((a, b) => new Date(a.at) - new Date(b.at) || a.order - b.order), ...items.filter((e) => !e.at)].map(({ order, ...e }) => e);
  const unscheduled = schedule.filter((e) => !e.at).length;
  if (unscheduled) warn("schedule", "schedule_no_time", `${unscheduled} programme entr${unscheduled === 1 ? "y has" : "ies have"} no clear day or time. Please set them.`);
  const toCheck = schedule.filter((e) => e.needsReview).length;
  if (toCheck && toCheck > unscheduled) warn("schedule", "schedule_check", `${toCheck} programme entries are worth checking.`);

  const kind = ["digital", "scanned", "mixed"].includes(raw.documentKind) ? raw.documentKind : null;
  const result = {
    name, tagline, organizerName: organizerAsWritten, clubName: club, theme, mode, venue, venueAddress, offCampus: offCampus === true, mapUrl: links.mapLink,
    startsAt, endsAt, registrationOpensAt: opensAt, deadline, teamMin, teamMax,
    feeAmount, feeNote, prizeAmount, prizeText, prizes, eligibility, tracks,
    contactName, contactPhone, contactEmail, websiteUrl: links.websiteUrl, registrationUrl: links.registrationUrl,
    perks, rules, sponsors, schedule, qrLinks: qrUrls,
    sourceDocument: { filename, pageCount, kind },
    extractionStatus: "completed", requiresReview: true, extractedAt: now.toISOString(),
  };
  return { ok: true, result, fieldMeta, warnings, requiresReview: true };
}
