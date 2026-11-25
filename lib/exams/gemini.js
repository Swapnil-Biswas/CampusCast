import { EXTRACTION_TOOL } from "./tool-schema.js";
import { clean } from "./normalize.js";
import { ExtractionError, SYSTEM_PROMPT } from "./provider.js";

// Google Gemini as a second AI provider (it has a free tier). Same job and same output shape as provider.js:
// read an examination PDF and return the structured answer, which normalize.js then checks strictly.
// The PDF goes in as inline data; the model is given no tools, so it can only return text (JSON). Plain fetch, no SDK.

export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
// A stable Flash model (the "-latest" alias was overloaded in testing). Set GEMINI_MODEL to use another.
export const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";
// Inline requests are limited to about 20 MB in total, and base64 makes a file about a third bigger.
export const GEMINI_MAX_BASE64 = 19 * 1024 * 1024;

export const JSON_RULES = `

OUTPUT FORMAT
Reply with one JSON object and nothing else: no prose, no markdown fences. It must follow this JSON Schema exactly (use null where the schema allows it and the document does not say). Wherever the rules above mention calling record_examination_notice, this JSON object is that record.

${JSON.stringify(EXTRACTION_TOOL.input_schema)}`;

export function buildGeminiRequest({ pdfBase64, mime = "application/pdf", filename, departments = [], maxOutputTokens = 30000 }) {
  const list = departments.map((d) => `- ${clean(d.name, 120)}`).join("\n") || "- (none configured)";
  return {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT + JSON_RULES }] },
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType: mime, data: pdfBase64 } },
        { text: `Extract the examination information from the attached file (file name: ${JSON.stringify(clean(filename, 80))}).\n\nConfigured departments (use these exact names):\n${list}` },
      ],
    }],
    generationConfig: { responseMimeType: "application/json", temperature: 0, maxOutputTokens },
  };
}

// The model sometimes wraps JSON in a fence even when asked not to.
export function parseJsonAnswer(text) {
  const t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { const v = JSON.parse(t); return v && typeof v === "object" && !Array.isArray(v) ? v : null; } catch { return null; }
}

const RETRYABLE = new Set([408, 500, 502, 503, 504]);

/** @returns { input, model, usage, stopReason }  @throws ExtractionError */
export async function extractWithGemini({
  pdf, mime = "application/pdf", filename, departments, apiKey, model = GEMINI_DEFAULT_MODEL, maxTokens,
  fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), timeoutMs = 240_000, retries = 2,
}) {
  if (!apiKey) throw new ExtractionError("not_configured", "AI extraction isn't set up: add GEMINI_API_KEY to the server's environment.");
  const pdfBase64 = Buffer.from(pdf).toString("base64");
  if (pdfBase64.length > GEMINI_MAX_BASE64) throw new ExtractionError("too_large", "This file is too large for the free AI reader (about 14 MB). Compress it, or split a PDF and upload the parts separately.");
  const body = JSON.stringify(buildGeminiRequest({ pdfBase64, mime, filename, departments, maxOutputTokens: maxTokens }));
  const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent`;

  let last;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(attempt * 5000);   // the free tier is rate limited: wait a little longer
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let res;
    try {
      // The key travels in a header, never in the URL, so it cannot end up in logs.
      res = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey }, body, signal: ctl.signal });
    } catch (e) {
      clearTimeout(timer);
      last = new ExtractionError("network", e?.name === "AbortError" ? "The AI service took too long to answer." : "Could not reach the AI service.", true);
      continue;
    }
    clearTimeout(timer);

    let data = null;
    try { data = await res.json(); } catch { /* non-JSON error body */ }

    if (!res.ok) {
      const msg = clean(data?.error?.message || "", 300);
      if (res.status === 401 || res.status === 403) throw new ExtractionError("auth", "The AI service rejected the API key. Check GEMINI_API_KEY.");
      if (res.status === 404) throw new ExtractionError("bad_model", `The AI model "${model}" was not found. Check EXAM_AI_MODEL.`);
      if (res.status === 413) throw new ExtractionError("too_large", "The PDF is too large for the AI service.");
      if (res.status === 429) { last = new ExtractionError("busy", "The free AI service is rate limited right now. Please try again in a minute.", true); continue; }
      if (res.status === 400) {
        if (/api key|api_key/i.test(msg)) throw new ExtractionError("auth", "The AI service rejected the API key. Check GEMINI_API_KEY.");
        if (/password|encrypt/i.test(msg)) throw new ExtractionError("encrypted", "The PDF is password-protected. Please upload an unlocked copy.");
        if (/page|too many|exceed|token/i.test(msg)) throw new ExtractionError("too_long", "The PDF is too long for one pass. Split it and upload the parts separately.");
        throw new ExtractionError("bad_request", `The AI service could not read this file${msg ? `: ${msg}` : "."}`);
      }
      if (RETRYABLE.has(res.status)) { last = new ExtractionError("busy", "The AI service is busy. Please try again in a minute.", true); continue; }
      throw new ExtractionError("service", `The AI service returned an error (${res.status}).`, true);
    }

    if (data?.promptFeedback?.blockReason) throw new ExtractionError("blocked", "The AI service declined to read this document.");
    const cand = data?.candidates?.[0];
    const reason = cand?.finishReason;
    if (reason === "MAX_TOKENS") throw new ExtractionError("too_long", "The document is too long to read in one go. Split it into smaller PDFs.");
    if (reason && !["STOP", "FINISH_REASON_UNSPECIFIED"].includes(reason)) throw new ExtractionError("blocked", "The AI service stopped before finishing. Please try again.", true);
    const text = (cand?.content?.parts || []).filter((p) => typeof p?.text === "string" && !p.thought).map((p) => p.text).join("");
    const input = parseJsonAnswer(text);
    if (!input) throw new ExtractionError("no_output", "The AI did not return a usable structured result.", true);
    return { input, model: data.modelVersion || model, usage: data.usageMetadata || null, stopReason: reason || null };
  }
  throw last || new ExtractionError("service", "The AI service did not answer.", true);
}
