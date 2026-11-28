import test from "node:test";
import assert from "node:assert/strict";
import { runHackathonExtraction } from "../../lib/hackathons/process.js";
import { planHackathonApply } from "../../lib/hackathons/plan.js";
import { normalizeHackathon } from "../../lib/hackathons/normalize.js";
import { HACKATHON_TASK, HACKATHON_TOOL } from "../../lib/hackathons/task.js";
import { buildRequest } from "../../lib/exams/provider.js";
import { buildGeminiRequest } from "../../lib/exams/gemini.js";
import { buildGroqRequest } from "../../lib/exams/groq.js";
import { extractWithFallback } from "../../lib/exams/chain.js";
import { STALE_PROCESSING_MS } from "../../lib/exams/constants.js";
import { CLUBS, NOW, goodRaw } from "./fixtures.mjs";

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7), Buffer.from([0xff, 0xd9])]);
const clubRows = CLUBS.map((c, i) => ({ id: `club-${i}`, name: c.name }));
const PROVIDERS = [{ provider: "anthropic", apiKey: "k-test", model: "claude-test" }];

// A tiny in-memory stand-in for the Supabase client: just the calls runHackathonExtraction makes.
function world(over = {}) {
  const w = {
    extraction: { id: "x1", document_id: "d1", status: "queued", started_at: null, error: null, field_meta: {} },
    doc: { id: "d1", hackathon_id: "h1", storage_path: "u1/f.jpg", original_filename: "poster.jpg", page_count: null },
    hackathon: { id: "h1", title: "poster", status: "draft", club_id: "club-0", team_min: 1, team_max: 4, starts_at: null, deadline: null, details: {} },
    patches: [], docUpdates: [], bytes: jpeg, failPatch: false, throwOnDownload: false,
    ...over,
  };
  const handler = async (op) => {
    switch (op.table) {
      case "hackathon_extractions":
        if (op.kind === "update" && op.filters.some((f) => f[0] === "or")) {
          const cutoff = /started_at\.lt\.([^)]+)/.exec(op.filters.find((f) => f[0] === "or")[1])[1];
          const free = w.extraction.status === "queued" || (w.extraction.status === "processing" && w.extraction.started_at < cutoff);
          if (!free) return { data: null, error: null };
          Object.assign(w.extraction, op.payload);
          return { data: { id: "x1", document_id: "d1" }, error: null };
        }
        Object.assign(w.extraction, op.payload);
        return { error: null };
      case "hackathon_documents":
        if (op.kind === "update") { w.docUpdates.push(op.payload); Object.assign(w.doc, op.payload); return { error: null }; }
        return { data: w.doc, error: null };
      case "hackathons":
        if (op.kind === "update") {
          if (w.failPatch) return { error: { message: "new row violates check constraint" } };
          w.patches.push(op.payload); Object.assign(w.hackathon, op.payload); return { error: null };
        }
        return { data: w.hackathon, error: null };
      case "clubs": return { data: clubRows, error: null };
      case "storage":
        if (w.throwOnDownload) throw new Error("socket exploded: secret-internal-detail");
        return { data: { arrayBuffer: async () => w.bytes.buffer.slice(w.bytes.byteOffset, w.bytes.byteOffset + w.bytes.byteLength) }, error: null };
      default: throw new Error(`unexpected table ${op.table}`);
    }
  };
  const from = (table) => {
    const op = { table, kind: null, payload: null, filters: [] };
    const run = async () => handler(op);
    const b = {
      select() { if (!op.kind) op.kind = "select"; return b; },
      update(p) { op.kind = "update"; op.payload = p; return b; },
      eq(k, v) { op.filters.push(["eq", k, v]); return b; },
      or(s) { op.filters.push(["or", s]); return b; },
      order() { return b; },
      single: run, maybeSingle: run, then: (res, rej) => run().then(res, rej),
    };
    return b;
  };
  return { w, supabase: { from, storage: { from: (bucket) => ({ download: (path) => handler({ table: "storage", bucket, path }) }) } } };
}

