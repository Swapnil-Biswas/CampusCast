import test from "node:test";
import assert from "node:assert/strict";
import { OPENROUTER_DEFAULT_MODEL, OPENROUTER_FALLBACK_MODELS, OPENROUTER_URL, extractWithOpenRouter } from "../../lib/exams/openrouter.js";
import { providerChain } from "../../lib/exams/config.js";

const readPages = async () => ["x".repeat(400)];
const reply = (status, body) => async () => ({ ok: status < 300, status, json: async () => body });

test("OpenRouter is picked up from its key, before Groq", () => {
  const chain = providerChain({ GROQ_API_KEY: "g", OPENROUTER_API_KEY: "o" });
  assert.deepEqual(chain.map((p) => p.provider), ["openrouter", "groq"]);
  assert.equal(chain[0].model, OPENROUTER_DEFAULT_MODEL);
});

test("sends the text to OpenRouter with the key in a header and returns the answer", async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return reply(200, { choices: [{ message: { content: "```json\n{\"a\":1}\n```" }, finish_reason: "stop" }] })(); };
  const r = await extractWithOpenRouter({ pdf: Buffer.from("x"), filename: "a.pdf", apiKey: "test-key", readPages, fetchImpl });
  assert.equal(seen.url, OPENROUTER_URL);
  assert.equal(seen.init.headers.authorization, "Bearer test-key");
  assert.equal(JSON.parse(seen.init.body).model, OPENROUTER_DEFAULT_MODEL);
  assert.deepEqual(r.input, { a: 1 });
});

test("a rejected key names OPENROUTER_API_KEY", async () => {
  await assert.rejects(extractWithOpenRouter({ pdf: Buffer.from("x"), filename: "a.pdf", apiKey: "bad", readPages, fetchImpl: reply(401, {}) }), /OPENROUTER_API_KEY/);
});

const good = { choices: [{ message: { content: "{\"a\":1}" }, finish_reason: "stop" }] };
const base = { pdf: Buffer.from("x"), filename: "a.pdf", apiKey: "test-key", readPages };

test("a busy model is skipped and the next free model answers", async () => {
  const asked = [];
  const fetchImpl = async (url, init) => { const m = JSON.parse(init.body).model; asked.push(m); return m === OPENROUTER_DEFAULT_MODEL ? reply(429, {})() : reply(200, good)(); };
  const r = await extractWithOpenRouter({ ...base, fetchImpl });
  assert.deepEqual(asked, [OPENROUTER_DEFAULT_MODEL, OPENROUTER_FALLBACK_MODELS[0]]);
  assert.deepEqual(r.input, { a: 1 });
});

test("when every free model is busy, each is tried once and the error can be retried", async () => {
  let calls = 0;
  await assert.rejects(extractWithOpenRouter({ ...base, fetchImpl: async () => { calls++; return reply(429, {})(); } }), { code: "busy", retryable: true });
  assert.equal(calls, 1 + OPENROUTER_FALLBACK_MODELS.length);
});

test("a rejected key does not try other models", async () => {
  let calls = 0;
  await assert.rejects(extractWithOpenRouter({ ...base, fetchImpl: async () => { calls++; return reply(401, {})(); } }), { code: "auth" });
  assert.equal(calls, 1);
});
