import test from "node:test";
import assert from "node:assert/strict";
import { runExtraction } from "../../lib/exams/process.js";
import { EXTRACTION_TOOL } from "../../lib/exams/tool-schema.js";
import { STALE_PROCESSING_MS } from "../../lib/exams/constants.js";
import { DEPTS, goodRaw, pdfBytes } from "./fixtures.mjs";

const KEY = "sk-ant-test-0123456789";
const AIML = "AI & Machine Learning";

// A tiny in-memory stand-in for the Supabase client: just the calls runExtraction makes.
function world(over = {}) {
  const w = {
    extraction: { id: "x1", document_id: "d1", status: "queued", started_at: null, error: null, field_meta: {} },
    doc: { id: "d1", notice_id: "n1", storage_path: "u1/f.pdf", original_filename: "notice.pdf", page_count: null },
    notice: { id: "n1", title: "notice", status: "draft", audience_depts: [AIML], degree_programme: "Bachelor's", details: {} },
    entries: [], noticeUpdates: [], docUpdates: [], extractionUpdates: [],
    pdf: pdfBytes(), failNoticeUpdate: false, throwOnDownload: false,
    ...over,
  };
  const handler = async (op) => {
    const eq = (k) => op.filters?.find((f) => f[0] === "eq" && f[1] === k)?.[2];
    switch (op.table) {
      case "exam_extractions": {
        if (op.kind === "update" && op.filters.some((f) => f[0] === "or")) {   // the claim
          const cutoff = /started_at\.lt\.([^)]+)/.exec(op.filters.find((f) => f[0] === "or")[1])[1];
          const free = w.extraction.status === "queued" || (w.extraction.status === "processing" && w.extraction.started_at < cutoff);
          if (!free) return { data: null, error: null };
          Object.assign(w.extraction, op.payload);
          return { data: { id: w.extraction.id, document_id: w.extraction.document_id }, error: null };
        }
        w.extractionUpdates.push(op.payload);
        Object.assign(w.extraction, op.payload);
        return { error: null };
      }
      case "exam_documents":
        if (op.kind === "update") { w.docUpdates.push(op.payload); Object.assign(w.doc, op.payload); return { error: null }; }
        return { data: w.doc, error: null };
      case "exam_notices":
        if (op.kind === "update") {
          if (w.failNoticeUpdate) return { error: { message: "new row violates row-level security policy" } };
          w.noticeUpdates.push(op.payload); Object.assign(w.notice, op.payload); return { error: null };
        }
        return { data: w.notice, error: null };
      case "departments": return { data: DEPTS, error: null };
      case "exam_timetable_entries":
        if (op.kind === "insert") { w.entries.push(...op.payload); return { error: null }; }
        return { count: w.entries.length, error: null };
      case "storage":
        if (w.throwOnDownload) throw new Error("socket exploded: secret-internal-detail");
        return { data: { arrayBuffer: async () => w.pdf.buffer.slice(w.pdf.byteOffset, w.pdf.byteOffset + w.pdf.byteLength) }, error: null };
      default: throw new Error(`unexpected table ${op.table}`);
    }
  };
  const from = (table) => {
    const op = { table, kind: null, payload: null, filters: [] };
    const run = async () => handler(op);
    const b = {
      select(cols, opts) { if (!op.kind) op.kind = "select"; return b; },
      update(p) { op.kind = "update"; op.payload = p; return b; },
      insert(p) { op.kind = "insert"; op.payload = p; return b; },
      eq(k, v) { op.filters.push(["eq", k, v]); return b; },
      or(s) { op.filters.push(["or", s]); return b; },
      order() { return b; },
      single: run, maybeSingle: run,
      then: (res, rej) => run().then(res, rej),
    };
    return b;
  };
  return { w, supabase: { from, storage: { from: (bucket) => ({ download: (path) => handler({ table: "storage", bucket, path }) }) } } };
}