const okResponse = (input) => ({ ok: true, status: 200, json: async () => ({ model: "claude-test", stop_reason: "tool_use", content: [{ type: "tool_use", name: HACKATHON_TOOL.name, input }] }) });
const errResponse = (status) => ({ ok: false, status, json: async () => ({ error: { message: "x" } }) });
const fetcher = (...rs) => { const calls = []; return { calls, fetchImpl: async (u, i) => { calls.push(JSON.parse(i.body)); return rs[Math.min(calls.length - 1, rs.length - 1)]; } }; };
const noSleep = async () => {};
const run = (supabase, fetchImpl, over = {}) => runHackathonExtraction({ supabase, extractionId: "x1", providers: PROVIDERS, fetchImpl, sleep: noSleep, now: NOW, ...over });

test("a poster photo is read, saved, and the draft hackathon is filled in", async () => {
  const { w, supabase } = world();
  const { fetchImpl, calls } = fetcher(okResponse(goodRaw()));
  const out = await run(supabase, fetchImpl);
  assert.deepEqual(out, { state: "completed" });
  assert.equal(w.extraction.status, "completed");
  assert.equal(w.extraction.requires_review, true);
  assert.equal(w.extraction.ocr_used, true);
  assert.equal(w.extraction.model, "anthropic:claude-test");
  assert.equal(w.doc.page_count, 1);
  // the photo went to the AI as an image, with the hackathon task and the club list
  assert.equal(calls[0].tools[0].name, "record_hackathon");
  assert.equal(calls[0].messages[0].content[0].type, "image");
  assert.match(calls[0].messages[0].content[1].text, /Extract the hackathon information/);
  assert.match(calls[0].messages[0].content[1].text, /Configured clubs/);
  assert.match(calls[0].messages[0].content[1].text, /- Coding Club\n/);
  // the draft was filled
  const h = w.hackathon;
  assert.equal(h.title, "BuildSprint 2026");
  assert.equal(h.status, "draft");
  assert.equal(h.location, "Seminar Hall 2, Block A, BMSIT&M");
  assert.equal(h.prize_amount, 100000);
  assert.equal(h.contact_phone, "+91 98450 12345");
  assert.equal(h.website_url, "https://www.buildsprint.example.com/");
  assert.equal(h.link, "https://buildsprint.example.com/register");
  assert.equal(h.schedule.length, 4);
  assert.deepEqual(h.details.perks, ["Certificates for all", "Internship opportunities"]);
  assert.equal(h.details.extraction.autofilled, true);
});

test("it can only ever fill a draft: no run touches status, publishing, creator or the chosen club", async () => {
  const { w, supabase } = world();
  await run(supabase, fetcher(okResponse(goodRaw())).fetchImpl);
  for (const patch of w.patches) for (const k of ["status", "published_at", "created_by", "club_id"]) assert.equal(k in patch, false, k);
  assert.equal(w.hackathon.status, "draft");
  assert.equal(w.hackathon.club_id, "club-0");
});

test("a second runner cannot start a reading that is already under way; a stale one can be taken over", async () => {
  const busy = world({ extraction: { id: "x1", document_id: "d1", status: "processing", started_at: NOW.toISOString() } });
  const f = fetcher(okResponse(goodRaw()));
  assert.deepEqual(await run(busy.supabase, f.fetchImpl), { state: "skipped" });
  assert.equal(f.calls.length, 0);
  const old = new Date(NOW.getTime() - STALE_PROCESSING_MS - 60_000).toISOString();
  const stale = world({ extraction: { id: "x1", document_id: "d1", status: "processing", started_at: old } });
  assert.deepEqual(await run(stale.supabase, fetcher(okResponse(goodRaw())).fetchImpl), { state: "completed" });
});

test("a stored file that is not a PDF or photo fails before the AI is ever called", async () => {
  const { w, supabase } = world({ bytes: Buffer.from("MZ this is a program") });
  const { fetchImpl, calls } = fetcher(okResponse(goodRaw()));
  const out = await run(supabase, fetchImpl);
  assert.equal(out.state, "failed");
  assert.equal(out.code, "unsupported");
  assert.equal(out.retryable, false);
  assert.equal(calls.length, 0);
  assert.equal(w.extraction.status, "failed");
  assert.equal(w.patches.length, 0);
});

test("a rejected key never leaks into what is stored, and a busy AI service leaves a retryable failure", async () => {
  const a = world();
  const out = await run(a.supabase, fetcher(errResponse(401)).fetchImpl);
  assert.equal(out.code, "auth");
  assert.ok(!JSON.stringify(a.w).includes("k-test"));
  const b = world();
  const busy = await run(b.supabase, fetcher(errResponse(529)).fetchImpl);
  assert.equal(busy.retryable, true);
  assert.equal(b.w.extraction.field_meta._failure.retryable, true);
});

