import { DEFAULT_MODEL } from "./provider.js";
import { GEMINI_DEFAULT_MODEL } from "./gemini.js";
import { GROQ_DEFAULT_MODEL } from "./groq.js";

// Server-side only (these are not NEXT_PUBLIC_ variables, so they never reach the browser).
//
// Providers are tried in this order, skipping any without a key:  Claude (paid) -> Gemini (free, reads PDFs and scans)
// -> Groq (free, typed PDFs only). EXAM_AI_PROVIDER=gemini|groq|anthropic uses just that one.
// EXAM_AI_MODEL pins the model of the first provider; GEMINI_MODEL / GROQ_MODEL pin those two specifically.
const KEYS = { anthropic: "ANTHROPIC_API_KEY", gemini: "GEMINI_API_KEY", groq: "GROQ_API_KEY" };
const MODELS = { anthropic: DEFAULT_MODEL, gemini: GEMINI_DEFAULT_MODEL, groq: GROQ_DEFAULT_MODEL };
const ORDER = ["anthropic", "gemini", "groq"];

export function providerChain(env) {
  const want = String(env.EXAM_AI_PROVIDER || "").toLowerCase();
  const names = ORDER.includes(want) ? [want] : ORDER;
  const chain = names.filter((p) => env[KEYS[p]]).map((provider) => ({
    provider, keyName: KEYS[provider], apiKey: env[KEYS[provider]],
    model: env[`${provider === "anthropic" ? "CLAUDE" : provider.toUpperCase()}_MODEL`] || MODELS[provider],
  }));
  if (chain.length && env.EXAM_AI_MODEL) chain[0].model = env.EXAM_AI_MODEL;
  return chain;
}

export function pickProvider(env) {
  const want = String(env.EXAM_AI_PROVIDER || "").toLowerCase();
  if (ORDER.includes(want)) return want;
  return providerChain(env)[0]?.provider || "anthropic";
}

export function aiConfig(env = process.env) {
  const providers = providerChain(env);
  const first = providers[0];
  if (first) return { providers, provider: first.provider, keyName: first.keyName, apiKey: first.apiKey, model: first.model };
  // Nothing configured: say which key to add (the free one).
  return { providers, provider: "gemini", keyName: "GEMINI_API_KEY", apiKey: "", model: MODELS.gemini };
}
