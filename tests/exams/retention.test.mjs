import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RETENTION_DAYS, purgeExpiredPdfs, retentionDays } from "../../lib/exams/retention.js";

function fake({ due = [], removeResult, rpcError = {}, markError = null } = {}) {
  const calls = { rpc: [], removed: [] };
  const supabase = {
    rpc: async (name, args) => {
      calls.rpc.push([name, args]);
      if (name === "exam_expired_pdfs") return rpcError.list ? { error: rpcError.list } : { data: due };
      return markError ? { error: markError } : { data: args.p_ids.length };
    },
    storage: { from: (bucket) => ({ remove: async (paths) => { calls.removed.push([bucket, paths]); return removeResult ? removeResult(paths) : { data: paths.map((name) => ({ name })), error: null }; } }) },
  };
  return { supabase, calls };
}
const D = [{ document_id: "d1", notice_id: "n1", storage_path: "u/a.pdf" }, { document_id: "d2", notice_id: "n2", storage_path: "u/b.pdf" }];

test("the retention period defaults to 20 days and can be set, within sensible limits", () => {
  assert.equal(DEFAULT_RETENTION_DAYS, 20);
  assert.equal(retentionDays({}), 20);
  assert.equal(retentionDays({ EXAM_PDF_RETENTION_DAYS: "15" }), 15);
  assert.equal(retentionDays({ EXAM_PDF_RETENTION_DAYS: "0" }), 20);
  assert.equal(retentionDays({ EXAM_PDF_RETENTION_DAYS: "9999" }), 20);
  assert.equal(retentionDays({ EXAM_PDF_RETENTION_DAYS: "abc" }), 20);
});

test("expired files are removed from storage, then marked as removed", async () => {
  const { supabase, calls } = fake({ due: D });
  assert.deepEqual(await purgeExpiredPdfs(supabase, 20), { removed: 2, failed: 0 });
  assert.deepEqual(calls.removed, [["exam-pdfs", ["u/a.pdf", "u/b.pdf"]]]);
  assert.deepEqual(calls.rpc[1], ["exam_mark_pdfs_deleted", { p_ids: ["d1", "d2"], p_days: 20 }]);
});

test("nothing is touched when nothing has expired", async () => {
  const { supabase, calls } = fake({ due: [] });
  assert.deepEqual(await purgeExpiredPdfs(supabase), { removed: 0, failed: 0 });
  assert.equal(calls.removed.length, 0);
});

test("only files storage confirms as deleted are marked, so failures are retried later", async () => {
  const { supabase, calls } = fake({ due: D, removeResult: () => ({ data: [{ name: "u/a.pdf" }], error: null }) });
  assert.deepEqual(await purgeExpiredPdfs(supabase), { removed: 1, failed: 1 });
  assert.deepEqual(calls.rpc[1][1].p_ids, ["d1"]);
});

test("if storage fails outright nothing is marked removed", async () => {
  const { supabase, calls } = fake({ due: D, removeResult: () => ({ data: null, error: { message: "boom" } }) });
  assert.deepEqual(await purgeExpiredPdfs(supabase), { removed: 0, failed: 2 });
  assert.equal(calls.rpc.length, 1);
});

test("housekeeping never throws, even when the database is not updated yet", async () => {
  assert.deepEqual(await purgeExpiredPdfs(fake({ rpcError: { list: { message: "function does not exist" } } }).supabase), { removed: 0, failed: 0 });
  assert.deepEqual(await purgeExpiredPdfs({ rpc: async () => { throw new Error("network"); } }), { removed: 0, failed: 0 });
  assert.deepEqual(await purgeExpiredPdfs(fake({ due: D, markError: { message: "x" } }).supabase), { removed: 0, failed: 2 });
});