test("an answer in the wrong shape is a failure and nothing is written to the draft", async () => {
  const { w, supabase } = world();
  const out = await run(supabase, fetcher(okResponse({ hackathon: "not an object" })).fetchImpl);
  assert.equal(out.code, "invalid_output");
  assert.equal(w.patches.length, 0);
});

test("when filling the draft fails, the reading is still saved and the problem is recorded", async () => {
  const { w, supabase } = world({ failPatch: true });
  const out = await run(supabase, fetcher(okResponse(goodRaw())).fetchImpl);
  assert.equal(out.state, "completed");
  assert.equal(w.extraction.status, "completed");
  assert.match(w.extraction.field_meta._applyError, /check constraint/);
  assert.ok(w.extraction.result);
});

test("an unexpected error is reported in plain words and its details are not stored", async () => {
  const { w, supabase } = world({ throwOnDownload: true });
  const out = await run(supabase, fetcher(okResponse(goodRaw())).fetchImpl);
  assert.equal(out.code, "internal");
  assert.doesNotMatch(w.extraction.error, /secret-internal-detail|socket/);
});

test("with no AI key configured it fails clearly and retryably", async () => {
  const { supabase } = world();
  const out = await run(supabase, fetcher(okResponse(goodRaw())).fetchImpl, { providers: [] });
  assert.equal(out.code, "not_configured");
  assert.equal(out.retryable, true);
});

test("a poster already filled in once is not overwritten by another reading", async () => {
  const { w, supabase } = world({ hackathon: { id: "h1", title: "My corrected title", status: "draft", club_id: "club-0", team_min: 1, team_max: 4, details: { extraction: { autofilled: true } } } });
  const out = await run(supabase, fetcher(okResponse(goodRaw())).fetchImpl);
  assert.equal(out.state, "completed");
  assert.equal(w.patches.length, 0);
  assert.equal(w.hackathon.title, "My corrected title");
});

test("the club is filled in from the poster only when none was chosen, and only if it is a real club", async () => {
  const a = world({ hackathon: { id: "h1", title: "x", status: "draft", club_id: null, team_min: 1, team_max: 4, details: {} } });
  await run(a.supabase, fetcher(okResponse(goodRaw())).fetchImpl);
  assert.equal(a.w.hackathon.club_id, "club-0");
  const b = world({ hackathon: { id: "h1", title: "x", status: "draft", club_id: null, team_min: 1, team_max: 4, details: {} } });
  await run(b.supabase, fetcher(okResponse(goodRaw({ clubName: { value: "Chess Club", source: "explicit", confidence: 0.9, pages: [1], evidence: "x" }, organizer: { value: "Chess Club of BMSIT", source: "explicit", confidence: 0.9, pages: [1], evidence: "x" } }))).fetchImpl);
  assert.equal(b.w.hackathon.club_id, null);
});

test("plan: the database's own rules stay true when only some values are known", () => {
  const norm = normalizeHackathon(goodRaw({ teamMin: { value: 6, source: "explicit", confidence: 0.9, pages: [1], evidence: "" }, teamMax: { value: null, source: "missing", confidence: 0, pages: [], evidence: "" }, endsAt: { value: "2026-12-11 09:00", source: "explicit", confidence: 0.9, pages: [1], evidence: "" } }), { clubs: CLUBS, now: NOW });
  const { patch } = planHackathonApply({ id: "h", club_id: "c", team_min: 1, team_max: 4, details: {} }, norm, { extractionId: "x", clubs: clubRows, now: NOW });
  assert.ok(patch.team_max >= patch.team_min, "team max is raised to the new minimum");
  assert.equal("ends_at" in patch, false, "an end before the start is not written");
});

