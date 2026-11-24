import { DEFAULT_MODEL } from "./provider.js";

// Server-side only (these are not NEXT_PUBLIC_ variables, so they never reach the browser).
export function aiConfig() {
  return {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.EXAM_AI_MODEL || DEFAULT_MODEL,
  };
}
