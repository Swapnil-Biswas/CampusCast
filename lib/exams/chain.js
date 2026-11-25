import { ExtractionError, extractWithClaude } from "./provider.js";
import { extractWithGemini } from "./gemini.js";
import { extractWithGroq } from "./groq.js";
import { extractWithOpenRouter } from "./openrouter.js";

// Tries the configured AI providers one after another until one gives a usable answer. A rate limit, an outage or a
// bad answer from one provider then no longer stops the upload. Every answer, from whichever provider, still goes
// through normalize.js and a person's review.

const EXTRACTORS = { anthropic: extractWithClaude, gemini: extractWithGemini, openrouter: extractWithOpenRouter, groq: extractWithGroq };

// These failures are about the file itself: another provider cannot fix them, so do not try one.
const STOP = new Set(["encrypted", "too_long"]);

/**
 * @param providers  [{ provider, apiKey, model }] in the order to try
 * @returns { input, model, usage, stopReason, provider, tried: [{ provider, code }] }
 * @throws  ExtractionError (the first provider's error, which is the most informative)
 */
export async function extractWithFallback({ providers, pdf, mime = "application/pdf", task, filename, departments, fetchImpl, sleep, extractors = EXTRACTORS }) {
  if (!providers?.length) throw new ExtractionError("not_configured", "AI extraction isn't set up: add GEMINI_API_KEY (free) or another AI key to the server's environment.", true);
  const tried = [];
  let first = null;
  for (let i = 0; i < providers.length; i++) {
    const { provider, apiKey, model } = providers[i];
    const extract = extractors[provider];
    if (!extract) continue;
    // With a backup waiting, do not spend time retrying a busy provider: move on at once.
    const retries = i < providers.length - 1 ? 0 : undefined;
    try {
      const out = await extract({ pdf, mime, ...(task ? { task } : {}), filename, departments, apiKey, model, fetchImpl, sleep, ...(retries === undefined ? {} : { retries }) });
      return { ...out, provider, tried };
    } catch (e) {
      if (!(e instanceof ExtractionError)) throw e;
      tried.push({ provider, code: e.code });
      first ||= e;
      if (STOP.has(e.code)) throw e;
    }
  }
  if (!first) throw new ExtractionError("not_configured", "No AI provider is set up.", true);
  // Everything failed. Keep the first provider's message, but stay retryable if any attempt was.
  first.retryable = first.retryable || tried.length > 1;
  first.tried = tried;
  throw first;
}
