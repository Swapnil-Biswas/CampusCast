// Everything the student pages decide about a hackathon from its dates. Pure functions (no clock of their own: the time is
// passed in), so they can be tested. All dates are exact moments (timestamptz); the displays convert them to India time.

const H = 3600e3;
const DAY = 24 * H;
export const ms = (v) => { const t = v ? new Date(v).getTime() : NaN; return Number.isNaN(t) ? null : t; };

/**
 * Where a hackathon is right now, and what to count down to.
 * @param h  { status, starts_at, ends_at, registration_opens_at, deadline }
 * @returns { key, label, target: { at, label } | null }
 *   key: cancelled | upcoming (registration not open yet) | open | closing (less than 2 days left) | closed (before the start) | live | ended
 */
export function hackathonPhase(h, nowMs = Date.now()) {
  if (h.status === "cancelled") return { key: "cancelled", label: "Cancelled", target: null };
  const starts = ms(h.starts_at), ends = ms(h.ends_at), opens = ms(h.registration_opens_at);
  const closes = ms(h.deadline) ?? starts;
  const liveUntil = ends ?? (starts !== null ? starts + DAY : null);   // with no end time, it is treated as lasting a day

  if (starts !== null && nowMs >= starts) {
    if (liveUntil !== null && nowMs < liveUntil) return { key: "live", label: "Live now", target: ends ? { at: ends, label: "Ends in" } : null };
    return { key: "ended", label: "Ended", target: null };
  }
  if (starts === null && closes !== null && nowMs >= closes) return { key: "ended", label: "Registration closed", target: null };

  if (opens !== null && nowMs < opens) return { key: "upcoming", label: "Registration opens soon", target: { at: opens, label: "Registration opens in" } };
  if (closes !== null && nowMs < closes) {
    const soon = closes - nowMs < 2 * DAY;
    return { key: soon ? "closing" : "open", label: soon ? "Closing soon" : "Registration open", target: { at: closes, label: "Registration closes in" } };
  }
  return { key: "closed", label: "Registration closed", target: starts !== null ? { at: starts, label: "Starts in" } : null };
}

/** Live first, then by the next thing that happens (soonest first); ended and cancelled ones last, the most recent first. */
export function sortHackathons(list, nowMs = Date.now()) {
  const rank = (h) => {
    const p = hackathonPhase(h, nowMs);
    if (p.key === "live") return [0, ms(h.ends_at) ?? ms(h.starts_at) ?? 0];
    if (p.key === "ended" || p.key === "cancelled") return [2, -(ms(h.ends_at) ?? ms(h.starts_at) ?? ms(h.deadline) ?? 0)];
    return [1, p.target?.at ?? ms(h.starts_at) ?? Number.MAX_SAFE_INTEGER];
  };
  return [...list].sort((a, b) => { const [ga, ka] = rank(a), [gb, kb] = rank(b); return ga - gb || ka - kb; });
}

/** 100000 -> "₹1,00,000" */
export const formatRupees = (n) => (n === null || n === undefined || n === "" || Number.isNaN(Number(n)) ? null : `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);

/** "+91 98450 12345" -> "+919845012345" for tel: links, or null. */
export const telLink = (p) => { const d = String(p || "").replace(/[^\d+]/g, ""); return /^\+?\d{8,14}$/.test(d) ? `tel:${d}` : null; };

/** A WhatsApp chat link for a mobile number. A bare 10-digit Indian mobile (starting 6 to 9) is taken as +91; a number with a
 *  leading 0 is a landline (STD code), which WhatsApp cannot reach. Null if unsure. */
export function waLink(p, text = "") {
  const raw = String(p || "").trim();
  const d = raw.replace(/\D/g, "");
  let num = null;
  if (/^[6-9]\d{9}$/.test(d)) num = `91${d}`;
  else if (/^91[6-9]\d{9}$/.test(d)) num = d;
  else if (raw.startsWith("+") && d.length >= 11 && d.length <= 14 && !d.startsWith("0")) num = d;
  return num ? `https://wa.me/${num}${text ? `?text=${encodeURIComponent(text)}` : ""}` : null;
}

