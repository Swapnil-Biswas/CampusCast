// Link checks for Connect profiles. Pure functions: every address a person types is checked here, and the database
// checks the saved result again (supabase/dashboard-9-connect-people.sql). A bad link is REFUSED with a message, never
// quietly changed into something else, apart from tidying (adding https://, dropping tracking parameters).

const CONTROL = /[\u0000-\u001f\u007f\s]/;

// Parses what a person typed. Accepts "linkedin.com/in/x" (no scheme) but never http:, javascript:, data: and so on.
function parse(raw) {
  const s = String(raw ?? "").trim();
  if (!s || s.length > 300 || CONTROL.test(s)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s.replace(/^\/\//, "")}`;
  let u;
  try { u = new URL(withScheme); } catch { return null; }
  if (u.protocol !== "https:") return null;          // http, javascript, data, mailto, ftp... all refused
  if (u.username || u.password) return null;          // https://linkedin.com@evil.example/ style tricks
  if (u.port) return null;
  return u;
}

const isHostIp = (h) => /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":");

/** @returns {{ ok: true, value: string|null } | { ok: false, error: string }}  empty input is fine and gives null */
export function cleanLinkedIn(raw) {
  if (!String(raw ?? "").trim()) return { ok: true, value: null };
  const bad = { ok: false, error: "That is not a LinkedIn profile link. Use the address of your profile, like https://www.linkedin.com/in/your-name" };
  const u = parse(raw);
  if (!u) return bad;
  const host = u.hostname.toLowerCase();
  // linkedin.com, www.linkedin.com and country sites such as in.linkedin.com. Nothing like linkedin.com.evil.example.
  if (!(host === "linkedin.com" || /^[a-z]{2,3}\.linkedin\.com$/.test(host))) return bad;
  const m = /^\/in\/([A-Za-z0-9._%-]{3,100})\/?$/.exec(u.pathname);
  if (!m) return bad;
  if (/%(?![89a-f][0-9a-f])/i.test(m[1])) return bad;       // only non-ASCII letters (names in other scripts) may be percent-encoded, never < > or / and the like
  return { ok: true, value: `https://www.linkedin.com/in/${m[1]}` };
}

export function cleanGitHub(raw) {
  if (!String(raw ?? "").trim()) return { ok: true, value: null };
  const bad = { ok: false, error: "That is not a GitHub profile link, like https://github.com/your-name" };
  const u = parse(raw);
  if (!u) return bad;
  const host = u.hostname.toLowerCase();
  if (host !== "github.com" && host !== "www.github.com") return bad;
  const m = /^\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/?$/.exec(u.pathname);
  return m ? { ok: true, value: `https://github.com/${m[1]}` } : bad;
}

// Any other https page (a personal site, a paper on a journal's site or a DOI). No bare IP addresses, no localhost.
export function cleanHttpsUrl(raw, label = "link") {
  if (!String(raw ?? "").trim()) return { ok: true, value: null };
  const bad = { ok: false, error: `The ${label} must be a full https:// address.` };
  const u = parse(raw);
  if (!u) return bad;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || isHostIp(host) || host.endsWith(".local") || host.endsWith(".internal") || host === "localhost") return bad;
  u.hash = u.hash.length > 60 ? "" : u.hash;
  const out = u.toString();
  return out.length <= 300 ? { ok: true, value: out } : bad;
}

// A link that is safe to put in an href. Anything stored should already pass; this guards against a bad row.
export const safeHref = (v) => { const r = cleanHttpsUrl(v); return r.ok ? r.value : null; };
export const safeLinkedIn = (v) => { const r = cleanLinkedIn(v); return r.ok ? r.value : null; };