test("the hackathon task is a different job on the same shared AI code, and the exam task is unchanged", () => {
  const c = buildRequest({ pdfBase64: "AA==", mime: "image/png", filename: "p.png", departments: [{ name: "Coding Club" }], task: HACKATHON_TASK });
  assert.equal(c.tools[0].name, "record_hackathon");
  assert.match(c.system, /hackathon posters/);
  assert.match(c.system, /untrusted data/);
  const g = buildGeminiRequest({ pdfBase64: "AA==", mime: "image/png", filename: "p.png", departments: [{ name: "Coding Club" }], task: HACKATHON_TASK });
  assert.match(g.systemInstruction.parts[0].text, /record_hackathon/);
  assert.match(g.systemInstruction.parts[0].text, /prizePoolAmount/);
  const q = buildGroqRequest({ pages: ["text"], filename: "p.pdf", departments: [{ name: "Coding Club" }], task: HACKATHON_TASK });
  assert.match(q.messages[1].content, /Extract the hackathon information from the text/);
  const exam = buildRequest({ pdfBase64: "AA==", filename: "n.pdf", departments: [{ name: "AI & Machine Learning" }] });
  assert.equal(exam.tools[0].name, "record_examination_notice");
  assert.match(exam.messages[0].content[1].text, /Configured departments/);
});

test("the fallback chain carries the hackathon task to every provider", async () => {
  const seen = [];
  const mk = (tag, fail) => async (a) => { seen.push([tag, a.task?.tool.name]); if (fail) { const { ExtractionError } = await import("../../lib/exams/provider.js"); throw new ExtractionError("busy", "busy", true); } return { input: {}, model: tag }; };
  const r = await extractWithFallback({ providers: [{ provider: "gemini", apiKey: "a" }, { provider: "groq", apiKey: "b" }], pdf: jpeg, mime: "image/jpeg", task: HACKATHON_TASK, filename: "p.jpg", departments: [], extractors: { gemini: mk("gemini", true), groq: mk("groq", false) } });
  assert.equal(r.provider, "groq");
  assert.deepEqual(seen, [["gemini", "record_hackathon"], ["groq", "record_hackathon"]]);
});

import sharp from "sharp";
import QRCode from "qrcode";
import { MISSING } from "../exams/fixtures.mjs";

test("a QR code on a poster photo is decoded, so students get a direct link instead of a code to scan", async () => {
  const qr = await QRCode.toBuffer("https://forms.example.com/buildsprint", { type: "png", margin: 2, width: 240 });
  const posterBytes = await sharp({ create: { width: 1000, height: 1400, channels: 3, background: "#301a60" } }).composite([{ input: qr, left: 700, top: 1000 }]).jpeg({ quality: 80 }).toBuffer();
  const { w, supabase } = world({ bytes: posterBytes });
  const raw = goodRaw({ websiteUrl: MISSING(), registrationUrl: MISSING(), qrCodeLabel: { value: "Scan to register", source: "explicit", confidence: 0.9, pages: [1], evidence: "Scan to register" } });
  const out = await run(supabase, fetcher(okResponse(raw)).fetchImpl);
  assert.deepEqual(out, { state: "completed" });
  assert.equal(w.hackathon.link, "https://forms.example.com/buildsprint");
  assert.equal(w.hackathon.website_url, undefined);
  assert.deepEqual(w.hackathon.details.extraction.qrLinks, ["https://forms.example.com/buildsprint"]);
  assert.ok(w.hackathon.details.extraction.warnings.some((x) => x.code === "qr_link_used"));
  assert.equal(w.extraction.result.registrationUrl, "https://forms.example.com/buildsprint");
});

test("a poster photo with no QR code, and a PDF, just carry on without QR links", async () => {
  const a = world();
  await run(a.supabase, fetcher(okResponse(goodRaw())).fetchImpl);
  assert.deepEqual(a.w.hackathon.details.extraction.qrLinks, []);
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  const b = world({ bytes: pdf });
  const out = await run(b.supabase, fetcher(okResponse(goodRaw())).fetchImpl);
  assert.equal(out.state, "completed");
});

// ---- outside the campus: finding the venue on the map ----
import { guessVenuePin } from "../../lib/hackathons/process.js";

const cmritRaw = (over = {}) => goodRaw({ venue: { value: "CMR Institute of Technology", source: "explicit", confidence: 0.95, pages: [1], evidence: "at CMRIT" }, venueAddress: { value: "AECS Layout, Kundalahalli, Bengaluru", source: "explicit", confidence: 0.9, pages: [1], evidence: "" }, offCampus: { value: true, source: "inferred", confidence: 0.8, pages: [1], evidence: "at CMRIT" }, ...over });
const CMRIT_HIT = { name: "CMR Institute of Technology, AECS Layout", lat: 12.966654, lng: 77.711623, km: 24.2 };
const ROAD = { km: 36.9, minutes: 42, source: "road" };

