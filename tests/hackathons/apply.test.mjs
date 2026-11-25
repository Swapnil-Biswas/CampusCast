import test from "node:test";
import assert from "node:assert/strict";
import { applyPatch, describeApplyFailure } from "../../lib/hackathons/apply.js";

// a fake Supabase whose "hackathons" table refuses columns it does not have
function fake(missing = []) {
  const rows = {}; const calls = [];
  return {
    rows, calls,
    from: () => ({ update: (obj) => ({ eq: async () => {
      calls.push(Object.keys(obj));
      const bad = Object.keys(obj).find((k) => missing.includes(k));
      if (bad) return { error: { message: `Could not find the '${bad}' column of 'hackathons' in the schema cache` } };
      Object.assign(rows, obj); return { error: null };
    } }) }),
  };
}

test("everything is saved in one update when the database accepts it", async () => {
  const s = fake();
  const r = await applyPatch(s, "id", { title: "A", theme: "AI", details: { x: 1 } });
  assert.equal(r.ok, true); assert.equal(s.calls.length, 1); assert.equal(s.rows.title, "A");
});

test("a missing column no longer leaves the whole form empty", async () => {
  const s = fake(["venue_lat", "route_km"]);
  const r = await applyPatch(s, "id", { title: "TechFiesta", theme: "AI", venue_lat: 13, route_km: 37, details: { perks: ["x"] } });
  assert.equal(r.ok, false);
  assert.deepEqual(r.failed.map((f) => f.key).sort(), ["route_km", "venue_lat"]);
  assert.equal(s.rows.title, "TechFiesta"); assert.equal(s.rows.theme, "AI"); assert.deepEqual(s.rows.details, { perks: ["x"] });
  assert.equal(s.rows.venue_lat, undefined);
});

test("the message tells the person to run the SQL when columns are missing", () => {
  const msg = describeApplyFailure([{ key: "venue_lat", message: "Could not find the 'venue_lat' column of 'hackathons' in the schema cache" }]);
  assert.match(msg, /dashboard-8-hackathons\.sql/); assert.match(msg, /venue_lat/);
  assert.match(describeApplyFailure([{ key: "ends_at", message: "violates check constraint" }]), /ends_at/);
  assert.equal(describeApplyFailure([]), "");
});
