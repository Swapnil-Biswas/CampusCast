import test from "node:test";
import assert from "node:assert/strict";
import { buildHackathonIcs, formatRupees, groupSchedule, hackathonPhase, scheduleStates, sortHackathons, telLink, waLink } from "../../lib/hackathons/status.js";

const t = (s) => new Date(`${s}:00+05:30`).getTime();
const H = { status: "published", registration_opens_at: "2026-11-20T10:00:00+05:30", deadline: "2026-12-10T18:00:00+05:30", starts_at: "2026-12-12T09:00:00+05:30", ends_at: "2026-12-13T09:00:00+05:30" };

test("a hackathon moves through its phases, each with the right countdown target", () => {
  const at = (when) => hackathonPhase(H, t(when));
  const before = at("2026-11-19T10:00");
  assert.deepEqual([before.key, before.target.label, before.target.at], ["upcoming", "Registration opens in", t("2026-11-20T10:00")]);
  const open = at("2026-12-01T10:00");
  assert.deepEqual([open.key, open.target.label, open.target.at], ["open", "Registration closes in", t("2026-12-10T18:00")]);
  assert.equal(at("2026-12-09T10:00").key, "closing");
  const closed = at("2026-12-11T10:00");
  assert.deepEqual([closed.key, closed.target.label], ["closed", "Starts in"]);
  const live = at("2026-12-12T10:00");
  assert.deepEqual([live.key, live.target.label, live.target.at], ["live", "Ends in", t("2026-12-13T09:00")]);
  assert.deepEqual([at("2026-12-13T09:00").key, at("2026-12-13T09:00").target], ["ended", null]);
});

test("a cancelled hackathon is cancelled whatever the dates say", () => {
  assert.deepEqual(hackathonPhase({ ...H, status: "cancelled" }, t("2026-12-12T10:00")), { key: "cancelled", label: "Cancelled", target: null });
});

test("with no end time, a hackathon is live for a day after it starts", () => {
  const h = { status: "published", deadline: "2026-12-10T18:00:00+05:30", starts_at: "2026-12-12T09:00:00+05:30" };
  const live = hackathonPhase(h, t("2026-12-12T20:00"));
  assert.deepEqual([live.key, live.target], ["live", null]);
  assert.equal(hackathonPhase(h, t("2026-12-13T10:00")).key, "ended");
});

test("with only a deadline (no start), it is open until the deadline and then closed", () => {
  const h = { status: "published", deadline: "2026-12-10T18:00:00+05:30" };
  assert.equal(hackathonPhase(h, t("2026-12-01T10:00")).key, "open");
  assert.equal(hackathonPhase(h, t("2026-12-11T10:00")).key, "ended");
});

test("with only a start (no deadline), registration is treated as open until the start", () => {
  const h = { status: "published", starts_at: "2026-12-12T09:00:00+05:30" };
  assert.equal(hackathonPhase(h, t("2026-12-01T10:00")).key, "open");
  assert.equal(hackathonPhase(h, t("2026-12-01T10:00")).target.at, t("2026-12-12T09:00"));
});

test("the list is ordered: live first, then the nearest coming date, then ended ones (most recent first)", () => {
  const mk = (id, over) => ({ id, status: "published", ...over });
  const list = [
    mk("ended-old", { deadline: "2026-09-01T10:00:00+05:30", starts_at: "2026-09-05T09:00:00+05:30", ends_at: "2026-09-06T09:00:00+05:30" }),
    mk("far", { deadline: "2027-01-10T10:00:00+05:30", starts_at: "2027-01-15T09:00:00+05:30" }),
    mk("live", { deadline: "2026-12-01T10:00:00+05:30", starts_at: "2026-12-10T09:00:00+05:30", ends_at: "2026-12-11T09:00:00+05:30" }),
    mk("soon", { deadline: "2026-12-14T10:00:00+05:30", starts_at: "2026-12-20T09:00:00+05:30" }),
    mk("ended-new", { deadline: "2026-11-01T10:00:00+05:30", starts_at: "2026-11-05T09:00:00+05:30", ends_at: "2026-11-06T09:00:00+05:30" }),
    mk("cancelled", { status: "cancelled", deadline: "2026-12-18T10:00:00+05:30", starts_at: "2026-12-19T09:00:00+05:30" }),
  ];
  assert.deepEqual(sortHackathons(list, t("2026-12-10T12:00")).map((h) => h.id), ["live", "soon", "far", "cancelled", "ended-new", "ended-old"]);
});

test("rupees, phone and WhatsApp links", () => {
  assert.equal(formatRupees(100000), "₹1,00,000");
  assert.equal(formatRupees(0), "₹0");
  assert.equal(formatRupees(null), null);
  assert.equal(telLink("+91 98450 12345"), "tel:+919845012345");
  assert.equal(telLink("080-6873 0418"), "tel:08068730418");
  assert.equal(telLink("call"), null);
  assert.equal(waLink("+91 98450 12345"), "https://wa.me/919845012345");
  assert.equal(waLink("98450 12345"), "https://wa.me/919845012345");
  assert.equal(waLink("098450 12345"), null);          // a leading 0 means a landline
  assert.equal(waLink("+1 415 555 0132"), "https://wa.me/14155550132");
  assert.equal(waLink("12345"), null);
  assert.equal(waLink("080-6873 0418"), null);
  assert.equal(waLink("98450 12345", "Hi there"), "https://wa.me/919845012345?text=Hi%20there");
});