const okResponse = (input) => ({ ok: true, status: 200, json: async () => ({ model: "claude-sonnet-5-5", stop_reason: "tool_use", content: [{ type: "tool_use", name: EXTRACTION_TOOL.name, input }] }) });
const errResponse = (status, message = "x") => ({ ok: false, status, json: async () => ({ error: { message } }) });
const fetcher = (...rs) => { const calls = []; return { calls, fetchImpl: async (u, i) => { calls.push(i); return rs[Math.min(calls.length - 1, rs.length - 1)]; } }; };
const noSleep = async () => {};
const run = (supabase, fetchImpl, over = {}) => runExtraction({ supabase, extractionId: "x1", apiKey: KEY, model: "claude-sonnet-5-5", fetchImpl, sleep: noSleep, ...over });

test("a PDF is read, saved, and the draft notice and timetable are filled in", async () => {
  const { w, supabase } = world();
  const { fetchImpl, calls } = fetcher(okResponse(goodRaw()));
  const out = await run(supabase, fetchImpl);
  assert.deepEqual(out, { state: "completed" });
  assert.equal(calls.length, 1);
  assert.equal(w.extraction.status, "completed");
  assert.equal(w.extraction.requires_review, true);
  assert.equal(w.extraction.model, "anthropic:claude-sonnet-5-5");
  assert.equal(w.extraction.result.categoryCode, "ia2");
  assert.equal(w.extraction.result.originalExaminationName, "CIE 2");
  assert.ok(w.extraction.field_meta.category);
  assert.equal(w.extraction.error, null);
  assert.equal(w.doc.page_count, 2);                                   // page count filled in from the file
  assert.equal(w.notice.category, "ia2");                              // draft was filled
  assert.equal(w.notice.title, "Time Table for CIE 2 Examinations");
  assert.equal(w.entries.length, 2);
  assert.deepEqual(w.notice.audience_depts, [AIML]);                   // who it is for is untouched
});

test("it can only ever fill a draft: no run touches status, publishing or approval", async () => {
  const { w, supabase } = world();
  await run(supabase, fetcher(okResponse(goodRaw())).fetchImpl);
  for (const patch of w.noticeUpdates) for (const k of ["status", "published_at", "published_by", "reviewed_by", "submitted_at"]) assert.equal(k in patch, false, k);
  assert.equal(w.notice.status, "draft");
});

test("a second runner cannot start an extraction that is already being read", async () => {
  const { w, supabase } = world({ extraction: { id: "x1", document_id: "d1", status: "processing", started_at: new Date().toISOString() } });
  const { fetchImpl, calls } = fetcher(okResponse(goodRaw()));
  assert.deepEqual(await run(supabase, fetchImpl), { state: "skipped" });
  assert.equal(calls.length, 0);
  assert.equal(w.extraction.status, "processing");
});

test("an already finished extraction is not run again", async () => {
  const { supabase } = world({ extraction: { id: "x1", document_id: "d1", status: "completed", started_at: null } });
  const { calls, fetchImpl } = fetcher(okResponse(goodRaw()));
  assert.deepEqual(await run(supabase, fetchImpl), { state: "skipped" });
  assert.equal(calls.length, 0);
});

test("an extraction stuck in 'processing' for too long can be taken over", async () => {
  const old = new Date(Date.now() - STALE_PROCESSING_MS - 60_000).toISOString();
  const { w, supabase } = world({ extraction: { id: "x1", document_id: "d1", status: "processing", started_at: old } });
  assert.deepEqual(await run(supabase, fetcher(okResponse(goodRaw())).fetchImpl), { state: "completed" });
  assert.equal(w.extraction.status, "completed");
});

test("a stored file that is not a PDF or photo fails before the AI is ever called", async () => {
  const { w, supabase } = world({ pdf: Buffer.from("MZ this is an executable, not a pdf") });
  const { calls, fetchImpl } = fetcher(okResponse(goodRaw()));
  const out = await run(supabase, fetchImpl);
  assert.equal(out.state, "failed");
  assert.equal(out.code, "unsupported");
  assert.equal(out.retryable, false);
  assert.equal(calls.length, 0);
  assert.equal(w.extraction.status, "failed");
  assert.equal(w.extraction.field_meta._failure.retryable, false);
  assert.equal(w.entries.length, 0);
});

