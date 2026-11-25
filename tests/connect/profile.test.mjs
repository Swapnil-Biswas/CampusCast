import test from "node:test";
import assert from "node:assert/strict";
import { cleanTags, formatLines, initials, normalizeProfile, parseLines } from "../../lib/connect/profile.js";

test("tags are lower-cased, de-duplicated and capped", () => {
  assert.deepEqual(cleanTags("React, python\nReact ,  Machine   Learning", 20), ["react", "python", "machine learning"]);
  assert.equal(cleanTags(Array.from({ length: 50 }, (_, i) => `t${i}`), 20).length, 20);
  assert.deepEqual(cleanTags(null, 5), []);
});

test("a student profile keeps only student fields and is hidden by default", () => {
  const r = normalizeProfile({ headline: " 3rd year CSE ", skills: "react, node", linkedin: "linkedin.com/in/some-student", designation: "Professor", publications: [{ title: "x" }], career: "..." });
  assert.equal(r.ok, true);
  assert.equal(r.row.visible, false);
  assert.equal(r.row.show_email, false);
  assert.equal(r.row.headline, "3rd year CSE");
  assert.deepEqual(r.row.skills, ["react", "node"]);
  assert.equal(r.row.linkedin_url, "https://www.linkedin.com/in/some-student");
  assert.equal(r.row.designation, null);          // faculty-only: ignored for a student
  assert.deepEqual(r.row.publications, []);
  assert.equal(r.row.career, null);
});

test("opt-in flags are only true when explicitly on", () => {
  assert.equal(normalizeProfile({ visible: "on", showEmail: "on" }).row.visible, true);
  assert.equal(normalizeProfile({ visible: "yes please" }).row.visible, false);
  assert.equal(normalizeProfile({}).row.show_email, false);
});

test("a faculty profile keeps research, papers, work and career", () => {
  const r = normalizeProfile({
    designation: "Associate Professor", researchAreas: "Machine Learning, NLP", career: "Moving into applied AI.",
    publications: [{ title: "A paper", venue: "IEEE Access", year: "2023", url: "https://doi.org/10.1109/x.1" }, { title: "", venue: "", year: "", url: "" }],
    work: [{ title: "Funded project", detail: "DST grant", url: "https://example.org/p" }],
  }, { faculty: true });
  assert.equal(r.ok, true);
  assert.deepEqual(r.row.research_areas, ["machine learning", "nlp"]);
  assert.deepEqual(r.row.publications, [{ title: "A paper", venue: "IEEE Access", year: 2023, url: "https://doi.org/10.1109/x.1" }]);   // empty row skipped
  assert.equal(r.row.work[0].url, "https://example.org/p");
});

test("bad input is refused with a message, not silently dropped", () => {
  const r = normalizeProfile({ linkedin: "https://evil.example/in/x", github: "http://github.com/a", website: "javascript:alert(1)", about: "x".repeat(1300), achievements: [{ title: "Won", year: "soon" }, { detail: "no title" }] });
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 6, r.errors.join(" | "));
  assert.ok(r.errors.some((e) => /LinkedIn/.test(e)));
  assert.ok(r.errors.some((e) => /GitHub/.test(e)));
  assert.ok(r.errors.some((e) => /About is too long/.test(e)));
  assert.ok(r.errors.some((e) => /year/.test(e)));
  assert.ok(r.errors.some((e) => /title/.test(e)));
  const p = normalizeProfile({ publications: [{ title: "T", url: "http://insecure.example/p" }] }, { faculty: true });
  assert.equal(p.ok, false);
  assert.match(p.errors[0], /Paper 1/);
});

test("too many items are refused", () => {
  const r = normalizeProfile({ skills: Array.from({ length: 25 }, (_, i) => `s${i}`).join(",") });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /At most 20 skills/);
});

test("one-item-per-line text round-trips", () => {
  const papers = parseLines("Deep nets | IEEE Access | 2023 | https://doi.org/10.1/x\nOnly a title", "Paper");
  assert.deepEqual(papers[0], { title: "Deep nets", venue: "IEEE Access", year: "2023", url: "https://doi.org/10.1/x" });
  assert.equal(formatLines([{ title: "Deep nets", venue: "IEEE Access", year: 2023, url: "https://doi.org/10.1/x" }, { title: "Only a title" }], "Paper"),
    "Deep nets | IEEE Access | 2023 | https://doi.org/10.1/x\nOnly a title");
  const ach = parseLines("Won SIH 2024 | national finalist | 2024", "Achievement");
  assert.deepEqual(ach[0], { title: "Won SIH 2024", detail: "national finalist", year: "2024", url: "" });
  assert.equal(formatLines([{ title: "Smart bin", detail: "", url: "https://example.org/a" }], "Work"), "Smart bin |  | https://example.org/a");
});

test("initials", () => {
  assert.equal(initials("Asha Rao K"), "AR");
  assert.equal(initials(""), "?");
});