const SCHEDULE = [
  { at: "2026-12-12T10:30:00+05:30", title: "Opening ceremony" },
  { at: "2026-12-12T09:00:00+05:30", endAt: "2026-12-12T10:00:00+05:30", title: "Registration" },
  { at: "2026-12-13T09:00:00+05:30", title: "Final presentations" },
  { at: null, title: "Judging" },
];

test("the programme is grouped by day in India time and sorted; untimed items come last", () => {
  const g = groupSchedule(SCHEDULE);
  assert.deepEqual(g.map((x) => x.heading), ["Saturday, 12 December", "Sunday, 13 December", "Time to be announced"]);
  assert.deepEqual(g[0].items.map((e) => e.title), ["Registration", "Opening ceremony"]);
  assert.deepEqual(g[2].items.map((e) => e.title), ["Judging"]);
  assert.equal(groupSchedule([]).length, 0);
  // an item at 00:30 IST belongs to that day, not the previous UTC day
  assert.equal(groupSchedule([{ at: "2026-12-13T00:30:00+05:30", title: "Midnight" }])[0].day, "2026-12-13");
});

test("what is happening now, what is next, what is over", () => {
  const states = (when) => [...scheduleStates(SCHEDULE, t(when)).entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  // indexes follow the order given: [Opening, Registration, Final, Judging]
  assert.deepEqual(states("2026-12-12T08:00"), ["later", "next", "later", "later"]);
  assert.deepEqual(states("2026-12-12T09:30"), ["next", "now", "later", "later"]);
  assert.deepEqual(states("2026-12-12T10:15"), ["next", "past", "later", "later"]);
  assert.deepEqual(states("2026-12-12T11:00"), ["past", "past", "next", "later"]);   // opening had no end: it lasted 30 minutes
  assert.deepEqual(states("2026-12-13T09:10"), ["past", "past", "now", "later"]);
  assert.deepEqual(states("2026-12-13T12:00"), ["past", "past", "past", "later"]);
});

test("the calendar file has the event, the registration deadline and every programme item, and no alarms", () => {
  const ics = buildHackathonIcs({ id: "abc", title: "BuildSprint 2026", location: "Hall 2, Block A", organizer_name: "Coding Club", prize: "Rs. 1,00,000", website_url: "https://x.example.com/", ...H, schedule: SCHEDULE }, { nowMs: t("2026-12-01T10:00") });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 5);          // event + registration + 3 timed items
  assert.ok(ics.includes("SUMMARY:BuildSprint 2026"));
  assert.ok(ics.includes("DTSTART:20261212T033000Z"));                  // 09:00 IST
  assert.ok(ics.includes("DTEND:20261213T033000Z"));
  assert.ok(ics.includes("SUMMARY:Registration closes: BuildSprint 2026"));
  assert.ok(ics.includes("DTSTART:20261210T123000Z"));                  // 18:00 IST
  assert.ok(ics.includes("SUMMARY:Opening ceremony (BuildSprint 2026)"));
  assert.ok(ics.includes("LOCATION:Hall 2\\, Block A"));
  assert.ok(!ics.includes("VALARM"));
  assert.ok(ics.split("\r\n").every((l) => l.length <= 75));
});

test("the calendar file copes with a hackathon that has only a deadline", () => {
  const ics = buildHackathonIcs({ id: "z", title: "Quick one", deadline: "2026-12-10T18:00:00+05:30", schedule: [] }, { nowMs: 0 });
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.ok(ics.includes("Registration closes: Quick one"));
});

import { fmtDateTime, fmtRange } from "../../lib/hackathons/status.js";

test("dates are shown in India time, on one line, whether the event is one day or several", () => {
  assert.equal(fmtDateTime("2026-12-12T03:30:00Z"), "Sat, 12 Dec 2026, 9:00 AM");
  assert.equal(fmtDateTime(null), "");
  assert.equal(fmtRange("2026-12-12T03:30:00Z", "2026-12-12T07:30:00Z"), "Sat, 12 Dec 2026 · 9:00 AM – 1:00 PM");
  assert.equal(fmtRange("2026-12-12T03:30:00Z", "2026-12-13T03:30:00Z"), "Sat, 12 Dec 2026, 9:00 AM → Sun, 13 Dec 2026, 9:00 AM");
  assert.equal(fmtRange("2026-12-12T03:30:00Z", null), "Sat, 12 Dec 2026, 9:00 AM");
  assert.equal(fmtRange(null, null), "");
});

test("the calendar file puts the venue address in the location", () => {
  const ics = buildHackathonIcs({ id: "q", title: "Hack", location: "CMR Institute of Technology", venue_address: "AECS Layout, Bengaluru", starts_at: "2026-12-12T09:00:00+05:30", schedule: [] }, { nowMs: 0 });
  assert.ok(ics.includes(String.raw`LOCATION:CMR Institute of Technology\, AECS Layout\, Bengaluru`));
});
