import test from "node:test";
import assert from "node:assert/strict";
import { hasPrivate, redact } from "../../lib/connect/redact.js";
import { fetchGitHub, githubText, githubUsername } from "../../lib/connect/github.js";
import { applyDraft, buildDraft, mergeList } from "../../lib/connect/draft.js";
import { readProfileSources } from "../../lib/connect/read.js";
import { normalizeProfile, parseLines } from "../../lib/connect/profile.js";
import { isOwnFile } from "../../lib/connect/files.js";
import { ExtractionError, buildRequest } from "../../lib/exams/provider.js";
import { buildGeminiRequest } from "../../lib/exams/gemini.js";
import { extractWithGroq } from "../../lib/exams/groq.js";
import { profileTask } from "../../lib/connect/task.js";
import { pdfBytes } from "../exams/fixtures.mjs";

const f = (value, source = "explicit", confidence = 0.95) => ({ value, source, confidence, pages: [], evidence: "" });

// ---------- private details ----------
test("phones, emails, USN, birth date and addresses are removed", () => {
  const text = [
    "Asha Rao", "Phone: +91 98765 43210 | asha.rao@gmail.com", "Mobile 9876543210", "(080) 2345-6789",
    "USN: 1BY25CS001", "Roll 25UG1BYCS001", "Date of Birth: 4 May 2006", "Address: 12, 3rd Cross, Yelahanka",
    "#44 MG Road, Bengaluru 560064", "Father's name: K Rao", "Skills: Python",
  ].join("\n");
  const out = redact(text);
  for (const secret of ["98765", "9876543210", "2345-6789", "gmail", "1BY25CS001", "25UG1BYCS001", "May 2006", "Yelahanka", "560064", "K Rao"]) assert.ok(!out.includes(secret), secret);
  assert.match(out, /Asha Rao/);
  assert.match(out, /Skills: Python/);
});

test("ordinary resume content is not mistaken for private details", () => {
  for (const ok of [
    "B.E. Computer Science, 2023 - 2027, CGPA 9.1", "Published in IEEE Access, 2023, vol. 11, pp. 12345-12360",
    "https://doi.org/10.1109/ACCESS.2023.1234567", "DOI: 10.1109/5.771073", "Handled 1,00,000 records", "Won 2nd prize among 1200 teams in 2024",
  ]) { assert.equal(redact(ok), ok, ok); assert.equal(hasPrivate(ok), false, ok); }
});

// ---------- GitHub ----------
test("GitHub usernames", () => {
  for (const [i, o] of [["octocat", "octocat"], ["@octocat", "octocat"], ["https://github.com/octocat", "octocat"], ["github.com/octo-cat/", "octo-cat"], ["https://www.github.com/octocat?tab=repositories", "octocat"]]) assert.equal(githubUsername(i), o, i);
  for (const bad of ["", "a b", "-x", "x-", "https://gitlab.com/x", "https://github.com/a/b", "../etc", "a".repeat(40), "x?y"]) assert.equal(githubUsername(bad), null, bad);
});

const ghFetch = (calls = []) => async (url, opts) => {
  calls.push({ url, opts });
  const json = url.includes("/repos") ? [
    { name: "smart-bin", description: "IoT bin", language: "Python", topics: ["iot"], stargazers_count: 5, fork: false },
    { name: "site", description: null, language: "JavaScript", stargazers_count: 1, fork: false },
    { name: "copied", language: "Rust", fork: true },
    { name: "ml", language: "Python", fork: false },
  ] : { type: "User", name: "Asha Rao", bio: "Student. Call 9876543210", email: "secret@gmail.com", blog: "asha.example.org" };
  return { ok: true, status: 200, json: async () => json, headers: new Map() };
};

test("GitHub: only the public API, no token, forks ignored, email never read", async () => {
  const calls = [];
  const g = await fetchGitHub("octocat", { fetchImpl: ghFetch(calls) });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.url.startsWith("https://api.github.com/users/octocat") && !c.opts.headers.authorization));
  assert.deepEqual(g.languages, ["Python", "JavaScript"]);
  assert.ok(!g.repos.some((r) => r.name === "copied"));
  assert.ok(!githubText(g).includes("secret@gmail.com"));
});

