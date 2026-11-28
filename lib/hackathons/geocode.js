import { CAMPUS, isPin, parseMapsLink, straightKm } from "./geo.js";

// The map services behind "outside the campus" hackathons. Server-side only. All of them are free and key-less:
//   - OpenStreetMap's search (Nominatim) finds a venue from its name or address;
//   - OSRM (two public servers, tried in turn) measures the road distance and driving time from BMSIT;
//   - a pasted Google Maps link is read for its pin (short links such as maps.app.goo.gl are followed).
// They are public, shared services, so every call has a short timeout, they are used only when an admin saves or searches
// (never when a student looks at a page), and when a service is down CampusCast falls back instead of failing: the
// straight-line distance is used and the directions button still works.

const UA = "CampusCast/1.0 (college platform)";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const ROUTERS = ["https://router.project-osrm.org/route/v1/driving", "https://routing.openstreetmap.de/routed-car/route/v1/driving"];
const NEAR = { lat: 12.97, lng: 77.59 };       // Bengaluru: only used to list nearby matches first
const round1 = (n) => Math.round(n * 10) / 10;
const clean = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

const withTimeout = (ms) => AbortSignal.timeout(ms);

/** Venues matching a name or address, nearest to Bengaluru first. [{ name, lat, lng, km }] (km = straight line from BMSIT). */
export async function searchPlaces(query, { fetchImpl = fetch, limit = 5, timeoutMs = 15_000 } = {}) {
  const q = clean(query, 200);
  if (q.length < 3) return [];
  const res = await fetchImpl(`${NOMINATIM}?format=jsonv2&limit=${limit}&countrycodes=in&q=${encodeURIComponent(q)}`, {
    headers: { "user-agent": UA, "accept-language": "en" }, signal: withTimeout(timeoutMs),
  });
  if (!res.ok) throw new Error("The map search is not available right now.");
  const rows = await res.json().catch(() => null);
  if (!Array.isArray(rows)) throw new Error("The map search did not answer properly.");
  const out = [];
  for (const r of rows) {
    const lat = Number(r.lat), lng = Number(r.lon);
    if (!isPin(lat, lng)) continue;
    const name = clean(String(r.display_name || r.name || "").split(",").slice(0, 4).join(","), 140);
    if (name) out.push({ name, lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, km: round1(straightKm(CAMPUS, { lat, lng })) });
  }
  return out.sort((a, b) => straightKm(NEAR, a) - straightKm(NEAR, b));
}

/** Road distance and driving time from BMSIT: { km, minutes, source: "road" }, or the straight line { km, minutes: null, source: "straight" } if no router answers. */
export async function roadRoute(to, { from = CAMPUS, fetchImpl = fetch, timeoutMs = 12_000 } = {}) {
  const line = { km: round1(straightKm(from, to)), minutes: null, source: "straight" };
  if (!isPin(to?.lat, to?.lng)) return line;
  for (const base of ROUTERS) {
    try {
      const res = await fetchImpl(`${base}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false&alternatives=false`, { headers: { "user-agent": UA }, signal: withTimeout(timeoutMs) });
      if (!res.ok) continue;
      const j = await res.json();
      const r = j?.code === "Ok" ? j.routes?.[0] : null;
      const km = Number(r?.distance) / 1000, min = Number(r?.duration) / 60;
      // A road cannot be shorter than the straight line, and nothing here is thousands of kilometres away.
      if (Number.isFinite(km) && Number.isFinite(min) && km > 0 && km < 3000 && km >= line.km * 0.9) return { km: round1(km), minutes: Math.max(1, Math.round(min)), source: "road" };
    } catch { /* this router is down or slow: try the next */ }
  }
  return line;
}

// ---------- pasted Google Maps links ----------
// Only these addresses are ever contacted, and a redirect that leaves them is not followed.
const ALLOWED_HOSTS = new Set(["maps.app.goo.gl", "goo.gl", "www.google.com", "google.com", "maps.google.com", "www.google.co.in", "google.co.in"]);
const SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl"]);
const safeUrl = (s) => { try { const u = new URL(s); return u.protocol === "https:" && ALLOWED_HOSTS.has(u.hostname) && !u.username && !u.password ? u : null; } catch { return null; } };

/** The pin inside a pasted map link or coordinates, or null. Short links are followed (at most 5 steps, only to Google's own hosts). */
export async function resolveMapsLink(input, { fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
  const text = clean(String(input ?? ""), 2000);
  const direct = parseMapsLink(text);
  if (direct) return direct;
  let u = safeUrl(text);
  if (!u || !SHORT_HOSTS.has(u.hostname)) return null;
  for (let i = 0; i < 5; i++) {
    let res;
    try { res = await fetchImpl(u.toString(), { redirect: "manual", headers: { "user-agent": UA }, signal: withTimeout(timeoutMs) }); } catch { return null; }
    const loc = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!loc) return null;
    const next = (() => { try { return new URL(loc, u).toString(); } catch { return null; } })();
    const hit = next && parseMapsLink(next);
    if (hit) return hit;
    u = next && safeUrl(next);
    if (!u) return null;                                  // it left Google's own addresses: stop
  }
  return null;
}

/**
 * What the editor's "find on map" asks for: a search by name or address, or a pasted link.
 * @returns [{ name, lat, lng, km }]
 */
export async function findVenue({ query, link }, deps = {}) {
  if (clean(link, 2000)) {
    const hit = await resolveMapsLink(link, deps);
    if (!hit) return [];
    return [{ name: hit.name || "The place in your link", lat: hit.lat, lng: hit.lng, km: round1(straightKm(CAMPUS, hit)) }];
  }
  return searchPlaces(query, deps);
}
