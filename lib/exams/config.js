import { DEFAULT_MODEL } from "./provider.js";
import { GEMINI_DEFAULT_MODEL } from "./gemini.js";

// Server-side only (these are not NEXT_PUBLIC_ variables, so they never reach the browser).
// Provider: EXAM_AI_PROVIDER=gemini|anthropic wins. Otherwise Anthropic is used when its key is set,
// and Gemini (which has a free tier) when only GEMINI_API_KEY is set.
export function pickProvider(env) {
  const want = String(env.EXAM_AI_PROVIDER || "").toLowerCase();
  if (want === "gemini" || want === "anthropic") return want;
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  if (env.GEMINI_API_KEY) return "gemini";
  return "anthropic";
}

export function aiConfig(env = process.env) {
  const provider = pickProvider(env);
  const keyName = provider === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY";
  return {
    provider,
    keyName,
    apiKey: env[keyName] || "",
    model: env.EXAM_AI_MODEL || (provider === "gemini" ? GEMINI_DEFAULT_MODEL : DEFAULT_MODEL),
  };
}
