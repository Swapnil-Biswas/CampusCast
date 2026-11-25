// Map helpers for hackathons that are outside the campus: where BMSIT is, distances, links that open a route in a new
// window, and the address of a small map that can be shown on the page itself. Pure functions (no network), so they can be
// tested and used in the browser as well as on the server. The services that need the network are in geocode.js.

// BMS Institute of Technology and Management, Avalahalli, Yelahanka, Bengaluru (found with OpenStreetMap's search).
export const CAMPUS = {
  name: "BMS Institute of Technology and Management",
  short: "BMSIT",
  lat: 13.1337434,
  lng: 77.5681741,
};

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
/** A usable map pin? */
export const isPin = (lat, lng) => isNum(lat) && isNum(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
const round6 = (n) => Math.round(n * 1e6) / 1e6;
const pin = (lat, lng) => (isPin(Number(lat), Number(lng)) ? { lat: round6(Number(lat)), lng: round6(Number(lng)) } : null);

/** Straight-line distance in kilometres (great circle). */
export function straightKm(a, b) {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const NUM = "(-?\\d{1,3}(?:\\.\\d+)?)";
/**
 * Pulls a map pin out of whatever an admin pastes: a Google Maps link (place pin, viewport, ?q=, ?query=, ?ll=), an
 * OpenStreetMap link, a geo: link, or plain "12.9666, 77.7116". Returns { lat, lng, name? } or null.
 * (A short link such as maps.app.goo.gl has to be followed first: see resolveMapsLink in geocode.js.)
 */
export function parseMapsLink(input) {
  const s = (() => { try { return decodeURIComponent(String(input ?? "")); } catch { return String(input ?? ""); } })().trim();
  if (!s || s.length > 2000) return null;
  const tries = [
    new RegExp(`!3d${NUM}!4d${NUM}`),                                  // Google: the place's own pin (most exact)
    new RegExp(`@${NUM},${NUM}`),                                       // Google: the map's centre
    new RegExp(`[?&#](?:q|query|ll|destination|center|sll)=${NUM}(?:,|\\+|%2C)\\s*${NUM}`),
    new RegExp(`[?&]mlat=${NUM}.*?[?&]mlon=${NUM}`),                    // OpenStreetMap marker
    new RegExp(`#map=\\d{1,2}/${NUM}/${NUM}`),                          // OpenStreetMap view
    new RegExp(`^geo:${NUM},${NUM}`),
    new RegExp(`^${NUM}\\s*,\\s*${NUM}$`),                              // just two numbers
  ];
  for (const re of tries) {
    const m = re.exec(s);
    const p = m && pin(m[1], m[2]);
    if (p) {
      const place = /\/maps\/place\/([^/@?]+)/.exec(s);
      return { ...p, ...(place ? { name: place[1].replace(/\+/g, " ").trim().slice(0, 120) } : {}) };
    }
  }
  return null;
}

// Where the point may be given as a pin ({ lat, lng }) or just as words ({ text }), so a link still works without a pin.
const where = (p) => (p && isPin(Number(p.lat), Number(p.lng)) ? `${round6(Number(p.lat))},${round6(Number(p.lng))}` : String(p?.text || "").slice(0, 300));
const enc = encodeURIComponent;

/** Opens Google Maps with the route already worked out. mode: driving | transit | walking | bicycling. */
export function directionsUrl({ from = CAMPUS, to, mode = "driving" }) {
  const dest = where(to);
  if (!dest) return null;
  const m = ["driving", "transit", "walking", "bicycling"].includes(mode) ? mode : "driving";
  return `https://www.google.com/maps/dir/?api=1&origin=${enc(where(from))}&destination=${enc(dest)}&travelmode=${m}`;
}
/** Opens the place itself on Google Maps. */
export const placeUrl = (p) => (where(p) ? `https://www.google.com/maps/search/?api=1&query=${enc(where(p))}` : null);
/** The same route on OpenStreetMap (no account, no ads), for people who prefer it. */
export const osmDirectionsUrl = (from, to) => `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${enc(where(from))}${enc(";")}${enc(where(to))}`;
/** A small map with a marker that can be shown inside the page (no key needed). */
export function osmEmbedUrl(p, span = 0.008) {
  const lat = Number(p?.lat), lng = Number(p?.lng);
  if (!isPin(lat, lng)) return null;
  const bbox = [lng - span * 1.6, lat - span, lng + span * 1.6, lat + span].map(round6).join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${enc(bbox)}&layer=mapnik&marker=${enc(`${round6(lat)},${round6(lng)}`)}`;
}

// ---------- how far, in words ----------
export const formatKm = (km) => (km == null || !Number.isFinite(Number(km)) ? "" : Number(km) < 10 ? `${Number(km).toFixed(1)} km` : `${Math.round(Number(km))} km`);
export function formatMinutes(min) {
  if (min == null || !Number.isFinite(Number(min))) return "";
  const m = Math.round(Number(min));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}

/**
 * What to tell students about getting there, from the saved hackathon row.
 * @returns null when it is on campus; otherwise { km, minutes, road, text } (text is ready to show)
 */
export function routeSummary(h) {
  if (!h?.off_campus) return null;
  const km = h.route_km == null ? null : Number(h.route_km);
  if (km == null) return { km: null, minutes: null, road: false, text: "" };
  const minutes = h.route_minutes == null ? null : Number(h.route_minutes);
  const road = h.route_source === "road";
  return {
    km, minutes, road,
    text: road
      ? `About ${formatKm(km)} from ${CAMPUS.short} by road${minutes ? `, around ${formatMinutes(minutes)} by car without traffic` : ""}`
      : `About ${formatKm(km)} from ${CAMPUS.short} in a straight line (the road distance is longer)`,
  };
}
