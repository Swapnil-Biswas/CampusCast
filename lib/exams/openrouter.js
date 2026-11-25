import { extractWithGroq } from "./groq.js";

// OpenRouter as another AI provider, using one of its free models. It speaks the same chat format as Groq, so the
// same code does the work: the PDF's text layer is sent as text (typed PDFs only; a scanned PDF is passed on to a
// provider that can read images). The answer is checked by normalize.js like any other.

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_DEFAULT_MODEL = "google/gemma-4-31b-it:free";

export function extractWithOpenRouter({ model = OPENROUTER_DEFAULT_MODEL, ...args }) {
  return extractWithGroq({ ...args, model, url: OPENROUTER_URL, keyName: "OPENROUTER_API_KEY" });
}
