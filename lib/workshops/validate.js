import { cleanEmail, cleanPhone, cleanUrl } from "../hackathons/normalize.js";
import { isUuid, toIso } from "../hackathons/validate.js";
import { BRANCHES, YEARS } from "../college.js";

// Server-side checks for what an organiser saves from the workshop editor. The browser's form is never trusted, and the
// database enforces the same rules again. A bad typed value is refused with a message, not silently dropped.

export const MODES = ["online", "offline", "hybrid"];
const text = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "");
const orNull = (s) => (s ? s : null);
const lines = (v, maxItems, maxLen) => (Array.isArray(v) ? v : typeof v === "string" ? v.split("\n") : []).map((x) => text(x, maxLen)).filter(Boolean).slice(0, maxItems);

/**
 * @returns { ok: true, patch, details } | { ok: false, errors: string[] }
 */
export function validateWorkshop(input, { clubs = [], isAdmin = false } = {}) {
  const errors = [];
  const i = input && typeof input === "object" ? input : {};
  const err = (m) => errors.push(m);

  const title = text(i.title, 140);
  if (title.length < 3) err("Give the workshop a name (at least 3 characters).");
  let clubId = null;
  if (i.clubId) {
    if (!isUuid(i.clubId) || !clubs.some((c) => c.id === i.clubId)) err("Choose one of your clubs.");
    else clubId = i.clubId;
  } else if (!isAdmin) err("Choose the club that is organising this workshop.");

  const when = {};
  for (const [key, label] of [["startsAt", "start time"], ["endsAt", "end time"], ["deadline", "last time to register"]]) {
    const raw = i[key];
    if (raw === "" || raw === null || raw === undefined) { when[key] = null; continue; }
    when[key] = toIso(raw);
    if (!when[key]) err(`The ${label} is not a real date and time.`);
  }
  const t = (k) => (when[k] ? new Date(when[k]).getTime() : null);
  if (t("startsAt") && t("endsAt") && t("endsAt") < t("startsAt")) err("The workshop cannot end before it starts.");
  if (t("startsAt") && t("deadline") && t("deadline") > t("startsAt")) err("Registration cannot close after the workshop starts.");

  const seats = Number(i.seats);
  if (!Number.isInteger(seats) || seats < 1 || seats > 5000) err("Seats must be a whole number from 1 to 5000.");

  let fee = null;
  if (i.feeFree) fee = 0;
  else if (i.feeAmount !== "" && i.feeAmount !== null && i.feeAmount !== undefined) {
    const n = Number(String(i.feeAmount).replace(/[,\s₹]/g, ""));
    if (!Number.isFinite(n) || n < 0 || n > 1e6) err("The fee must be an amount in rupees (or choose Free).");
    else fee = Math.round(n * 100) / 100;
  }

  const phone = text(i.contactPhone, 40), mail = text(i.contactEmail, 120);
  const contactPhone = phone ? cleanPhone(phone) : null, contactEmail = mail ? cleanEmail(mail) : null;
  if (phone && !contactPhone) err("The contact phone number does not look right. Use digits, with +91 or the area code if you like.");
  if (mail && !contactEmail) err("The contact email address does not look right.");
  const url = (v, label) => { const s = text(v, 500); if (!s) return null; const u = cleanUrl(s); if (!u) err(`The ${label} must be a web address (https://...).`); return u; };
  const websiteUrl = url(i.websiteUrl, "website link"), link = url(i.link, "registration link"), mapUrl = url(i.mapUrl, "map link");

  const depts = [...new Set((Array.isArray(i.audienceDepts) ? i.audienceDepts : []).filter((d) => BRANCHES.includes(d)))];
  const years = [...new Set((Array.isArray(i.audienceYears) ? i.audienceYears : []).map(Number).filter((y) => YEARS.includes(y)))];

  if (errors.length) return { ok: false, errors: errors.slice(0, 12) };
  return {
    ok: true,
    patch: {
      title, tagline: orNull(text(i.tagline, 160)), description: orNull(text(i.description, 4000)), topics: lines(i.topics, 30, 160),
      club_id: clubId, organizer_name: orNull(text(i.organizerName, 120)),
      speaker_name: orNull(text(i.speakerName, 120)), speaker_about: orNull(text(i.speakerAbout, 300)),
      mode: MODES.includes(i.mode) ? i.mode : "offline", venue: orNull(text(i.venue, 200)), map_url: mapUrl,
      starts_at: when.startsAt, ends_at: when.endsAt, reg_closes_at: when.deadline, seats,
      fee_amount: fee, fee_note: orNull(text(i.feeNote, 200)),
      eligibility: orNull(text(i.eligibility, 300)), prerequisites: orNull(text(i.prerequisites, 500)),
      audience_depts: depts.length ? depts : null, audience_years: years.length ? years : null,
      contact_name: orNull(text(i.contactName, 80)), contact_phone: contactPhone, contact_email: contactEmail,
      website_url: websiteUrl, link,
    },
    details: { perks: lines(i.perks, 20, 160) },
  };
}

/** Before publishing. `blocking` must be fixed; `hints` are things students will wonder about. */
export function publishIssues(w, nowMs = Date.now()) {
  const blocking = [], hints = [];
  if (!w.title || w.title.length < 3) blocking.push("Add the workshop's name.");
  if (!w.starts_at) blocking.push("Add the date and start time.");
  else if (new Date(w.starts_at).getTime() <= nowMs) hints.push("The start time has passed: students will see it under Past and cannot register.");
  if (!w.venue) hints.push("No venue: students will not know where to go.");
  if (!w.club_id && !w.organizer_name) hints.push("No organiser is named.");
  if (!w.description && !(w.topics || []).length) hints.push("Nothing says what students will learn.");
  if (w.fee_amount == null) hints.push("The fee is not stated.");
  if (!w.contact_phone && !w.contact_email) hints.push("No contact number or email for questions.");
  return { blocking, hints };
}
