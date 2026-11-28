import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWorkshop } from "../../lib/workshops/normalize.js";
import { planWorkshopApply } from "../../lib/workshops/plan.js";
import { publishIssues, validateWorkshop } from "../../lib/workshops/validate.js";
import { workshopPhase } from "../../lib/workshops/status.js";
import { runWorkshopExtraction } from "../../lib/workshops/process.js";
import { WORKSHOP_TOOL } from "../../lib/workshops/task.js";

const NOW = new Date("2026-11-28T10:00:00+05:30");
const CLUB = { id: "11111111-1111-1111-1111-111111111111", name: "Coding Club" };
const f = (value, over = {}) => ({ value, source: value === null ? "missing" : "explicit", confidence: value === null ? 0 : 0.95, pages: [1], evidence: "", ...over });
const raw = (over = {}) => {
  const values = {
    name: "Git and GitHub Workshop", tagline: null, description: "Learn version control.", topics: ["Commits", "Pull requests"], organizer: "Coding Club, BMSIT", clubName: "Coding Club",
    speakerName: "Asha", speakerAbout: "Engineer", mode: "offline", venue: "Lab 3", mapLink: null, startsAt: "12/12/2026 10:00 AM", endsAt: "2026-12-12 16:00", registrationDeadline: "10/12/2026",
    seats: 60, feeAmount: 0, feeNote: null, eligibility: "All students", prerequisites: "Bring a laptop", perks: ["Certificate"], contactName: "Ravi", contactPhone: "+91 98450 12345",
    contactEmail: "club@bmsit.in", websiteUrl: null, registrationUrl: "www.example.com/join", qrCodeLabel: null, ...over,
  };
  return { documentKind: "scanned", workshop: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, f(v)])) };
};
const norm = (over, opts = {}) => normalizeWorkshop(raw(over), { clubs: [CLUB], now: NOW, ...opts });

test("a poster's details are read, with Indian day-first dates", () => {
  const { result: r, fieldMeta } = norm();
  assert.equal(r.startsAt, "2026-12-12T10:00:00+05:30");
  assert.equal(r.deadline, "2026-12-10T23:59:00+05:30");
  assert.equal(r.seats, 60);
  assert.equal(r.feeAmount, 0);
  assert.equal(r.clubName, "Coding Club");
  assert.equal(r.registrationUrl, "https://www.example.com/join");
  assert.equal(fieldMeta.name.needsReview, false);
  assert.equal(fieldMeta.registrationDeadline.needsReview, true);   // the time was not printed
});

test("bad or invented values are dropped and flagged", () => {
  const { result: r, fieldMeta, warnings } = norm({ seats: null, contactPhone: "call us", websiteUrl: "javascript:alert(1)", clubName: "Hackers", organizer: "Someone", endsAt: "2026-12-01 10:00", startsAt: "12/12/2026" });
  assert.equal(r.seats, null);
  assert.equal(fieldMeta.seats.needsReview, true);
  assert.equal(r.contactPhone, null);
  assert.equal(r.websiteUrl, null);
  assert.equal(r.clubName, null);
  assert.equal(r.endsAt, null);
  assert.ok(warnings.some((w) => w.code === "seats_not_stated"));
  assert.ok(warnings.some((w) => w.code === "time_not_stated"));
});

test("a QR code fills the registration link only when none is printed", () => {
  assert.equal(norm({ registrationUrl: null }, { qrLinks: ["https://forms.example.org/a"] }).result.registrationUrl, "https://forms.example.org/a");
  const both = norm({}, { qrLinks: ["https://forms.example.org/a"] }).result;
  assert.equal(both.registrationUrl, "https://www.example.com/join");
  assert.equal(both.websiteUrl, "https://forms.example.org/a");
});

test("an answer in the wrong shape is refused", () => assert.equal(normalizeWorkshop({ nope: 1 }).ok, false));

test("the draft is filled once, without status, and keeps the chosen club", () => {
  const draft = { club_id: "chosen", starts_at: null, details: {} };
  const { patch } = planWorkshopApply(draft, norm({ seats: null, registrationDeadline: "13/12/2026" }), { clubs: [CLUB], extractionId: "x" });
  assert.equal("status" in patch, false);
  assert.equal("club_id" in patch, false);
  assert.equal("seats" in patch, false);                 // the default of 50 stays
  assert.equal("reg_closes_at" in patch, false);         // after the start
  assert.deepEqual(patch.details.perks, ["Certificate"]);
  assert.equal(planWorkshopApply({ ...draft, details: patch.details }, norm()).skip, true);
  assert.equal(planWorkshopApply({ details: {} }, norm(), { clubs: [CLUB] }).patch.club_id, CLUB.id);
});