// ---------- programme ----------
const istDay = (t) => new Date(t + 5.5 * H).toISOString().slice(0, 10);
const DAYNAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const dayHeading = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${DAYNAME[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d} ${MONTH[m - 1]}`; };

/** Programme items -> [{ day: "2026-12-12", heading, items: [{ ...item, index }] }] in time order; items with no time go last. */
export function groupSchedule(items) {
  const withIdx = (items || []).map((e, index) => ({ ...e, index }));
  const timed = withIdx.filter((e) => ms(e.at) !== null).sort((a, b) => ms(a.at) - ms(b.at) || a.index - b.index);
  const groups = [];
  for (const e of timed) {
    const day = istDay(ms(e.at));
    (groups.at(-1)?.day === day ? groups.at(-1) : groups[groups.push({ day, heading: dayHeading(day), items: [] }) - 1]).items.push(e);
  }
  const loose = withIdx.filter((e) => ms(e.at) === null);
  if (loose.length) groups.push({ day: "", heading: "Time to be announced", items: loose });
  return groups;
}

/**
 * What each programme item is right now: "past", "now", "next" (the first one still to come) or "later".
 * An item without an end time is taken to last 30 minutes, or until the next item starts if that is sooner.
 * @returns Map<index, state>
 */
export function scheduleStates(items, nowMs = Date.now()) {
  const timed = (items || []).map((e, index) => ({ e, index, at: ms(e.at) })).filter((x) => x.at !== null).sort((a, b) => a.at - b.at || a.index - b.index);
  const out = new Map();
  let nextSet = false;
  timed.forEach((x, i) => {
    const end = ms(x.e.endAt) ?? Math.min(timed[i + 1]?.at ?? Infinity, x.at + 30 * 60e3);
    if (nowMs >= end) out.set(x.index, "past");
    else if (nowMs >= x.at) out.set(x.index, "now");
    else if (!nextSet) { out.set(x.index, "next"); nextSet = true; } else out.set(x.index, "later");
  });
  (items || []).forEach((e, index) => { if (!out.has(index)) out.set(index, "later"); });
  return out;
}

// ---------- calendar file ----------
const esc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (t) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const fold = (line) => (line.length <= 73 ? line : line.match(/.{1,73}/g).join("\r\n "));

/**
 * A .ics file for a hackathon: the event itself, when registration closes, and one entry per programme item, so the
 * phone's own calendar shows the whole day. It carries no alarms: the person's calendar app decides how to remind them.
 */
export function buildHackathonIcs(h, { host = "campuscast", nowMs = Date.now() } = {}) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CampusCast//Hackathons//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(h.title)}`];
  const place = [h.location, h.venue_address].filter(Boolean).join(", ");
  const url = h.website_url || h.link || "";
  const event = (uid, start, end, summary, extra = []) => {
    lines.push("BEGIN:VEVENT", `UID:${uid}@${host}`, `DTSTAMP:${stamp(nowMs)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${esc(summary)}`, ...extra, "END:VEVENT");
  };
  const starts = ms(h.starts_at), ends = ms(h.ends_at), closes = ms(h.deadline);
  const info = [h.organizer || h.organizer_name, h.prize ? `Prize pool: ${h.prize}` : "", url].filter(Boolean).join("\n");
  if (starts !== null) event(`hackathon-${h.id}`, starts, ends && ends > starts ? ends : starts + DAY, h.title, [...(place ? [`LOCATION:${esc(place)}`] : []), ...(info ? [`DESCRIPTION:${esc(info)}`] : []), ...(url ? [`URL:${url}`] : [])]);
  if (closes !== null) event(`hackathon-${h.id}-register`, closes, closes + 15 * 60e3, `Registration closes: ${h.title}`, url ? [`URL:${url}`] : []);
  const items = (h.schedule || []).map((e) => ({ ...e, at: ms(e.at), endAt: ms(e.endAt) })).filter((e) => e.at !== null).sort((a, b) => a.at - b.at);
  items.forEach((e, i) => event(`hackathon-${h.id}-p${i}`, e.at, e.endAt && e.endAt > e.at ? e.endAt : items[i + 1]?.at > e.at ? items[i + 1].at : e.at + 30 * 60e3, `${e.title} (${h.title})`, [...(place ? [`LOCATION:${esc(place)}`] : []), ...(e.note ? [`DESCRIPTION:${esc(e.note)}`] : [])]));
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

// ---------- display (India time) ----------
const DTF = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
// Built from the parts so the text is the same on the server and in the browser, whatever the locale data says.
const parts = (iso) => Object.fromEntries(DTF.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
export const fmtDay = (iso) => { if (ms(iso) === null) return ""; const p = parts(iso); return `${p.weekday}, ${p.day} ${p.month} ${p.year}`; };
export const fmtTime = (iso) => { if (ms(iso) === null) return ""; const p = parts(iso); return `${p.hour}:${p.minute} ${String(p.dayPeriod).toUpperCase()}`; };
export const fmtDateTime = (iso) => (ms(iso) === null ? "" : `${fmtDay(iso)}, ${fmtTime(iso)}`);

/** "Sat, 12 Dec 2026 · 9:00 AM – 1:00 PM" on one day; "Sat, 12 Dec 2026, 9:00 AM → Sun, 13 Dec 2026, 9:00 AM" over several. */
export function fmtRange(starts, ends) {
  if (ms(starts) === null) return ms(ends) === null ? "" : `Until ${fmtDateTime(ends)}`;
  if (ms(ends) === null) return fmtDateTime(starts);
  return fmtDay(starts) === fmtDay(ends) ? `${fmtDay(starts)} · ${fmtTime(starts)} – ${fmtTime(ends)}` : `${fmtDateTime(starts)} → ${fmtDateTime(ends)}`;
}