test("GitHub: missing user and rate limit give a clear message", async () => {
  const res = (status, headers = {}) => async () => ({ ok: false, status, headers: new Map(Object.entries(headers)), json: async () => ({}) });
  await assert.rejects(fetchGitHub("nobody", { fetchImpl: res(404) }), (e) => e.code === "not_found");
  await assert.rejects(fetchGitHub("x", { fetchImpl: res(403, { "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 600) }) }), (e) => e.code === "rate_limit" && /10 minutes/.test(e.message));
  await assert.rejects(fetchGitHub("x", { fetchImpl: async () => { throw new Error("down"); } }), (e) => e.code === "network");
  await assert.rejects(fetchGitHub("x y", {}), (e) => e.code === "bad_name");
});

// ---------- the answer checker ----------
const SOURCE = `Dr. Meera Iyer\nAssociate Professor\nResearch: machine learning\nPublications\nDeep Learning for Crop Dis-\nease Detection, IEEE Access, 2023. https://doi.org/10.1109/access.2023.1\nlinkedin.com/in/meera-iyer`;
const answer = {
  profile: {
    headline: f("Associate Professor working on machine learning", "inferred"), about: f(null, "missing"), skills: f(["Python", "python", "TensorFlow"]),
    interests: f([]), goals: f(null, "missing"), achievements: f([{ title: "ignored for faculty" }]), designation: f("Associate Professor"),
    researchAreas: f(["Machine Learning"]),
    publications: f([
      { title: "Deep Learning for Crop Disease Detection", venue: "IEEE Access", year: 2023, url: "https://doi.org/10.1109/access.2023.1" },
      { title: "A Completely Invented Paper About Quantum Things", venue: "Nature", year: 2022 },
    ]),
    work: f([]), career: f(null, "missing"), openTo: f(null, "missing"),
    linkedinUrl: f("https://www.linkedin.com/in/meera-iyer"), githubUrl: f("https://github.com/made-up"), websiteUrl: f("javascript:alert(1)"),
  },
};

test("faculty draft: real papers kept, invented ones dropped, invented links refused", () => {
  const d = buildDraft(answer, { faculty: true, sourceText: SOURCE, verifiable: true });
  assert.equal(d.fields.publications.value, "Deep Learning for Crop Disease Detection | IEEE Access | 2023 | https://doi.org/10.1109/access.2023.1");
  assert.ok(d.notes.some((n) => /1 paper was left out/.test(n)));
  assert.equal(d.fields.headline.flag, "check");
  assert.equal(d.fields.designation.flag, "read");
  assert.equal(d.fields.skills.value, "python, tensorflow");
  assert.equal(d.fields.linkedin.value, "https://www.linkedin.com/in/meera-iyer");
  assert.equal(d.fields.github, undefined);
  assert.equal(d.fields.website, undefined);
  for (const empty of ["about", "goals", "interests", "work", "career", "achievements"]) assert.equal(d.fields[empty], undefined, empty);
});

test("a cut-off link is not accepted just because it begins like a real one", () => {
  const raw = { profile: { publications: f([{ title: "Deep Learning for Crop Disease Detection", url: "https://doi.org/10.1109/access.2023" }]), linkedinUrl: f("https://www.linkedin.com/in/meera") } };
  const d = buildDraft(raw, { faculty: true, sourceText: SOURCE, verifiable: true });
  assert.equal(d.fields.publications.value, "Deep Learning for Crop Disease Detection");
  assert.equal(d.fields.linkedin, undefined);
});

test("a student never gets faculty fields", () => {
  const d = buildDraft(answer, { faculty: false, sourceText: SOURCE, verifiable: true });
  for (const k of ["designation", "researchAreas", "publications", "work", "career", "openTo"]) assert.equal(d.fields[k], undefined, k);
});

test("one broken field does not empty the form, and private details are stripped from the answer", () => {
  const d = buildDraft({ profile: { headline: f(12345), about: f("Reach me on 9876543210 or a@b.com. I build web apps."), skills: f("not a list"), achievements: f([null, 7, { title: "Won | Smart India Hackathon", detail: "USN: 1BY25CS001", year: 3000, url: "http://x.example" }]) } }, {});
  assert.equal(d.fields.headline, undefined);
  assert.ok(!/9876|@/.test(d.fields.about.value));
  assert.match(d.fields.about.value, /web apps/);
  assert.equal(d.fields.skills, undefined);
  assert.equal(d.fields.achievements.value, "Won / Smart India Hackathon");
  assert.ok(d.notes.some((n) => /Private details/.test(n)));
});

test("a draft passes the editor's own validation when saved", () => {
  const d = buildDraft(answer, { faculty: true, sourceText: SOURCE, verifiable: true });
  const v = Object.fromEntries(Object.entries(d.fields).map(([k, x]) => [k, x.value]));
  const r = normalizeProfile({ ...v, publications: parseLines(v.publications, "Paper") }, { faculty: true });
  assert.equal(r.ok, true, r.errors?.join(" "));
  assert.equal(r.row.visible, false);          // reading never makes anyone visible
});

test("garbage answers give an empty draft, not a crash", () => {
  for (const g of [null, {}, { profile: null }, { profile: [] }, { profile: { skills: null, publications: "x" } }, "text"]) assert.deepEqual(buildDraft(g, { faculty: true }).fields, {});
});

// ---------- filling the form ----------
test("empty fields are filled; the person's own words are only given suggestions", () => {
  const current = { headline: "My own headline", about: "", skills: "react, python", goals: "Same goal", visible: false };
  const r = applyDraft(current, { fields: { headline: { value: "AI headline", flag: "check" }, about: { value: "AI about", flag: "read" }, skills: { value: "python", flag: "read" }, goals: { value: "same goal.", flag: "read" }, visible: { value: "true" }, unknown: { value: "x" } } });
  assert.equal(r.values.headline, "My own headline");
  assert.equal(r.values.about, "AI about");
  assert.deepEqual(r.filled, { about: "read" });
  assert.deepEqual(Object.keys(r.suggestions), ["headline"]);      // skills add nothing new, goals is the same text
  assert.equal(r.values.skills, "react, python");
});

test("adding the new items keeps mine and skips duplicates", () => {
  assert.equal(mergeList("skills", "react, python", "Python, sql"), "react, python, sql");
  assert.equal(mergeList("achievements", "Won SIH | my words | 2024", "Won SIH | ai words\nNew award"), "Won SIH | my words | 2024\nNew award");
});

// ---------- one reading, start to finish ----------
const providers = [{ provider: "gemini", apiKey: "k" }];
const longText = "Asha Rao\nSkills: Python\nPhone: 9876543210\n" + "Built a smart bin project. ".repeat(12);

test("text sources are cleaned and sent as one text document", async () => {
  let sent;
  const r = await readProfileSources({
    files: [{ label: "Resume", name: "resume.pdf", bytes: pdfBytes() }], linkedinText: "Mail me: a@b.com. Interested in robotics.", github: "octocat",
    providers, readPages: async () => [longText], fetchImpl: ghFetch(),
    extract: async (a) => { sent = a; return { input: { profile: { skills: f(["Python"]) } }, provider: "gemini" }; },
  });
  assert.equal(r.ok, true, r.error);
  assert.equal(sent.mime, "text/plain");
  const body = sent.pdf.toString("utf8");
  assert.ok(!/9876543210|a@b\.com|secret@/.test(body));
  assert.match(body, /=== Resume ===[\s\S]*=== LinkedIn text[\s\S]*=== GitHub ===/);
  assert.equal(r.draft.fields.skills.value, "python, javascript");
  assert.equal(r.draft.fields.github.value, "https://github.com/octocat");
});

test("a photo resume is attached, with the other sources alongside", async () => {
  let sent;
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100), Buffer.from([0xff, 0xd9])]);
  const r = await readProfileSources({ files: [{ label: "Resume", name: "r.jpg", bytes: jpg }], linkedinText: "Likes robotics", providers, extract: async (a) => { sent = a; return { input: { profile: { headline: f("Student") } } }; } });
  assert.equal(r.ok, true);
  assert.equal(sent.mime, "image/jpeg");
  assert.match(sent.task.listHeading, /Likes robotics/);
  assert.equal(r.draft.fields.headline.flag, "read");
});

test("when the AI fails, the reason is shown and GitHub facts are still filled", async () => {
  const r = await readProfileSources({ github: "octocat", providers, fetchImpl: ghFetch(), extract: async () => { throw new ExtractionError("busy", "The AI service is busy."); } });
  assert.equal(r.ok, false);
  assert.match(r.error, /busy/);
  assert.equal(r.draft.fields.github.value, "https://github.com/octocat");
  assert.equal(r.draft.fields.skills.value, "python, javascript");
});

test("bad inputs say why and never call the AI", async () => {
  let calls = 0;
  const extract = async () => { calls++; return { input: {} }; };
  const none = await readProfileSources({ providers, extract });
  assert.match(none.error, /Add a resume/);
  const bad = await readProfileSources({ files: [{ label: "Resume", name: "x.pdf", bytes: Buffer.from("hello") }], providers, extract });
  assert.equal(bad.ok, false);
  assert.ok(bad.warnings[0].startsWith("Resume:"));
  assert.equal(calls, 0);
});

// ---------- the shared AI code with this task ----------
test("the profile task and plain text reach each kind of provider", async () => {
  const task = profileTask({ faculty: false });
  const b64 = Buffer.from("hello resume").toString("base64");
  const claude = buildRequest({ pdfBase64: b64, mime: "text/plain", task });
  assert.equal(claude.messages[0].content[0].type, "text");
  assert.match(claude.messages[0].content[0].text, /untrusted data[\s\S]*hello resume/);
  assert.equal(claude.tools[0].name, "record_profile");
  assert.equal(buildGeminiRequest({ pdfBase64: b64, mime: "text/plain", task }).contents[0].parts[0].inlineData.mimeType, "text/plain");
  let body;
  await extractWithGroq({ pdf: Buffer.from("short text"), mime: "text/plain", task, apiKey: "k", readPages: async () => { throw new Error("must not be used"); }, fetchImpl: async (u, o) => { body = JSON.parse(o.body); return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "{\"profile\":{}}" } }] }) }; } });
  assert.match(body.messages[1].content, /short text/);
});

test("only your own uploaded files are accepted", () => {
  const me = "11111111-1111-1111-1111-111111111111", id = "22222222-2222-2222-2222-222222222222";
  assert.equal(isOwnFile(`${me}/resume-${id}.pdf`, me), true);
  for (const bad of [`${id}/resume-${id}.pdf`, `${me}/../${id}/resume-${id}.pdf`, `${me}/other-${id}.pdf`, `${me}/resume-${id}.exe`, `${me}/x/resume-${id}.pdf`, null]) assert.equal(isOwnFile(bad, me), false, String(bad));
});
