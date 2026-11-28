import test from "node:test";
import assert from "node:assert/strict";
import { POSITIONS, cleanTags, formatLines, initials, matchPosition, normalizeProfile, parseLines } from "../../lib/connect/profile.js";

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

test("a faculty profile keeps the faculty essentials only", () => {
  const r = normalizeProfile({
    designation: "Associate Professor", researchAreas: "Machine Learning, NLP", career: "Moving into applied AI.", skills: "python", goals: "x",
    publications: [{ title: "A paper", venue: "IEEE Access", year: "2023", url: "https://doi.org/10.1109/x.1" }, { title: "", venue: "", year: "", url: "" }],
  }, { faculty: true });
  assert.equal(r.ok, true);
  assert.deepEqual(r.row.research_areas, ["machine learning", "nlp"]);
  assert.deepEqual(r.row.publications, [{ title: "A paper", venue: "IEEE Access", year: 2023, url: "https://doi.org/10.1109/x.1" }]);   // empty row skipped
  assert.equal(r.row.career, "Moving into applied AI.");
  assert.deepEqual(r.row.skills, []);
  assert.equal(r.row.goals, null);
});

test("anything that is not essential is not kept, even if sent", () => {
  for (const faculty of [false, true]) {
    const { row } = normalizeProfile({ about: "long story", website: "https://example.org", openTo: "x", work: [{ title: "w" }] }, { faculty });
    assert.deepEqual([row.about, row.website_url, row.open_to, row.work], [null, null, null, []]);
  }
});

test("bad input is refused with a message, not silently dropped", () => {
  const r = normalizeProfile({ linkedin: "https://evil.example/in/x", github: "http://github.com/a", goals: "x".repeat(300), achievements: [{ title: "Won", year: "soon" }, { detail: "no title" }] });
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 5, r.errors.join(" | "));
  for (const re of [/LinkedIn/, /GitHub/, /goal is too long/, /year/, /title/]) assert.ok(r.errors.some((e) => re.test(e)), String(re));
  const p = normalizeProfile({ publications: [{ title: "T", url: "http://insecure.example/p" }] }, { faculty: true });
  assert.equal(p.ok, false);
  assert.match(p.errors[0], /Paper 1/);
});

test("lists are kept short", () => {
  const many = (n) => Array.from({ length: n }, (_, i) => `item${i}`);
  const lines = (n) => many(n).map((title) => ({ title }));
  const s = normalizeProfile({ skills: many(9).join(","), interests: many(6).join(","), achievements: lines(5) });
  assert.equal(s.ok, false);
  for (const re of [/At most 8 skills/, /At most 5 interests/, /At most 4 achievements/]) assert.ok(s.errors.some((e) => re.test(e)), String(re));
  const f = normalizeProfile({ researchAreas: many(7).join(","), publications: lines(6) }, { faculty: true });
  for (const re of [/At most 6 research areas/, /At most 5 papers/]) assert.ok(f.errors.some((e) => re.test(e)), String(re));
  assert.equal(normalizeProfile({ skills: many(8).join(","), achievements: lines(4) }).ok, true);
});

test("one-item-per-line text round-trips", () => {
  const papers = parseLines("Deep nets | IEEE Access | 2023 | https://doi.org/10.1/x\nOnly a title", "Paper");
  assert.deepEqual(papers[0], { title: "Deep nets", venue: "IEEE Access", year: "2023", url: "https://doi.org/10.1/x" });
  assert.equal(formatLines([{ title: "Deep nets", venue: "IEEE Access", year: 2023, url: "https://doi.org/10.1/x" }, { title: "Only a title" }], "Paper"),
    "Deep nets | IEEE Access | 2023 | https://doi.org/10.1/x\nOnly a title");
  const ach = parseLines("Won SIH 2024 | national finalist | 2024", "Achievement");
  assert.deepEqual(ach[0], { title: "Won SIH 2024", detail: "national finalist", year: "2024", url: "" });
});

test("initials", () => {
  assert.equal(initials("Asha Rao K"), "AR");
  assert.equal(initials(""), "?");
});

test("faculty choose a position from the list", () => {
  assert.equal(normalizeProfile({ designation: "Associate Professor" }, { faculty: true }).row.designation, "Associate Professor");
  const typed = normalizeProfile({ designation: "Supreme Wizard" }, { faculty: true });
  assert.equal(typed.ok, false);
  assert.match(typed.errors[0], /from the list/);
});

test("a visible faculty profile needs only a position and LinkedIn", () => {
  const none = normalizeProfile({ visible: true }, { faculty: true });
  assert.equal(none.ok, false);
  assert.equal(none.errors.length, 2, none.errors.join(" | "));
  const ok = normalizeProfile({ visible: true, showEmail: true, designation: "Professor", linkedin: "linkedin.com/in/sample-prof" }, { faculty: true });
  assert.equal(ok.ok, true);
  assert.equal(ok.row.show_email, true);
  assert.equal(normalizeProfile({ visible: false }, { faculty: true }).ok, true);   // a hidden draft can be saved empty
  assert.equal(normalizeProfile({ visible: true }).ok, true);                       // students are unchanged
});

test("written job titles are matched to the list", () => {
  for (const [written, want] of [
    ["Associate Professor, Department of ISE", "Associate Professor"], ["Asst. Prof.", "Assistant Professor"], ["Assoc. Professor", "Associate Professor"],
    ["Professor", "Professor"], ["Professor & Head of the Department", "Professor and Head of Department"], ["HOD, CSE", "Head of Department"],
    ["Associate Professor and HOD", "Head of Department"], ["Dean (Academics)", "Dean"], ["Principal", "Principal"], ["Principal Investigator and Assistant Professor", "Assistant Professor"],
    ["Visiting Professor", "Visiting / Adjunct Faculty"], ["Software Engineer", ""], ["", ""],
  ]) assert.equal(matchPosition(written), want, written);
  for (const p of POSITIONS) assert.equal(matchPosition(p), p);
});
