import test from "node:test";
import assert from "node:assert/strict";
import { cleanEmail, cleanPhone, cleanUrl, matchClub, normalizeHackathon, parseDateTime, parseRupees } from "../../lib/hackathons/normalize.js";
import { F, MISSING } from "../exams/fixtures.mjs";
import { CLUBS, NOW, goodRaw } from "./fixtures.mjs";

const norm = (raw) => normalizeHackathon(raw, { clubs: CLUBS, filename: "poster.jpg", pageCount: 1, now: NOW });

test("a clean poster is read in full and always needs a person's review", () => {
  const n = norm(goodRaw());
  assert.equal(n.ok, true);
  assert.equal(n.requiresReview, true);
  const r = n.result;
  assert.equal(r.name, "BuildSprint 2026");
  assert.equal(r.clubName, "Coding Club");
  assert.equal(r.organizerName, "Coding Club, BMSIT&M");
  assert.equal(r.mode, "offline");
  assert.equal(r.startsAt, "2026-12-12T09:00:00+05:30");
  assert.equal(r.endsAt, "2026-12-13T09:00:00+05:30");
  assert.equal(r.registrationOpensAt, "2026-11-20T10:00:00+05:30");
  assert.equal(r.deadline, "2026-12-10T18:00:00+05:30");
  assert.deepEqual([r.teamMin, r.teamMax], [2, 4]);
  assert.equal(r.feeAmount, 0);
  assert.equal(r.prizeAmount, 100000);
  assert.equal(r.prizes.length, 3);
  assert.equal(r.contactPhone, "+91 98450 12345");
  assert.equal(r.contactEmail, "codingclub@bmsit.in");
  assert.equal(r.websiteUrl, "https://www.buildsprint.example.com/");
  assert.equal(r.registrationUrl, "https://buildsprint.example.com/register");
  assert.deepEqual(r.tracks, ["AI", "Web", "Open"]);
  assert.equal(r.sourceDocument.kind, "scanned");
  assert.equal(n.warnings.length, 0);
});

test("the schedule is sorted by time, and 'Day 2' with no date is placed from the start date", () => {
  const s = norm(goodRaw()).result.schedule;
  assert.deepEqual(s.map((e) => e.title), ["Registration and breakfast", "Opening ceremony", "Problem statements released", "Final presentations"]);
  assert.equal(s[0].at, "2026-12-12T09:00:00+05:30");
  assert.equal(s[0].endAt, "2026-12-12T10:00:00+05:30");
  assert.equal(s[3].at, "2026-12-13T09:00:00+05:30");
});

test("schedule entries with no time or day are kept at the end and flagged", () => {
  const raw = goodRaw();
  raw.schedule.push({ date: null, time: null, endTime: null, title: "Judging", note: null, day: null, page: 1 });
  const n = norm(raw);
  const last = n.result.schedule.at(-1);
  assert.equal(last.title, "Judging");
  assert.equal(last.at, null);
  assert.equal(last.needsReview, true);
  assert.ok(n.warnings.some((w) => w.code === "schedule_no_time"));
});

test("dates in different styles are read as India time; a missing time is flagged, not invented", () => {
  assert.deepEqual(parseDateTime("2026-12-12 09:00"), { date: "2026-12-12", time: "09:00", hasTime: true, converted: false, ambiguous: false });
  assert.equal(parseDateTime("12/12/2026 9:30 AM").time, "09:30");
  assert.equal(parseDateTime("12/12/2026 9:30 AM").converted, true);
  assert.equal(parseDateTime("12 Dec 2026, 2 PM").time, "14:00");
  assert.equal(parseDateTime("2026-12-12T18:45").time, "18:45");
  assert.equal(parseDateTime("12.12.2026").date, "2026-12-12");
  assert.equal(parseDateTime("2026-12-12", { dateOnlyTime: "23:59" }).time, "23:59");
  assert.equal(parseDateTime("2026-12-12").hasTime, false);
  assert.equal(parseDateTime("31/02/2026"), null);
  assert.equal(parseDateTime("sometime in December"), null);
  const n = norm(goodRaw({ registrationDeadline: F("2026-12-10") }));
  assert.equal(n.result.deadline, "2026-12-10T23:59:00+05:30");
  assert.ok(n.warnings.some((w) => w.code === "time_not_stated" && w.field === "registrationDeadline"));
  assert.equal(n.fieldMeta.registrationDeadline.needsReview, true);
});

