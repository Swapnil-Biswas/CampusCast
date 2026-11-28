import test from "node:test";
import assert from "node:assert/strict";
import { findVenue, resolveMapsLink, roadRoute, searchPlaces } from "../../lib/hackathons/geocode.js";

const json = (body, status = 200) => ({ ok: status < 400, status, headers: new Headers(), json: async () => body });
const redirect = (location) => ({ ok: false, status: 302, headers: new Headers({ location }), json: async () => null });
function rec(...rs) {
  const calls = [];
  return { calls, fetchImpl: async (url, init) => { calls.push({ url: String(url), init }); const r = rs[Math.min(calls.length - 1, rs.length - 1)]; if (r instanceof Error) throw r; return typeof r === "function" ? r(String(url)) : r; } };
}
const CMRIT = { lat: 12.966654, lng: 77.711623 };

test("a venue is found by name, listed nearest to Bengaluru first, with its distance from BMSIT", async () => {
  const { calls, fetchImpl } = rec(json([
    { lat: "28.61", lon: "77.20", display_name: "CMR Institute, New Delhi, Delhi, India" },
    { lat: "12.9666543", lon: "77.7116234", display_name: "CMR Institute of Technology, 3rd Cross Road, AECS Layout A Block, EPIP Zone, Bengaluru, Karnataka" },
  ]));
  const r = await searchPlaces("CMR Institute of Technology Bengaluru", { fetchImpl });
  assert.equal(r.length, 2);
  assert.equal(r[0].name, "CMR Institute of Technology, 3rd Cross Road, AECS Layout A Block, EPIP Zone");
  assert.deepEqual([r[0].lat, r[0].lng], [12.966654, 77.711623]);
  assert.ok(r[0].km > 23 && r[0].km < 26, String(r[0].km));
  assert.match(calls[0].url, /^https:\/\/nominatim\.openstreetmap\.org\/search\?/);
  assert.match(calls[0].url, /countrycodes=in/);
  assert.match(calls[0].init.headers["user-agent"], /CampusCast/);
});

test("the search ignores short or empty queries, junk rows, and reports an unavailable service", async () => {
  const f = rec(json([]));
  assert.deepEqual(await searchPlaces("ab", { fetchImpl: f.fetchImpl }), []);
  assert.equal(f.calls.length, 0);
  const junk = rec(json([{ lat: "x", lon: "y", display_name: "Nowhere" }, { lat: "99", lon: "10", display_name: "Off the map" }, { lat: "12.9", lon: "77.6" }]));
  assert.deepEqual(await searchPlaces("some place", { fetchImpl: junk.fetchImpl }), []);
  await assert.rejects(searchPlaces("some place", { fetchImpl: rec(json({}, 503)).fetchImpl }), /not available/);
  await assert.rejects(searchPlaces("some place", { fetchImpl: rec(json({ not: "a list" })).fetchImpl }), /did not answer/);
});

test("the road distance and driving time come from the router", async () => {
  const { calls, fetchImpl } = rec(json({ code: "Ok", routes: [{ distance: 36913.1, duration: 2516.9 }] }));
  const r = await roadRoute(CMRIT, { fetchImpl });
  assert.deepEqual(r, { km: 36.9, minutes: 42, source: "road" });
  assert.match(calls[0].url, /router\.project-osrm\.org\/route\/v1\/driving\/77\.5681741,13\.1337434;77\.711623,12\.966654/);
});

test("if the first router is down the second is tried; if both are down the straight line is used", async () => {
  const second = rec(new Error("socket"), json({ code: "Ok", routes: [{ distance: 36913, duration: 2517 }] }));
  const r = await roadRoute(CMRIT, { fetchImpl: second.fetchImpl });
  assert.equal(r.source, "road");
  assert.match(second.calls[1].url, /routing\.openstreetmap\.de/);
  const down = rec(json({}, 502), new Error("timeout"));
  const line = await roadRoute(CMRIT, { fetchImpl: down.fetchImpl });
  assert.deepEqual([line.source, line.minutes], ["straight", null]);
  assert.ok(line.km > 23 && line.km < 26);
});