test("a password-protected PDF fails with a clear message, without calling the AI", async () => {
  const { w, supabase } = world({ pdf: pdfBytes("<< /Encrypt 9 0 R >>\n") });
  const { calls, fetchImpl } = fetcher(okResponse(goodRaw()));
  const out = await run(supabase, fetchImpl);
  assert.equal(out.code, "encrypted");
  assert.match(w.extraction.error, /password/i);
  assert.equal(calls.length, 0);
});

test("a rejected API key is recorded as a failure that never leaks the key", async () => {
  const { w, supabase } = world();
  const out = await run(supabase, fetcher(errResponse(401, `bad key ${KEY}`)).fetchImpl);
  assert.equal(out.code, "auth");
  assert.equal(w.extraction.status, "failed");
  assert.ok(!JSON.stringify(w).includes(KEY), "the key must not appear anywhere that gets stored");
});

test("a busy AI service leaves a failure that can be retried", async () => {
  const { w, supabase } = world();
  const out = await run(supabase, fetcher(errResponse(529)).fetchImpl);
  assert.equal(out.code, "busy");
  assert.equal(out.retryable, true);
  assert.equal(w.extraction.field_meta._failure.retryable, true);
});

test("an answer in the wrong shape is a failure, and nothing is written to the notice", async () => {
  const { w, supabase } = world();
  const out = await run(supabase, fetcher(okResponse({ notice: "not an object" })).fetchImpl);
  assert.equal(out.code, "invalid_output");
  assert.equal(w.noticeUpdates.length, 0);
  assert.equal(w.entries.length, 0);
});

test("when filling the draft fails, the extraction is still saved and the problem is recorded", async () => {
  const { w, supabase } = world({ failNoticeUpdate: true });
  const out = await run(supabase, fetcher(okResponse(goodRaw())).fetchImpl);
  assert.equal(out.state, "completed");
  assert.equal(w.extraction.status, "completed");
  assert.match(w.extraction.field_meta._applyError, /row-level security/);
  assert.ok(w.extraction.result, "the result is kept so the admin can still use it");
});

test("a notice that was already filled in is not overwritten by another extraction", async () => {
  const { w, supabase } = world({ notice: { id: "n1", title: "My own corrected title", status: "draft", audience_depts: [AIML], degree_programme: "Bachelor's", details: { extraction: { autofilled: true } } } });
  const out = await run(supabase, fetcher(okResponse(goodRaw())).fetchImpl);
  assert.equal(out.state, "completed");
  assert.equal(w.noticeUpdates.length, 0);
  assert.equal(w.notice.title, "My own corrected title");
});

test("an unexpected error is reported in plain words and its details are not stored", async () => {
  const { w, supabase } = world({ throwOnDownload: true });
  const out = await run(supabase, fetcher(okResponse(goodRaw())).fetchImpl);
  assert.equal(out.code, "internal");
  assert.equal(w.extraction.status, "failed");
  assert.doesNotMatch(w.extraction.error, /secret-internal-detail|socket/);
});

test("a scanned or mixed document is recorded as needing OCR-style reading", async () => {
  const { w, supabase } = world();
  await run(supabase, fetcher(okResponse({ ...goodRaw(), documentKind: "scanned" })).fetchImpl);
  assert.equal(w.extraction.ocr_used, true);
  assert.equal(w.extraction.result.sourceDocument.kind, "scanned");
});

test("a photo of a notice is read and saved like a scan, and the AI is told it is an image", async () => {
  const photo = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(300, 7), Buffer.from([0xff, 0xd9])]);
  const { w, supabase } = world({ pdf: photo });
  const sent = [];
  const fetchImpl = async (u, i) => { sent.push(JSON.parse(i.body)); return okResponse({ ...goodRaw(), documentKind: "digital" }); };
  const out = await run(supabase, fetchImpl);
  assert.deepEqual(out, { state: "completed" });
  assert.equal(sent[0].messages[0].content[0].type, "image");
  assert.equal(sent[0].messages[0].content[0].source.media_type, "image/jpeg");
  assert.equal(w.extraction.ocr_used, true);
  assert.equal(w.extraction.result.sourceDocument.kind, "scanned");
  assert.equal(w.doc.page_count, 1);
  assert.equal(w.notice.status, "draft");
});
