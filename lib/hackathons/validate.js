import { cleanEmail, cleanPhone, cleanUrl } from "./normalize.js";
import { isPin } from "./geo.js";

// Server-side checks for what a club admin saves from the hackathon editor. Pure functions: the browser's form is never
// trusted, and the database enforces the same rules again (constraints, row-level security). Unlike the AI checker,
// this one REFUSES a bad value with a message instead of quietly dropping it: a person typed it, so tell them.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => UUID.test(String(v));

export const MODES = ["online", "offline", "hybrid"];
const IST = "+05:30";
const text = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : "");
const orNull = (s) => (s ? s : null);
const lines = (v, maxItems, maxLen) => (Array.isArray(v) ? v : typeof v === "string" ? v.split("\n") : []).map((x) => text(x, maxLen)).filter(Boolean).slice(0, maxItems);

// "2026-12-12T09:00" (typed as India time) or a full ISO time with an offset -> ISO string with an offset, or null.
export function toIso(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const local = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(s);
  const full = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.exec(s);
  const m = local || full;
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1, 6).map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi));
  if (y < 2000 || y > 2100 || t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d || h > 23 || mi > 59) return null;
  const iso = local ? `${s.slice(0, 10)}T${s.slice(11, 16)}:00${IST}` : s;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

// An ISO time -> "YYYY-MM-DDTHH:MM" in India time, for an <input type="datetime-local">.
export function toLocalInput(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? "" : new Date(t + 5.5 * 3600e3).toISOString().slice(0, 16);
}

const money = (v) => {
  if (v === null || v === undefined || v === "") return { ok: true, value: null };
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s₹]/g, ""));
  return Number.isFinite(n) && n >= 0 && n <= 1e9 ? { ok: true, value: Math.round(n * 100) / 100 } : { ok: false };
};

/**
 * @param input  what the form sends (see the field names below)
 * @param opts   { clubs: [{ id, name }] the user may post for, isAdmin }
 * @returns { ok: true, patch, details } | { ok: false, errors: string[] }
 *          patch is ready for hackathons.update(); details holds { perks, rules, sponsors } to merge into the details column
 */