test("an end before the start, or registration opening after it closes, is dropped with a warning", () => {
  const n = norm(goodRaw({ endsAt: F("2026-12-11 09:00"), registrationOpensAt: F("2026-12-11 09:00") }));
  assert.equal(n.result.endsAt, null);
  assert.equal(n.result.registrationOpensAt, null);
  assert.ok(n.warnings.some((w) => w.code === "ends_before_start"));
  assert.ok(n.warnings.some((w) => w.code === "opens_after_deadline"));
});

test("a year that is far from today is treated as a misread and left empty", () => {
  const n = norm(goodRaw({ startsAt: F("2031-12-12 09:00") }));
  assert.equal(n.result.startsAt, null);
  assert.ok(n.warnings.some((w) => w.code === "date_out_of_range"));
});

test("money: rupees in the usual written forms, and nothing for unclear amounts", () => {
  assert.equal(parseRupees(100000), 100000);
  assert.equal(parseRupees("Rs. 1,00,000"), 100000);
  assert.equal(parseRupees("₹50,000/-"), 50000);
  assert.equal(parseRupees("1 lakh"), 100000);
  assert.equal(parseRupees("2.5 lakhs"), 250000);
  assert.equal(parseRupees("50K"), 50000);
  assert.equal(parseRupees("free"), 0);
  assert.equal(parseRupees("worth lakhs"), null);
  assert.equal(parseRupees(-5), null);
  assert.equal(parseRupees(1e12), null);
  assert.equal(parseRupees(null), null);
});

test("without a printed total, the prize pool is added up from the prizes and flagged; a total smaller than the prizes is flagged", () => {
  const n = norm(goodRaw({ prizePoolAmount: MISSING(), prizePoolText: MISSING() }));
  assert.equal(n.result.prizeAmount, 100000);
  assert.ok(n.warnings.some((w) => w.code === "prize_total_derived"));
  assert.equal(n.fieldMeta.prizePoolAmount.needsReview, true);
  assert.equal(n.fieldMeta.prizePoolAmount.source, "inferred");
  const m = norm(goodRaw({ prizePoolAmount: F(50000) }));
  assert.ok(m.warnings.some((w) => w.code === "prize_total_mismatch"));
  const vague = norm(goodRaw({ prizePoolAmount: MISSING(), prizePoolText: F("Prizes worth lakhs") }));
  assert.equal(vague.result.prizeAmount, null);
});

test("phone numbers are cleaned, and things that are not phone numbers are dropped", () => {
  assert.equal(cleanPhone("Contact: +91 98450 12345 (Aarav)"), "+91 98450 12345");
  assert.equal(cleanPhone("98450-12345"), "98450-12345");
  assert.equal(cleanPhone("080-6873 0418"), "080-6873 0418");
  assert.equal(cleanPhone("call us"), null);
  assert.equal(cleanPhone("1234"), null);
  assert.equal(cleanPhone("12345678901234567890"), null);
  const n = norm(goodRaw({ contactPhone: F("ask the office") }));
  assert.equal(n.result.contactPhone, null);
  assert.ok(n.warnings.some((w) => w.code === "phone_unreadable"));
});

test("emails and links: only real ones, only http(s), never credentials or scripts", () => {
  assert.equal(cleanEmail("Mailto:Club@BMSIT.in."), "club@bmsit.in");
  assert.equal(cleanEmail("not an email"), null);
  assert.equal(cleanUrl("www.example.com/register"), "https://www.example.com/register");
  assert.equal(cleanUrl("https://example.com/a?b=1)."), "https://example.com/a?b=1");
  assert.equal(cleanUrl("javascript:alert(1)"), null);
  assert.equal(cleanUrl("data:text/html,<script>"), null);
  assert.equal(cleanUrl("ftp://example.com/x"), null);
  assert.equal(cleanUrl("https://user:pass@example.com"), null);
  assert.equal(cleanUrl("localhost"), null);
  assert.equal(cleanUrl("just words"), null);
  const n = norm(goodRaw({ registrationUrl: F("javascript:alert(1)") }));
  assert.equal(n.result.registrationUrl, null);
  assert.ok(n.warnings.some((w) => w.code === "link_unusable"));
});

