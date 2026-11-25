import test from "node:test";
import assert from "node:assert/strict";
import { CAMPUS, directionsUrl, formatKm, formatMinutes, isPin, osmDirectionsUrl, osmEmbedUrl, parseMapsLink, placeUrl, routeSummary, straightKm } from "../../lib/hackathons/geo.js";

const CMRIT = { lat: 12.966654, lng: 77.711623 };

test("the distance from BMSIT to CMRIT is about 24 km in a straight line", () => {
  const km = straightKm(CAMPUS, CMRIT);
  assert.ok(km > 23.5 && km < 25, String(km));
  assert.equal(straightKm(CAMPUS, CAMPUS), 0);
});

test("pins must be real coordinates", () => {
  assert.equal(isPin(12.97, 77.71), true);
  assert.equal(isPin(91, 0), false);
  assert.equal(isPin(0, 181), false);
  assert.equal(isPin(NaN, 5), false);
  assert.equal(isPin("12", "77"), false);
});

test("a pin is read from the ways people paste a Google Maps link", () => {
  assert.deepEqual(parseMapsLink("https://www.google.com/maps/place/CMR+Institute+of+Technology/@12.9666543,77.7116234,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d12.966654!4d77.711623"), { lat: 12.966654, lng: 77.711623, name: "CMR Institute of Technology" });
  assert.deepEqual(parseMapsLink("https://www.google.com/maps/@12.9666543,77.7116234,15z"), { lat: 12.966654, lng: 77.711623 });
  assert.deepEqual(parseMapsLink("https://www.google.com/maps?q=12.9666,77.7116"), { lat: 12.9666, lng: 77.7116 });
  assert.deepEqual(parseMapsLink("https://www.google.com/maps/search/?api=1&query=12.9666%2C77.7116"), { lat: 12.9666, lng: 77.7116 });
  assert.deepEqual(parseMapsLink("https://maps.google.com/?ll=12.9666,77.7116&z=16"), { lat: 12.9666, lng: 77.7116 });
});

test("the place's own pin wins over the map's centre", () => {
  const r = parseMapsLink("https://www.google.com/maps/place/X/@12.0000,77.0000,17z/data=!3d12.5!4d77.5");
  assert.deepEqual([r.lat, r.lng], [12.5, 77.5]);
});

test("OpenStreetMap links, geo: links and plain coordinates work too", () => {
  assert.deepEqual(parseMapsLink("https://www.openstreetmap.org/?mlat=12.9666&mlon=77.7116#map=16/12.9666/77.7116"), { lat: 12.9666, lng: 77.7116 });
  assert.deepEqual(parseMapsLink("https://www.openstreetmap.org/#map=17/12.96665/77.71162"), { lat: 12.96665, lng: 77.71162 });
  assert.deepEqual(parseMapsLink("geo:12.9666,77.7116"), { lat: 12.9666, lng: 77.7116 });
  assert.deepEqual(parseMapsLink(" 12.9666 , 77.7116 "), { lat: 12.9666, lng: 77.7116 });
});

test("things that are not a map pin give nothing", () => {
  for (const bad of ["", "   ", "CMRIT Bengaluru", "https://example.com/page", "999.1, 77.7", "12.9666", "https://www.google.com/maps/@99.5,77.7,15z", null, undefined, "x".repeat(3000)]) assert.equal(parseMapsLink(bad), null, String(bad).slice(0, 30));
});

test("the directions link opens Google Maps with BMSIT as the start", () => {
  const u = new URL(directionsUrl({ to: CMRIT }));
  assert.equal(u.origin + u.pathname, "https://www.google.com/maps/dir/");
  assert.equal(u.searchParams.get("api"), "1");
  assert.equal(u.searchParams.get("origin"), "13.133743,77.568174");
  assert.equal(u.searchParams.get("destination"), "12.966654,77.711623");
  assert.equal(u.searchParams.get("travelmode"), "driving");
  assert.equal(new URL(directionsUrl({ to: CMRIT, mode: "transit" })).searchParams.get("travelmode"), "transit");
  assert.equal(new URL(directionsUrl({ to: CMRIT, mode: "hack" })).searchParams.get("travelmode"), "driving");
});

test("with no pin, the venue's name or address still gives working directions", () => {
  const u = new URL(directionsUrl({ to: { text: "CMR Institute of Technology, AECS Layout, Bengaluru" } }));
  assert.equal(u.searchParams.get("destination"), "CMR Institute of Technology, AECS Layout, Bengaluru");
  assert.equal(directionsUrl({ to: {} }), null);
  assert.equal(directionsUrl({ to: { text: "" } }), null);
  assert.equal(new URL(placeUrl({ text: "Hall 2" })).searchParams.get("query"), "Hall 2");
  assert.equal(new URL(placeUrl(CMRIT)).searchParams.get("query"), "12.966654,77.711623");
});

test("an address in a link is encoded, so it cannot change the link", () => {
  const u = directionsUrl({ to: { text: "Hall 2&travelmode=walking#x" } });
  assert.equal(new URL(u).searchParams.get("travelmode"), "driving");
  assert.equal(new URL(u).hash, "");
});

test("the in-page map is a small OpenStreetMap view with a marker, and the OSM route link names both ends", () => {
  const u = new URL(osmEmbedUrl(CMRIT));
  assert.equal(u.origin + u.pathname, "https://www.openstreetmap.org/export/embed.html");
  assert.equal(u.searchParams.get("marker"), "12.966654,77.711623");
  const [w, s, e, n] = u.searchParams.get("bbox").split(",").map(Number);
  assert.ok(w < 77.711623 && e > 77.711623 && s < 12.966654 && n > 12.966654);
  assert.equal(osmEmbedUrl({ lat: 200, lng: 0 }), null);
  assert.equal(osmEmbedUrl(null), null);
  assert.match(osmDirectionsUrl(CAMPUS, CMRIT), /route=13\.133743%2C77\.568174%3B12\.966654%2C77\.711623$/);
});

test("distances and times are written the way people say them", () => {
  assert.equal(formatKm(36.9), "37 km");
  assert.equal(formatKm(4.26), "4.3 km");
  assert.equal(formatKm(null), "");
  assert.equal(formatMinutes(42), "42 min");
  assert.equal(formatMinutes(65), "1 h 5 min");
  assert.equal(formatMinutes(120), "2 h");
  assert.equal(formatMinutes(undefined), "");
});

test("the route text says whether it is a road distance or only a straight line, and is empty on campus", () => {
  assert.equal(routeSummary({ off_campus: false, route_km: 5 }), null);
  const road = routeSummary({ off_campus: true, route_km: "36.9", route_minutes: 42, route_source: "road" });
  assert.equal(road.road, true);
  assert.equal(road.text, "About 37 km from BMSIT by road, around 42 min by car without traffic");
  const line = routeSummary({ off_campus: true, route_km: 24.2, route_minutes: null, route_source: "straight" });
  assert.equal(line.road, false);
  assert.match(line.text, /24 km from BMSIT in a straight line/);
  assert.deepEqual(routeSummary({ off_campus: true, route_km: null }), { km: null, minutes: null, road: false, text: "" });
});