test("a hackathon at CMRIT is placed on the map with its road distance from BMSIT", async () => {
  const { w, supabase } = world();
  const seen = [];
  const geo = { search: async (q) => { seen.push(q); return [CMRIT_HIT]; }, route: async () => ROAD, resolve: async () => null };
  const out = await run(supabase, fetcher(okResponse(cmritRaw())).fetchImpl, { geo });
  assert.deepEqual(out, { state: "completed" });
  assert.match(seen[0], /CMR Institute of Technology, AECS Layout, Kundalahalli, Bengaluru/);
  const h = w.hackathon;
  assert.deepEqual([h.off_campus, h.venue_lat, h.venue_lng, h.route_km, h.route_minutes, h.route_source], [true, 12.966654, 77.711623, 36.9, 42, "road"]);
  assert.equal(h.venue_address, "AECS Layout, Kundalahalli, Bengaluru");
  const warn = h.details.extraction.warnings.find((x) => x.code === "venue_pin_guess");
  assert.ok(warn && /36\.9|about 36\.9 km/.test(warn.message));
  assert.equal(w.extraction.field_meta.venuePin.needsReview, true);
});

test("a venue that cannot be found is flagged, not guessed, and the reading still completes", async () => {
  const none = world();
  const out = await run(none.supabase, fetcher(okResponse(cmritRaw())).fetchImpl, { geo: { search: async () => [], route: async () => ROAD, resolve: async () => null } });
  assert.equal(out.state, "completed");
  assert.equal(none.w.hackathon.off_campus, true);
  assert.equal("venue_lat" in none.w.hackathon, false);
  assert.ok(none.w.hackathon.details.extraction.warnings.some((x) => x.code === "venue_not_found"));
  const broken = world();
  const out2 = await run(broken.supabase, fetcher(okResponse(cmritRaw())).fetchImpl, { geo: { search: async () => { throw new Error("service down"); }, route: async () => ROAD, resolve: async () => null } });
  assert.equal(out2.state, "completed");
  assert.ok(broken.w.hackathon.details.extraction.warnings.some((x) => x.code === "venue_not_found"));
});

test("a match far from Bengaluru is a different place with the same name and is ignored", async () => {
  const far = { name: "CMR Institute, Hyderabad", lat: 17.5, lng: 78.5, km: 500 };
  const pin = await guessVenuePin({ venue: "CMR Institute of Technology", venueAddress: null, mapUrl: null }, { search: async () => [far, CMRIT_HIT], route: async () => ROAD });
  assert.deepEqual([pin.lat, pin.lng], [12.966654, 77.711623]);
  assert.equal(await guessVenuePin({ venue: "CMR Institute", venueAddress: null, mapUrl: null }, { search: async () => [far], route: async () => ROAD }), null);
});

test("a map link printed on the poster is used before any search", async () => {
  let searched = false;
  const pin = await guessVenuePin({ venue: "CMRIT", venueAddress: null, mapUrl: "https://www.google.com/maps/@12.9666,77.7116,17z" }, { search: async () => { searched = true; return []; }, route: async () => ROAD, resolve: async () => ({ lat: 12.9666, lng: 77.7116 }) });
  assert.deepEqual([pin.lat, pin.lng, searched], [12.9666, 77.7116, false]);
});

test("with the straight line only, the pin is kept with that source so the page can say so", async () => {
  const pin = await guessVenuePin({ venue: "CMRIT", venueAddress: null, mapUrl: null }, { search: async () => [CMRIT_HIT], route: async () => ({ km: 24.2, minutes: null, source: "straight" }) });
  assert.deepEqual([pin.km, pin.minutes, pin.source], [24.2, null, "straight"]);
});

test("a hackathon on campus never touches the map services", async () => {
  const { w, supabase } = world();
  let called = 0;
  const geo = { search: async () => { called++; return []; }, route: async () => { called++; return ROAD; }, resolve: async () => { called++; return null; } };
  const out = await run(supabase, fetcher(okResponse(goodRaw())).fetchImpl, { geo });
  assert.equal(out.state, "completed");
  assert.equal(called, 0);
  assert.equal(w.hackathon.off_campus, undefined);
  assert.equal("venue_lat" in w.hackathon, false);
});