test("clubs: an exact or clearly contained name matches; unknown or ambiguous ones do not", () => {
  assert.equal(matchClub("Coding Club", CLUBS), "Coding Club");
  assert.equal(matchClub("The Coding Club, BMSIT", CLUBS), "Coding Club");
  assert.equal(matchClub("coding club", CLUBS), "Coding Club");
  assert.equal(matchClub("Chess Club", CLUBS), null);
  assert.equal(matchClub("Club", CLUBS), null);
  assert.equal(matchClub("", CLUBS), null);
  const n = norm(goodRaw({ clubName: F("Chess Club"), organizer: F("Chess Club of BMSIT") }));
  assert.equal(n.result.clubName, null);
  assert.equal(n.result.organizerName, "Chess Club of BMSIT");
  assert.ok(n.warnings.some((w) => w.code === "club_unrecognised"));
});

test("team size: out-of-range values are dropped and a reversed pair is swapped", () => {
  const swapped = norm(goodRaw({ teamMin: F(5), teamMax: F(2) }));
  assert.deepEqual([swapped.result.teamMin, swapped.result.teamMax], [2, 5]);
  assert.ok(swapped.warnings.some((w) => w.code === "team_swapped"));
  const wild = norm(goodRaw({ teamMin: F(0), teamMax: F(50) }));
  assert.deepEqual([wild.result.teamMin, wild.result.teamMax], [null, null]);
});

test("things the poster does not say stay empty and flagged: nothing is invented", () => {
  const n = norm(goodRaw({ contactPhone: MISSING(), contactEmail: MISSING(), websiteUrl: MISSING(), registrationUrl: MISSING(), feeAmount: MISSING(), mode: MISSING(), venue: MISSING() }));
  const r = n.result;
  assert.deepEqual([r.contactPhone, r.contactEmail, r.websiteUrl, r.registrationUrl, r.feeAmount, r.mode, r.venue], [null, null, null, null, null, null, null]);
  for (const k of ["contactPhone", "contactEmail", "websiteUrl", "registrationUrl", "feeAmount", "mode", "venue"]) assert.equal(n.fieldMeta[k].needsReview, true, k);
});

test("an inferred or low-confidence value is flagged for checking; a clear one is not", () => {
  const n = norm(goodRaw({ venue: F("Seminar Hall 2", "inferred", 0.6), theme: F("AI for Good", "explicit", 0.95) }));
  assert.equal(n.fieldMeta.venue.needsReview, true);
  assert.equal(n.fieldMeta.theme.needsReview, false);
});

test("text is cleaned and capped, lists are limited, unknown keys are dropped", () => {
  const n = norm(goodRaw({ name: F("  Build\u0000Sprint\n 2026  "), tagline: F("x".repeat(500)), tracks: F(Array.from({ length: 40 }, (_, i) => `Track ${i}`)), evil: F("drop me") }));
  assert.equal(n.result.name, "Build Sprint 2026");
  assert.equal(n.result.tagline.length, 160);
  assert.equal(n.result.tracks.length, 20);
  assert.ok(!("evil" in n.result));
});

test("a wrong-shaped answer is rejected", () => {
  assert.equal(normalizeHackathon(null, { clubs: CLUBS }).ok, false);
  assert.equal(normalizeHackathon({ hackathon: "x" }, { clubs: CLUBS }).ok, false);
  assert.equal(normalizeHackathon({ notice: {} }, { clubs: CLUBS }).ok, false);
});

// ---- links read from QR codes on the poster ----
const noLinks = { websiteUrl: MISSING(), registrationUrl: MISSING() };

test("a QR code captioned 'register' becomes the registration link, flagged for the club admin to confirm", () => {
  const n = normalizeHackathon(goodRaw({ ...noLinks, qrCodeLabel: F("Scan to register") }), { clubs: CLUBS, now: NOW, qrLinks: ["https://forms.example.com/buildsprint"] });
  assert.equal(n.result.registrationUrl, "https://forms.example.com/buildsprint");
  assert.equal(n.result.websiteUrl, null);
  assert.deepEqual(n.result.qrLinks, ["https://forms.example.com/buildsprint"]);
  assert.equal(n.fieldMeta.registrationUrl.evidence, "Read from the QR code on the poster");
  assert.equal(n.fieldMeta.registrationUrl.needsReview, true);
  assert.ok(n.warnings.some((w) => w.code === "qr_link_used" && /forms\.example\.com/.test(w.message)));
});