test("an impossible route answer is not trusted", async () => {
  const shorter = await roadRoute(CMRIT, { fetchImpl: rec(json({ code: "Ok", routes: [{ distance: 3000, duration: 400 }] })).fetchImpl });
  assert.equal(shorter.source, "straight");               // shorter than the straight line: nonsense
  const far = await roadRoute(CMRIT, { fetchImpl: rec(json({ code: "Ok", routes: [{ distance: 9e7, duration: 9e5 }] })).fetchImpl });
  assert.equal(far.source, "straight");
  const noRoute = await roadRoute(CMRIT, { fetchImpl: rec(json({ code: "NoRoute" })).fetchImpl });
  assert.equal(noRoute.source, "straight");
  assert.equal((await roadRoute({ lat: 999, lng: 0 }, { fetchImpl: rec(json({})).fetchImpl })).source, "straight");
});

test("a normal Google Maps link is read without any network call", async () => {
  const f = rec(json({}));
  const r = await resolveMapsLink("https://www.google.com/maps/place/CMR+Institute/@12.9666543,77.7116234,17z", { fetchImpl: f.fetchImpl });
  assert.deepEqual([r.lat, r.lng, r.name], [12.966654, 77.711623, "CMR Institute"]);
  assert.equal(f.calls.length, 0);
});

test("a short Google Maps link is followed to its pin", async () => {
  const f = rec(redirect("https://www.google.com/maps/place/CMRIT/@12.9666543,77.7116234,17z/data=!3d12.966654!4d77.711623"));
  const r = await resolveMapsLink("https://maps.app.goo.gl/AbCdEf123", { fetchImpl: f.fetchImpl });
  assert.deepEqual([r.lat, r.lng], [12.966654, 77.711623]);
  assert.equal(f.calls[0].init.redirect, "manual");
});

test("several redirects are followed, but only between Google's own addresses", async () => {
  const chain = rec(redirect("https://goo.gl/maps/step2"), redirect("https://www.google.com/maps?q=12.9666,77.7116"));
  assert.deepEqual(await resolveMapsLink("https://maps.app.goo.gl/x", { fetchImpl: chain.fetchImpl }), { lat: 12.9666, lng: 77.7116 });
  const evil = rec(redirect("https://evil.example.com/steal"), json({}));
  assert.equal(await resolveMapsLink("https://maps.app.goo.gl/x", { fetchImpl: evil.fetchImpl }), null);
  assert.equal(evil.calls.length, 1, "the other website was never contacted");
  const loop = rec(redirect("https://goo.gl/again"));
  assert.equal(await resolveMapsLink("https://maps.app.goo.gl/x", { fetchImpl: loop.fetchImpl }), null);
  assert.ok(loop.calls.length <= 5);
});

test("other websites, plain http, passwords in the address, and errors are never contacted or trusted", async () => {
  for (const bad of ["https://evil.example.com/maps/@12.9,77.6", "http://maps.app.goo.gl/x", "https://user:pw@maps.app.goo.gl/x", "https://169.254.169.254/latest/meta-data", "https://localhost/x", "ftp://goo.gl/x", "not a link at all"]) {
    const f = rec(json({}));
    const r = await resolveMapsLink(bad, { fetchImpl: f.fetchImpl });
    assert.equal(f.calls.length, 0, `${bad} was contacted`);
    if (bad.startsWith("https://evil")) assert.deepEqual(r, { lat: 12.9, lng: 77.6 });   // the pin text itself is harmless to read
    else assert.equal(r, null, bad);
  }
  assert.equal(await resolveMapsLink("https://maps.app.goo.gl/x", { fetchImpl: rec(new Error("down")).fetchImpl }), null);
  assert.equal(await resolveMapsLink("https://maps.app.goo.gl/x", { fetchImpl: rec(json({}, 404)).fetchImpl }), null);
});

test("'find on map' takes either a search or a pasted link", async () => {
  const a = await findVenue({ query: "CMRIT Bangalore" }, { fetchImpl: rec(json([{ lat: "12.9677", lon: "77.7140", display_name: "CMRIT, Kundalahalli Main Road, Bengaluru" }])).fetchImpl });
  assert.equal(a[0].name, "CMRIT, Kundalahalli Main Road, Bengaluru");
  const b = await findVenue({ link: "https://www.google.com/maps/@12.9666543,77.7116234,17z" }, {});
  assert.deepEqual([b[0].lat, b[0].lng, b[0].name], [12.966654, 77.711623, "The place in your link"]);
  assert.ok(b[0].km > 23);
  assert.deepEqual(await findVenue({ link: "https://example.com/nothing" }, {}), []);
  assert.deepEqual(await findVenue({ query: "" }, {}), []);
});
