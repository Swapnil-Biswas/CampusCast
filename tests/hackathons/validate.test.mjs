import test from "node:test";
import assert from "node:assert/strict";
import { publishIssues, toIso, toLocalInput, validateHackathon } from "../../lib/hackathons/validate.js";

const CLUB = "3f0c1c52-0000-4000-8000-000000000001";
const OTHER = "3f0c1c52-0000-4000-8000-000000000002";
const clubs = [{ id: CLUB, name: "Coding Club" }];
const good = (over = {}) => ({
  title: "BuildSprint 2026", clubId: CLUB, mode: "offline", theme: "AI for Good",
  registrationOpensAt: "2026-11-20T10:00", deadline: "2026-12-10T18:00", startsAt: "2026-12-12T09:00", endsAt: "2026-12-13T09:00",
  teamMin: 2, teamMax: 4, prizeAmount: "1,00,000", feeFree: true, location: "Seminar Hall 2",
  contactPhone: "+91 98450 12345", contactEmail: "club@bmsit.in", websiteUrl: "www.buildsprint.example.com", link: "https://buildsprint.example.com/register",
  prizeBreakdown: [{ label: "Winner", amount: "50000" }, { label: "", amount: "" }],
  schedule: [{ at: "2026-12-12T10:30", title: "Opening ceremony" }, { at: "2026-12-12T09:00", endAt: "2026-12-12T10:00", title: "Registration" }],
  tracks: ["AI", "Web"], perks: "Certificates\nInternships\n", rules: ["Bring a laptop"], sponsors: "",
  ...over,
});
const run = (over, opts = {}) => validateHackathon(good(over), { clubs, isAdmin: false, ...opts });

test("a good form is accepted and turned into database values, with times as India time", () => {
  const r = run();
  assert.equal(r.ok, true);
  const p = r.patch;
  assert.equal(p.title, "BuildSprint 2026");
  assert.equal(p.club_id, CLUB);
  assert.equal(p.starts_at, "2026-12-12T09:00:00+05:30");
  assert.equal(p.deadline, "2026-12-10T18:00:00+05:30");
  assert.equal(p.prize_amount, 100000);
  assert.equal(p.fee_amount, 0);
  assert.equal(p.website_url, "https://www.buildsprint.example.com/");
  assert.equal(p.contact_phone, "+91 98450 12345");
  assert.deepEqual(p.prize_breakdown, [{ label: "Winner", amount: 50000, note: null }]);
  assert.deepEqual(r.details.perks, ["Certificates", "Internships"]);
  assert.deepEqual(r.details.sponsors, []);
});

test("the programme is sorted by time", () => {
  assert.deepEqual(run().patch.schedule.map((e) => e.title), ["Registration", "Opening ceremony"]);
});

test("a name is needed, and a club or an organiser's name", () => {
  assert.equal(run({ title: "ab" }).ok, false);
  const noClub = run({ clubId: "" });
  assert.equal(noClub.ok, false);
  assert.match(noClub.errors[0], /club/i);
  assert.equal(run({ clubId: "", organizerName: "Placement Cell" }, { isAdmin: true }).ok, true);
  assert.equal(run({ clubId: "", organizerName: "" }, { isAdmin: true }).ok, false);
});

test("a club admin can only post for a club they lead", () => {
  const r = run({ clubId: OTHER });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /one of your clubs/);
});

test("dates must be real, in order, and the deadline cannot be long after the start", () => {
  assert.equal(toIso("2026-12-12T09:00"), "2026-12-12T09:00:00+05:30");
  assert.equal(toIso("2026-12-12T09:00:00+00:00"), "2026-12-12T09:00:00+00:00");
  assert.equal(toIso("2026-02-31T09:00"), null);
  assert.equal(toIso("2026-12-12T25:00"), null);
  assert.equal(toIso("tomorrow"), null);
  assert.equal(toLocalInput("2026-12-12T03:30:00Z"), "2026-12-12T09:00");
  assert.equal(toLocalInput(null), "");
  assert.equal(run({ endsAt: "2026-12-11T09:00" }).ok, false);
  assert.equal(run({ registrationOpensAt: "2026-12-11T00:00" }).ok, false);
  assert.equal(run({ deadline: "2026-12-20T09:00" }).ok, false);
  assert.equal(run({ startsAt: "2026-02-31T09:00" }).ok, false);
});