test("a QR code with no caption becomes the website link when there is none", () => {
  const n = normalizeHackathon(goodRaw(noLinks), { clubs: CLUBS, now: NOW, qrLinks: ["https://buildsprint.example.com/"] });
  assert.equal(n.result.websiteUrl, "https://buildsprint.example.com/");
  assert.equal(n.fieldMeta.websiteUrl.needsReview, true);
});

test("a link the AI already read from the printed text is never replaced by a QR link", () => {
  const n = normalizeHackathon(goodRaw({ qrCodeLabel: F("Scan to register") }), { clubs: CLUBS, now: NOW, qrLinks: ["https://other.example.com/"] });
  assert.equal(n.result.websiteUrl, "https://www.buildsprint.example.com/");
  assert.equal(n.result.registrationUrl, "https://buildsprint.example.com/register");
  assert.ok(!n.warnings.some((w) => w.code === "qr_link_used"));
  assert.deepEqual(n.result.qrLinks, ["https://other.example.com/"]);   // still recorded, so the admin can see it
});

test("a QR link that matches a printed link is not used twice; unsafe or empty QR links are dropped", () => {
  const same = normalizeHackathon(goodRaw(), { clubs: CLUBS, now: NOW, qrLinks: ["https://buildsprint.example.com/register"] });
  assert.ok(!same.warnings.some((w) => w.code === "qr_link_used"));
  const bad = normalizeHackathon(goodRaw(noLinks), { clubs: CLUBS, now: NOW, qrLinks: ["javascript:alert(1)", "", null, "ftp://x.example.com"] });
  assert.equal(bad.result.websiteUrl, null);
  assert.equal(bad.result.registrationUrl, null);
  assert.deepEqual(bad.result.qrLinks, []);
});

test("two QR codes fill both slots: the captioned one is the registration page, the other is the website", () => {
  const n = normalizeHackathon(goodRaw({ ...noLinks, qrCodeLabel: F("Scan to register") }), { clubs: CLUBS, now: NOW, qrLinks: ["https://forms.example.com/r", "https://club.example.com/"] });
  assert.equal(n.result.registrationUrl, "https://forms.example.com/r");
  assert.equal(n.result.websiteUrl, "https://club.example.com/");
});

test("with no QR links nothing changes", () => {
  const n = normalizeHackathon(goodRaw(), { clubs: CLUBS, now: NOW });
  assert.deepEqual(n.result.qrLinks, []);
  assert.equal(n.warnings.length, 0);
});

// ---- venue: outside BMSIT? ----
test("the AI's 'outside the campus' is kept and flagged for the admin; the address is cleaned", () => {
  const n = norm(goodRaw({ venue: F("CMR Institute of Technology"), venueAddress: F("  3rd Cross Road, AECS Layout, Bengaluru "), offCampus: F(true) }));
  assert.equal(n.result.offCampus, true);
  assert.equal(n.result.venueAddress, "3rd Cross Road, AECS Layout, Bengaluru");
  assert.equal(n.fieldMeta.offCampus.needsReview, true);
});

test("a venue that names BMSIT is on campus whatever the AI says; unclear means on campus", () => {
  assert.equal(norm(goodRaw({ venue: F("Seminar Hall 2, BMSIT&M"), offCampus: F(true) })).result.offCampus, false);
  assert.equal(norm(goodRaw({ venue: F("Auditorium, BMS Institute of Technology and Management"), offCampus: F(true) })).result.offCampus, false);
  assert.equal(norm(goodRaw({ venue: F("BMSCE Basavanagudi"), offCampus: F(true) })).result.offCampus, true, "BMS College of Engineering is a different college");
  assert.equal(norm(goodRaw({ offCampus: MISSING() })).result.offCampus, false);
  assert.equal(norm(goodRaw({ offCampus: F("yes") })).result.offCampus, false, "only a real true counts");
});