export function validateHackathon(input, { clubs = [], isAdmin = false } = {}) {
  const errors = [];
  const i = input && typeof input === "object" ? input : {};
  const err = (m) => errors.push(m);

  const title = text(i.title, 140);
  if (title.length < 3) err("Give the hackathon a name (at least 3 characters).");

  const mode = MODES.includes(i.mode) ? i.mode : "offline";

  let clubId = null;
  if (i.clubId) {
    if (!isUuid(i.clubId) || !clubs.some((c) => c.id === i.clubId)) err("Choose one of your clubs.");
    else clubId = i.clubId;
  } else if (!isAdmin) err("Choose the club that is organising this hackathon.");
  const organizerName = orNull(text(i.organizerName, 120));
  if (!clubId && !organizerName) err("Name the organiser: choose a club, or type the organiser's name.");

  const when = {};
  for (const [key, label] of [["registrationOpensAt", "registration opening time"], ["deadline", "registration deadline"], ["startsAt", "start time"], ["endsAt", "end time"]]) {
    const raw = i[key];
    if (raw === "" || raw === null || raw === undefined) { when[key] = null; continue; }
    const iso = toIso(raw);
    if (!iso) { err(`The ${label} is not a real date and time.`); when[key] = null; } else when[key] = iso;
  }
  const t = (k) => (when[k] ? new Date(when[k]).getTime() : null);
  if (t("startsAt") && t("endsAt") && t("endsAt") < t("startsAt")) err("The hackathon cannot end before it starts.");
  if (t("registrationOpensAt") && t("deadline") && t("registrationOpensAt") > t("deadline")) err("Registration cannot open after it closes.");
  if (t("deadline") && t("startsAt") && t("deadline") > t("startsAt") + 864e5) err("The registration deadline is more than a day after the hackathon starts. Please check the dates.");

  let teamMin = i.teamMin === "" || i.teamMin == null ? 1 : Number(i.teamMin);
  let teamMax = i.teamMax === "" || i.teamMax == null ? 4 : Number(i.teamMax);
  if (!Number.isInteger(teamMin) || !Number.isInteger(teamMax) || teamMin < 1 || teamMax < 1 || teamMin > 10 || teamMax > 10) { err("Team sizes must be whole numbers from 1 to 10."); teamMin = 1; teamMax = 4; }
  else if (teamMin > teamMax) err("The smallest team cannot be bigger than the largest.");

  const prize = money(i.prizeAmount), fee = i.feeFree ? { ok: true, value: 0 } : money(i.feeAmount);
  if (!prize.ok) err("The prize pool must be an amount in rupees.");
  if (!fee.ok) err("The entry fee must be an amount in rupees (or choose Free).");

  const prizes = (Array.isArray(i.prizeBreakdown) ? i.prizeBreakdown : []).slice(0, 20).map((p, idx) => {
    const label = text(p?.label, 80);
    const a = money(p?.amount);
    if (!label && (p?.amount || p?.note)) err(`Prize ${idx + 1} needs a name (for example Winner).`);
    if (label && !a.ok) err(`The amount for "${label}" must be a number of rupees.`);
    return label ? { label, amount: a.ok ? a.value : null, note: orNull(text(p?.note, 160)) } : null;
  }).filter(Boolean);

  // contact and links: a value that was typed but is wrong is an error, not silently dropped
  const phone = text(i.contactPhone, 40), mail = text(i.contactEmail, 120);
  const contactPhone = phone ? cleanPhone(phone) : null, contactEmail = mail ? cleanEmail(mail) : null;
  if (phone && !contactPhone) err("The contact phone number does not look right. Use digits, with +91 or the area code if you like.");
  if (mail && !contactEmail) err("The contact email address does not look right.");
  const url = (v, label) => { const s = text(v, 500); if (!s) return null; const u = cleanUrl(s); if (!u) err(`The ${label} must be a web address (https://...).`); return u; };
  const websiteUrl = url(i.websiteUrl, "website link"), link = url(i.link, "registration link"), mapUrl = url(i.mapUrl, "map link");

  // outside the campus: the venue's address and its map pin (both numbers or neither)
  const offCampus = i.offCampus === true || i.offCampus === "true";
  const venueAddress = orNull(text(i.venueAddress, 200));
  let venueLat = null, venueLng = null;
  const hasLat = i.venueLat !== "" && i.venueLat != null, hasLng = i.venueLng !== "" && i.venueLng != null;
  if (hasLat || hasLng) {
    const la = Number(i.venueLat), ln = Number(i.venueLng);
    if (!hasLat || !hasLng || !isPin(la, ln)) err("The map pin is not valid. Search for the venue again, or remove the pin.");
    else { venueLat = Math.round(la * 1e6) / 1e6; venueLng = Math.round(ln * 1e6) / 1e6; }
  }

  const schedule = (Array.isArray(i.schedule) ? i.schedule : []).slice(0, 100).map((e, idx) => {
    const title = text(e?.title, 140);
    if (!title && (e?.at || e?.note)) err(`Programme entry ${idx + 1} needs a title.`);
    if (!title) return null;
    const at = toIso(e?.at);
    if (!at) { err(`Programme entry "${title}" needs a real date and time.`); return null; }
    let endAt = e?.endAt ? toIso(e.endAt) : null;
    if (e?.endAt && !endAt) err(`The end time of "${title}" is not a real date and time.`);
    if (endAt && new Date(endAt) < new Date(at)) { err(`"${title}" ends before it starts.`); endAt = null; }
    return { at, endAt, title, note: orNull(text(e?.note, 200)) };
  }).filter(Boolean).sort((a, b) => new Date(a.at) - new Date(b.at));

  if (errors.length) return { ok: false, errors: errors.slice(0, 12) };
  return {
    ok: true,
    patch: {
      title, tagline: orNull(text(i.tagline, 160)), theme: text(i.theme, 80) || "Open innovation", mode,
      description: orNull(text(i.description, 4000)), club_id: clubId, organizer_name: organizerName,
      location: orNull(text(i.location, 200)), map_url: mapUrl, off_campus: offCampus, venue_address: venueAddress, venue_lat: venueLat, venue_lng: venueLng,
      registration_opens_at: when.registrationOpensAt, deadline: when.deadline, starts_at: when.startsAt, ends_at: when.endsAt,
      team_min: teamMin, team_max: teamMax,
      prize: orNull(text(i.prize, 200)), prize_amount: prize.value, prize_breakdown: prizes,
      fee_amount: fee.value, fee_note: orNull(text(i.feeNote, 200)), eligibility: orNull(text(i.eligibility, 300)),
      tracks: lines(i.tracks, 20, 60),
      contact_name: orNull(text(i.contactName, 80)), contact_phone: contactPhone, contact_email: contactEmail,
      website_url: websiteUrl, link, schedule,
    },
    details: { perks: lines(i.perks, 20, 160), rules: lines(i.rules, 30, 300), sponsors: lines(i.sponsors, 20, 80) },
  };
}

/**
 * Before publishing. `blocking` must be fixed; `hints` are things students will wonder about.
 * @param h  a hackathon in the database's shape (patch + details)
 */
export function publishIssues(h) {
  const blocking = [], hints = [];
  if (!h.title || h.title.length < 3) blocking.push("Add the hackathon's name.");
  if (!h.deadline && !h.starts_at) blocking.push("Add a registration deadline or a start time.");
  if (!h.club_id && !h.organizer_name) blocking.push("Say who is organising it.");
  if (!h.location && !h.venue_address) hints.push("No venue: students will not know where to go.");
  if (h.off_campus && h.venue_lat == null) hints.push("The venue is outside the campus but has no map pin, so students cannot see the distance from BMSIT or open directions with one tap.");
  if (!h.starts_at) hints.push("No start time: there will be no countdown to the start.");
  if (h.prize_amount == null && !h.prize) hints.push("No prize pool.");
  if (!h.contact_phone && !h.contact_email) hints.push("No contact number or email for questions.");
  if (!h.website_url && !h.link) hints.push("No website or registration link, so students cannot open the official site from here.");
  if (!(h.schedule || []).length) hints.push("No programme: students will not see the day's timings.");
  if (h.fee_amount == null) hints.push("The entry fee is not stated.");
  return { blocking, hints };
}
