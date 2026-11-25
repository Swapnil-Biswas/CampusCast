import { extractWithGroq } from "./groq.js";
import { ExtractionError } from "./provider.js";

// OpenRouter as another AI provider, using its free models. It speaks the same chat format as Groq, so the
// same code does the work: the PDF's text layer is sent as text (typed PDFs only; a scanned PDF is passed on to a
// provider that can read images). The answer is checked by normalize.js like any other.
//
// Free models are often busy, so when one cannot answer, the next is tried. They are hosted by different companies.

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_DEFAULT_MODEL = "google/gemma-4-31b-it:free";
export const OPENROUTER_FALLBACK_MODELS = ["particle-ai/particle-1:free", "nvidia/nemotron-3.5-super-vl:free", "inclusionai/ling-3.2-flash:free"];

// Trouble with this one model, so another may well succeed. Anything else (bad key, scanned or oversized PDF) stops.
const TRY_NEXT = new Set(["busy", "network", "service", "no_output", "bad_model", "bad_request", "too_large"]);
const BUDGET_MS = 240_000;   // the whole request has 300 seconds on the server

export async function extractWithOpenRouter({ model = OPENROUTER_DEFAULT_MODEL, retries, timeoutMs = 90_000, clock = Date.now, ...args }) {
  const models = [...new Set([model, ...OPENROUTER_FALLBACK_MODELS])];
  const started = clock();
  let first = null;
  for (const m of models) {
    const left = BUDGET_MS - (clock() - started);
    if (first && left < 15_000) break;
    try {
      // No retry on the same model: moving to the next one is quicker.
      return await extractWithGroq({ ...args, model: m, retries: 0, timeoutMs: Math.min(timeoutMs, left), url: OPENROUTER_URL, keyName: "OPENROUTER_API_KEY" });
    } catch (e) {
      if (!(e instanceof ExtractionError) || !TRY_NEXT.has(e.code)) throw e;
      first ||= e;
    }
  }
  first.retryable = true;
  throw first;
}
