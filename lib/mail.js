// Plain, readable email bodies. Everything inserted into HTML is escaped.
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const TAG = ["NOW", "TODAY", "SOON", "FYI"];
const COLOR = ["#e8603c", "#f3b63f", "#8ec5d6", "#7fb48a"];

function shell(inner, foot) {
  return `<!doctype html><html><body style="margin:0;background:#f6efe2;font-family:Arial,Helvetica,sans-serif;color:#1b1a17">
<div style="max-width:520px;margin:0 auto;padding:24px 16px">
<p style="font-weight:700;font-size:15px;margin:0 0 14px">CampusCast</p>
<div style="background:#fffdf8;border:1.5px solid #1b1a17;border-radius:14px;padding:20px">${inner}</div>
<p style="font-size:12px;color:#6b6558;margin:14px 4px 0">${foot}</p></div></body></html>`;
}
const foot = (site) => `You get this because you are a verified CampusCast student. Change what you receive in <a href="${esc(site)}/dashboard/notifications" style="color:#6b6558">notification settings</a>.`;

export function noticeEmail(j, link) {
  const site = new URL(link).origin;
  const tag = j.kind === "reminder" ? "REMINDER" : TAG[j.urgency] || "NOTICE";
  const color = j.kind === "reminder" ? "#f3b63f" : COLOR[j.urgency] || "#d9c8a8";
  const html = shell(
    `<span style="display:inline-block;background:${color};color:#1b1a17;font-size:11px;font-weight:700;letter-spacing:.06em;border-radius:99px;padding:3px 10px">${tag}</span>
<h1 style="font-size:20px;line-height:1.3;margin:12px 0 8px">${esc(j.subject)}</h1>
${j.body ? `<p style="font-size:15px;line-height:1.5;margin:0 0 16px">${esc(j.body)}</p>` : ""}
<a href="${esc(link)}" style="display:inline-block;background:#e8603c;color:#fff;text-decoration:none;font-weight:700;border-radius:10px;padding:10px 16px">Open in CampusCast</a>`, foot(site));
  return { html, text: `${tag}: ${j.subject}\n${j.body ? j.body + "\n" : ""}\nOpen: ${link}\n\nChange what you receive: ${site}/dashboard/notifications\n` };
}

export function digestEmail(j, site) {
  const lines = String(j.body || "").split("\n").map((l) => l.replace(/^- /, "")).filter(Boolean);
  const html = shell(
    `<h1 style="font-size:20px;margin:0 0 10px">${esc(j.subject)}</h1>
<p style="margin:0 0 10px;font-size:14px;color:#6b6558">Things from the last 24 hours that were not urgent.</p>
<ul style="padding-left:18px;margin:0 0 16px;font-size:15px;line-height:1.6">${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
<a href="${esc(site)}/dashboard" style="display:inline-block;background:#e8603c;color:#fff;text-decoration:none;font-weight:700;border-radius:10px;padding:10px 16px">Open your feed</a>`, foot(site));
  return { html, text: `${j.subject}\n\n${lines.map((l) => "- " + l).join("\n")}\n\nOpen your feed: ${site}/dashboard\nChange what you receive: ${site}/dashboard/notifications\n` };
}