test("team sizes: whole numbers from 1 to 10, smallest not above largest", () => {
  assert.equal(run({ teamMin: 5, teamMax: 2 }).ok, false);
  assert.equal(run({ teamMin: 0 }).ok, false);
  assert.equal(run({ teamMax: 11 }).ok, false);
  assert.equal(run({ teamMax: 2.5 }).ok, false);
  const defaults = run({ teamMin: "", teamMax: "" });
  assert.deepEqual([defaults.patch.team_min, defaults.patch.team_max], [1, 4]);
});

test("money must be a plain amount of rupees; free entry is zero", () => {
  assert.equal(run({ prizeAmount: "lots" }).ok, false);
  assert.equal(run({ prizeAmount: -5 }).ok, false);
  assert.equal(run({ feeFree: false, feeAmount: "abc" }).ok, false);
  const paid = run({ feeFree: false, feeAmount: "₹250" });
  assert.equal(paid.patch.fee_amount, 250);
  assert.equal(run({ feeFree: false, feeAmount: "" }).patch.fee_amount, null);
  assert.equal(run({ prizeBreakdown: [{ label: "Winner", amount: "much" }] }).ok, false);
  assert.equal(run({ prizeBreakdown: [{ label: "", amount: "100" }] }).ok, false);
});

test("a typed phone, email or link that is wrong is refused, not dropped; unsafe links are refused", () => {
  assert.equal(run({ contactPhone: "call me" }).ok, false);
  assert.equal(run({ contactEmail: "nope" }).ok, false);
  assert.equal(run({ websiteUrl: "javascript:alert(1)" }).ok, false);
  assert.equal(run({ link: "ftp://x.example.com" }).ok, false);
  assert.equal(run({ mapUrl: "data:text/html,x" }).ok, false);
  const empty = run({ contactPhone: "", contactEmail: "", websiteUrl: "", link: "", mapUrl: "" });
  assert.equal(empty.ok, true);
  assert.deepEqual([empty.patch.contact_phone, empty.patch.website_url, empty.patch.link], [null, null, null]);
});

test("programme entries need a title and a real time, and cannot end before they start", () => {
  assert.equal(run({ schedule: [{ at: "", title: "Lunch" }] }).ok, false);
  assert.equal(run({ schedule: [{ at: "2026-12-12T13:00", title: "" , note: "x" }] }).ok, false);
  assert.equal(run({ schedule: [{ at: "2026-12-12T13:00", endAt: "2026-12-12T12:00", title: "Lunch" }] }).ok, false);
  assert.equal(run({ schedule: [{ at: "", title: "", note: "" }] }).ok, true);
  assert.equal(run({ schedule: Array.from({ length: 150 }, (_, i) => ({ at: "2026-12-12T09:00", title: `E${i}` })) }).patch.schedule.length, 100);
});

test("lists and text are capped and cleaned", () => {
  const r = run({ title: "  Build\u0000Sprint  ", tagline: "x".repeat(500), tracks: Array.from({ length: 40 }, (_, i) => `T${i}`), description: "d".repeat(9000) });
  assert.equal(r.patch.title, "BuildSprint");
  assert.equal(r.patch.tagline.length, 160);
  assert.equal(r.patch.tracks.length, 20);
  assert.equal(r.patch.description.length, 4000);
  assert.equal(validateHackathon(null, {}).ok, false);
});

test("before publishing: a name, a date and an organiser are required; the rest are hints about what students will miss", () => {
  const full = publishIssues({ title: "BuildSprint", deadline: "x", club_id: "c", location: "Hall", starts_at: "x", prize_amount: 1, contact_phone: "1", website_url: "https://x.example.com/", schedule: [{}], fee_amount: 0 });
  assert.deepEqual(full, { blocking: [], hints: [] });
  const bare = publishIssues({ title: "", club_id: null, schedule: [] });
  assert.equal(bare.blocking.length, 3);
  assert.ok(bare.hints.some((h) => /No contact/.test(h)));
  assert.ok(bare.hints.some((h) => /no QR code/.test(h)));
  assert.ok(bare.hints.some((h) => /No venue/.test(h)));
  assert.equal(publishIssues({ title: "BuildSprint", starts_at: "x", organizer_name: "Placement Cell" }).blocking.length, 0);
});
