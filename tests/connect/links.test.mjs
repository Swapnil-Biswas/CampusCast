import test from "node:test";
import assert from "node:assert/strict";
import { cleanGitHub, cleanHttpsUrl, cleanLinkedIn, safeHref } from "../../lib/connect/links.js";

const li = (v) => cleanLinkedIn(v);

test("LinkedIn: normal profile links are accepted and tidied", () => {
  assert.deepEqual(li("https://www.linkedin.com/in/lalit-kumar"), { ok: true, value: "https://www.linkedin.com/in/lalit-kumar" });
  assert.equal(li("linkedin.com/in/lalit-kumar").value, "https://www.linkedin.com/in/lalit-kumar");          // no scheme typed
  assert.equal(li("https://in.linkedin.com/in/lalit-kumar/").value, "https://www.linkedin.com/in/lalit-kumar");   // country site, trailing slash
  assert.equal(li("https://www.linkedin.com/in/lalit-kumar?utm_source=share&trk=x#top").value, "https://www.linkedin.com/in/lalit-kumar");
  assert.equal(li("  HTTPS://WWW.LINKEDIN.COM/in/Lalit-Kumar-123  ").value, "https://www.linkedin.com/in/Lalit-Kumar-123");
});

test("LinkedIn: empty is allowed and means no link", () => {
  assert.deepEqual(li(""), { ok: true, value: null });
  assert.deepEqual(li("   "), { ok: true, value: null });
  assert.deepEqual(li(undefined), { ok: true, value: null });
});

test("LinkedIn: anything that is not a plain https profile link is refused", () => {
  for (const bad of [
    "http://www.linkedin.com/in/lalit-kumar",               // not https
    "javascript:alert(1)", "data:text/html,<b>x</b>", "ftp://linkedin.com/in/lalit",
    "https://linkedin.com.evil.example/in/lalit-kumar",     // look-alike host
    "https://evil.example/linkedin.com/in/lalit-kumar",
    "https://notlinkedin.com/in/lalit-kumar",
    "https://www.linkedin.com@evil.example/in/lalit-kumar", // credentials trick
    "https://user:pw@www.linkedin.com/in/lalit-kumar",
    "https://www.linkedin.com:8443/in/lalit-kumar",         // port
    "https://www.linkedin.com/company/bmsit",               // not a person
    "https://www.linkedin.com/in/",                         // no handle
    "https://www.linkedin.com/in/ab",                       // too short
    "https://www.linkedin.com/in/lalit/../../x",
    "https://www.linkedin.com/in/lalit kumar",              // space
    "https://www.linkedin.com/in/lalit<script>",
    "https://www.linkedin.com/in/" + "a".repeat(120),
    "https://www.linkedin.com/feed/",
    "not a link at all",
  ]) assert.equal(li(bad).ok, false, bad);
});

test("GitHub links", () => {
  assert.equal(cleanGitHub("github.com/lalit71718-bit").value, "https://github.com/lalit71718-bit");
  assert.equal(cleanGitHub("https://github.com/someone/").value, "https://github.com/someone");
  assert.equal(cleanGitHub("").value, null);
  for (const bad of ["https://github.com/a/b", "http://github.com/a", "https://gist.github.com/a", "https://github.com.evil.example/a", "https://github.com/-x-"]) {
    assert.equal(cleanGitHub(bad).ok, false, bad);
  }
});

test("other links: https only, real host, nothing local", () => {
  assert.equal(cleanHttpsUrl("https://example.org/paper?id=1").value, "https://example.org/paper?id=1");
  assert.equal(cleanHttpsUrl("doi.org/10.1000/xyz123").value, "https://doi.org/10.1000/xyz123");
  assert.equal(cleanHttpsUrl("").value, null);
  for (const bad of ["http://example.org", "javascript:alert(1)", "https://localhost/x", "https://127.0.0.1/x", "https://10.0.0.5/x", "https://[::1]/x", "https://intranet/x", "https://a:b@example.org/", "https://example.org:8080/", "https://exa mple.org", "//", "https://printer.local/x"]) {
    assert.equal(cleanHttpsUrl(bad).ok, false, bad);
  }
  assert.equal(cleanHttpsUrl("https://example.org/" + "a".repeat(400)).ok, false);
});

test("safeHref only passes links that are safe to put in an href", () => {
  assert.equal(safeHref("https://example.org/a"), "https://example.org/a");
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref(null), null);
});
