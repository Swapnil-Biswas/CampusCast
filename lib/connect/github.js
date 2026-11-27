// Reads a person's PUBLIC GitHub profile through the official REST API (no token, nothing private). Without a token
// GitHub allows 60 requests an hour per server, so one reading uses just two. The email field is never read.

export const GITHUB_API = "https://api.github.com";

export class GitHubError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const NAME = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/** "octocat", "@octocat" or "https://github.com/octocat" -> "octocat"; anything else -> null */
export function githubUsername(input) {
  let s = String(input ?? "").trim();
  if (!s) return null;
  const url = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/?#]+)\/?(?:[?#].*)?$/i.exec(s);
  if (url) s = url[1];
  s = s.replace(/^@/, "");
  return NAME.test(s) ? s : null;
}

const one = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max) : "");

async function get(path, fetchImpl, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(`${GITHUB_API}${path}`, { headers: { accept: "application/vnd.github+json", "user-agent": "CampusCast", "x-github-api-version": "2022-11-28" }, signal: ctl.signal });
  } catch {
    throw new GitHubError("network", "Could not reach GitHub. Try again in a moment.");
  } finally { clearTimeout(timer); }
  if (res.status === 404) throw new GitHubError("not_found", "GitHub has no user with that name. Check the spelling.");
  if (res.status === 403 || res.status === 429) {
    const reset = Number(res.headers?.get?.("x-ratelimit-reset"));
    const wait = reset ? Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60000)) : null;
    throw new GitHubError("rate_limit", `GitHub's hourly limit is used up. Try again ${wait ? `in about ${wait} minute${wait > 1 ? "s" : ""}` : "later"}.`);
  }
  if (!res.ok) throw new GitHubError("service", `GitHub returned an error (${res.status}).`);
  try { return await res.json(); } catch { throw new GitHubError("service", "GitHub sent an unreadable answer."); }
}

/** @returns { username, url, name, bio, company, website, languages: [..], repos: [{ name, description, language, topics, stars, url }] } */
export async function fetchGitHub(input, { fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
  const username = githubUsername(input);
  if (!username) throw new GitHubError("bad_name", "That is not a GitHub username or profile link.");
  const user = await get(`/users/${username}`, fetchImpl, timeoutMs);
  if (user?.type && user.type !== "User") throw new GitHubError("not_person", "That GitHub account is an organisation, not a person.");
  const list = await get(`/users/${username}/repos?per_page=100&sort=pushed&type=owner`, fetchImpl, timeoutMs);
  const own = (Array.isArray(list) ? list : []).filter((r) => r && !r.fork && !r.private);
  const counts = new Map();
  for (const r of own) { const l = one(r.language, 40); if (l) counts.set(l, (counts.get(l) || 0) + 1); }
  const repos = [...own]
    .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
    .slice(0, 12)
    .map((r) => ({
      name: one(r.name, 100), description: one(r.description, 300), language: one(r.language, 40),
      topics: (Array.isArray(r.topics) ? r.topics : []).map((t) => one(t, 40)).filter(Boolean).slice(0, 8),
      stars: Number(r.stargazers_count) || 0, url: `https://github.com/${username}/${encodeURIComponent(r.name)}`,
    }));
  return {
    username, url: `https://github.com/${username}`, name: one(user?.name, 100), bio: one(user?.bio, 300), company: one(user?.company, 100),
    website: one(user?.blog, 300),
    languages: [...counts].sort((a, b) => b[1] - a[1]).map(([l]) => l).slice(0, 8),
    repos,
  };
}

export function githubText(g) {
  const lines = [`GitHub public profile of ${g.username} (${g.url})`];
  if (g.name) lines.push(`Name: ${g.name}`);
  if (g.bio) lines.push(`Bio: ${g.bio}`);
  if (g.company) lines.push(`Company: ${g.company}`);
  if (g.website) lines.push(`Website: ${g.website}`);
  if (g.languages.length) lines.push(`Languages used in own repositories: ${g.languages.join(", ")}`);
  for (const r of g.repos) {
    lines.push(`Repository ${r.name} (${r.url})${r.language ? ` [${r.language}]` : ""}${r.stars ? `, ${r.stars} stars` : ""}: ${r.description || "no description"}${r.topics.length ? `. Topics: ${r.topics.join(", ")}` : ""}`);
  }
  return lines.join("\n");
}
