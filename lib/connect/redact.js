// Keeps private details out of a Connect profile: phone numbers, email addresses, home addresses, dates of birth,
// USNs and similar. Used twice: on text before it is sent to the AI, and on everything the AI sends back.
// (A scanned page or photo cannot be cleaned before sending, which is why the answer is always cleaned too.)

const EMAIL = /[A-Z0-9._%+-]+\s?(?:@|\[at\]|\(at\))\s?[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// BMSIT style 1BY21CS001 / 25UG1BYCS001, and the same shape for other colleges.
const USN = /\b(?:\d[A-Z]{2}\d{2}[A-Z]{2,3}\d{3}|\d{2}[UP]G\d[A-Z]{2}[A-Z]{2,3}\d{3})\b/gi;
// A run of digits with the usual phone punctuation. Not inside a link, a DOI or a longer word.
const PHONEISH = /(?<![\w/.=-])(?:\+\s?\d{1,3}[\s.-]?)?(?:\(\d{2,5}\)[\s.-]?)?\d(?:[\s.-]?\d){7,13}(?![\w/-])/g;
// Whole lines that are only there to say something private.
const PRIVATE_LINE = /\b(?:date\s+of\s+birth|d\.\s?o\.\s?b\b|dob\b|born\s+on|(?:permanent|home|residential|present|current|postal)\s+address|address\s*[:-]|father'?s?\s+name|mother'?s?\s+name|marital\s+status|aadha?ar|passport\s*(?:no|number)|pan\s*(?:no|number|card)|gender\s*[:-]|blood\s+group|religion\s*[:-]|caste\s*[:-]|usn\s*[:-])/i;
// An Indian street address: a 6-digit PIN code on a line that also reads like a place.
const PIN = /(?<!\d)[1-9]\d{2}\s?\d{3}(?!\d)/;
const PLACE = /\b(?:road|rd|street|nagar|layout|cross|main|colony|village|post|taluk|district|apartment|flat|house|floor|bengaluru|bangalore|karnataka|india)\b|#\s?\d/i;

const isPhone = (m) => {
  const digits = m.replace(/\D/g, "").length;
  if (digits < 10 || digits > 13) return false;
  // Only shapes phones really have, so page ranges, year ranges and other long numbers stay: +country, (area),
  // a leading 0, or a ten-digit Indian mobile (starts with 6 to 9).
  const t = m.trim();
  return t.startsWith("+") || t.startsWith("(") || t.startsWith("0") || (digits === 10 && /^[6-9]/.test(t));
};

/** Removes private details from a piece of text. */
export function redact(text) {
  return String(text ?? "")
    .split("\n")
    .filter((line) => !PRIVATE_LINE.test(line) && !(PIN.test(line) && PLACE.test(line)))
    .map((line) => line.replace(EMAIL, " ").replace(USN, " ").replace(PHONEISH, (m) => (isPhone(m) ? " " : m)))
    .join("\n")
    .replace(/[ \t]{2,}/g, " ");
}

/** Does this value carry something private? */
export function hasPrivate(value) {
  const s = String(value ?? "");
  return redact(s).replace(/\s+/g, " ").trim() !== s.replace(/\s+/g, " ").trim();
}