const form = (over = {}) => ({ title: "Git workshop", clubId: CLUB.id, startsAt: "2026-12-12T10:00", endsAt: "", deadline: "", seats: "40", feeFree: true, topics: "a\n\nb", audienceDepts: ["Nope"], audienceYears: ["2", 9], ...over });

test("the editor's values are checked again on the server", () => {
  const ok = validateWorkshop(form(), { clubs: [CLUB] });
  assert.equal(ok.ok, true);
  assert.equal(ok.patch.starts_at, "2026-12-12T10:00:00+05:30");
  assert.deepEqual(ok.patch.topics, ["a", "b"]);
  assert.equal(ok.patch.audience_depts, null);
  assert.deepEqual(ok.patch.audience_years, [2]);
  assert.equal("status" in ok.patch, false);
  for (const bad of [{ title: "x" }, { clubId: "" }, { clubId: "22222222-2222-2222-2222-222222222222" }, { seats: 0 }, { endsAt: "2026-12-11T10:00" }, { deadline: "2026-12-13T10:00" }, { link: "javascript:x" }, { feeFree: false, feeAmount: "abc" }]) {
    assert.equal(validateWorkshop(form(bad), { clubs: [CLUB] }).ok, false, JSON.stringify(bad));
  }
  assert.equal(validateWorkshop(form({ clubId: "" }), { clubs: [CLUB], isAdmin: true }).ok, true);
});

test("publishing needs a date", () => {
  assert.ok(publishIssues({ title: "Git workshop", starts_at: null }).blocking.length);
  assert.equal(publishIssues({ title: "Git workshop", starts_at: "2026-12-12T10:00:00+05:30" }, NOW.getTime()).blocking.length, 0);
});

test("a workshop's phase follows the clock", () => {
  const w = { starts_at: "2026-12-12T10:00:00+05:30", ends_at: "2026-12-12T16:00:00+05:30", reg_closes_at: "2026-12-10T18:00:00+05:30" };
  const at = (t, over = {}) => workshopPhase({ ...w, ...over }, new Date(t).getTime()).key;
  assert.equal(at("2026-11-28T10:00:00+05:30"), "open");
  assert.equal(at("2026-12-09T10:00:00+05:30"), "closing");
  assert.equal(at("2026-12-11T10:00:00+05:30"), "closed");
  assert.equal(at("2026-12-12T12:00:00+05:30"), "live");
  assert.equal(at("2026-12-12T17:00:00+05:30"), "ended");
  assert.equal(at("2026-11-28T10:00:00+05:30", { status: "cancelled" }), "cancelled");
});

// A small stand-in for the Supabase client: just the calls one reading makes.
function world(status = "draft") {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7), Buffer.from([0xff, 0xd9])]);
  const rows = {
    workshop_extractions: { id: "x1", document_id: "d1", status: "queued" },
    workshop_documents: { id: "d1", workshop_id: "w1", storage_path: "u/f.jpg", original_filename: "p.jpg", page_count: null },
    workshops: { id: "w1", status, club_id: null, starts_at: null, details: {} },
    clubs: [CLUB],
  };
  const from = (table) => {
    let patch = null;
    const done = async () => { if (patch) Object.assign(rows[table], patch); return { data: rows[table], error: null }; };
    const b = { select: () => b, update: (p) => { patch = p; return b; }, eq: () => b, or: () => b, order: () => b, single: done, maybeSingle: done, then: (a, c) => done().then(a, c) };
    return b;
  };
  return { rows, supabase: { from, storage: { from: () => ({ download: async () => ({ data: { arrayBuffer: async () => jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.length) }, error: null }) }) } } };
}
const answer = async () => ({ ok: true, status: 200, json: async () => ({ model: "m", stop_reason: "tool_use", content: [{ type: "tool_use", name: WORKSHOP_TOOL.name, input: raw() }] }) });
const read = (supabase, fetchImpl) => runWorkshopExtraction({ supabase, extractionId: "x1", providers: [{ provider: "anthropic", apiKey: "k", model: "m" }], fetchImpl, sleep: async () => {}, now: NOW });

test("a poster is read and the draft is filled, never published", async () => {
  const { rows, supabase } = world();
  assert.deepEqual(await read(supabase, answer), { state: "completed" });
  assert.equal(rows.workshop_extractions.status, "completed");
  assert.equal(rows.workshops.title, "Git and GitHub Workshop");
  assert.equal(rows.workshops.seats, 60);
  assert.equal(rows.workshops.status, "draft");
});

test("a published workshop is not overwritten by a late reading", async () => {
  const { rows, supabase } = world("published");
  await read(supabase, answer);
  assert.equal(rows.workshops.title, undefined);
});

test("a provider failure is recorded", async () => {
  const { rows, supabase } = world();
  const out = await read(supabase, async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "no" } }) }));
  assert.equal(out.state, "failed");
  assert.equal(rows.workshop_extractions.status, "failed");
});
