"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { EyeOff } from "lucide-react";
import { hideConnectProfile, saveConnectProfile } from "../../app/dashboard/connect/people-actions";
import { formatLines } from "../../lib/connect/profile";
import { useAct } from "./Common";

const ITEMS = [
  ["/dashboard/connect", "Teammates", (p) => p === "/dashboard/connect"],
  ["/dashboard/connect/people?type=student", "Students", (p, t) => p.startsWith("/dashboard/connect/people") && t !== "faculty"],
  ["/dashboard/connect/people?type=faculty", "Faculty", (p, t) => p.startsWith("/dashboard/connect/people") && t === "faculty"],
  ["/dashboard/connect/me", "My profile", (p) => p === "/dashboard/connect/me"],
];

function Nav() {
  const path = usePathname();
  const type = useSearchParams().get("type");
  // A profile page shows under the tab of the people list the person came from; with no hint nothing is highlighted.
  return (
    <nav className="filters connect-nav" aria-label="Connect sections">
      {ITEMS.map(([href, label, on]) => <Link key={href} className={"chip" + (on(path, type) ? " on" : "")} href={href} aria-current={on(path, type) ? "page" : undefined}>{label}</Link>)}
    </nav>
  );
}
export const ConnectNav = () => <Suspense fallback={null}><Nav /></Suspense>;

// The visibility switch on the profile page: hide at once.
export function HideNow() {
  const { msg, pending, act } = useAct();
  return <span><button className="btn-s" disabled={pending} onClick={() => act(() => hideConnectProfile())}><EyeOff size={16} /> Hide my profile</button>{msg && <span className="inline-msg" role="alert"> {msg}</span>}</span>;
}

// Editor. `p` is the saved row (or {}), `faculty` decides which sections show. Nothing is prefilled with invented content.
export function ConnectProfileForm({ p, faculty }) {
  const { msg, setMsg, pending, act } = useAct();
  const [saved, setSaved] = useState(null);
  const [v, setV] = useState({
    visible: !!p.visible, showEmail: !!p.show_email,
    headline: p.headline || "", about: p.about || "", skills: (p.skills || []).join(", "), interests: (p.interests || []).join(", "), goals: p.goals || "",
    achievements: formatLines(p.achievements, "Achievement"),
    designation: p.designation || "", researchAreas: (p.research_areas || []).join(", "), publications: formatLines(p.publications, "Paper"),
    work: formatLines(p.work, "Work"), career: p.career || "", openTo: p.open_to || "",
    linkedin: p.linkedin_url || "", github: p.github_url || "", website: p.website_url || "",
  });
  const set = (k, x) => { setV((o) => ({ ...o, [k]: x })); setMsg(""); setSaved(null); };
  const text = (k, label, props = {}, hint) => (
    <div className="field"><label htmlFor={`cp-${k}`}>{label}{hint && <> <small>{hint}</small></>}</label>
      <input id={`cp-${k}`} type="text" value={v[k]} onChange={(e) => set(k, e.target.value)} {...props} /></div>
  );
  const area = (k, label, props = {}, hint) => (
    <div className="field"><label htmlFor={`cp-${k}`}>{label}{hint && <> <small>{hint}</small></>}</label>
      <textarea id={`cp-${k}`} value={v[k]} onChange={(e) => set(k, e.target.value)} style={{ minHeight: 84 }} {...props} /></div>
  );
  return (
    <form className="form connect-form" onSubmit={(e) => { e.preventDefault(); act(() => saveConnectProfile(v), (r) => setSaved(r.visible ? "visible" : "hidden")); }}>
      <fieldset className="acc-group">
        <legend>Who can see this</legend>
        <label className="check"><input type="checkbox" checked={v.visible} onChange={(e) => set("visible", e.target.checked)} /> Show my profile to other signed-in BMSIT students and staff</label>
        <small>Off by default. Only people signed in with a college email can ever see it, and you can switch it off at any time.</small>
        <label className="check"><input type="checkbox" checked={v.showEmail} onChange={(e) => set("showEmail", e.target.checked)} /> Also show my college email address</label>
        <small>No phone numbers are collected. For anything else, people are pointed to your LinkedIn.</small>
      </fieldset>

      {text("headline", "Headline", { maxLength: 120, placeholder: faculty ? "Machine learning and natural language processing" : "Third-year CSE, web and ML" }, "one line under your name")}
      {area("about", "About", { maxLength: 1200 })}
      {!faculty && <>
        {text("skills", "Skills", { placeholder: "react, python, figma" }, "comma separated, up to 20")}
        {text("interests", "Interests", { placeholder: "hackathons, robotics, open source" }, "comma separated")}
        {area("goals", "Goals", { maxLength: 800, placeholder: "What you want to do next: an internship, a research area, a startup…" })}
        {area("achievements", "Achievements", { placeholder: "One per line:  Title | what you did | year", style: { minHeight: 110 } }, "one per line: title | details | year")}
      </>}
      {faculty && <>
        {text("designation", "Designation", { maxLength: 120, placeholder: "Associate Professor" })}
        {text("researchAreas", "Research areas", { placeholder: "machine learning, nlp" }, "comma separated, up to 15")}
        {area("publications", "Research papers", { placeholder: "One per line:  Title | journal or conference | year | https://link", style: { minHeight: 130 } }, "one per line: title | venue | year | link")}
        {area("work", "Related work", { placeholder: "One per line:  Title | what it is | https://link", style: { minHeight: 100 } }, "projects, grants, patents, talks: title | details | link")}
        {area("career", "Career path", { maxLength: 1200, placeholder: "Where your work and career are heading, so students know what you do." })}
        {text("openTo", "Open to", { maxLength: 400, placeholder: "Guiding final-year projects, research internships" })}
        {text("skills", "Skills", { placeholder: "python, matlab" }, "comma separated")}
        {text("interests", "Interests", { placeholder: "comma separated" })}
      </>}

      <fieldset className="acc-group">
        <legend>Links <small>(https only)</small></legend>
        {text("linkedin", "LinkedIn", { placeholder: "https://www.linkedin.com/in/your-name", inputMode: "url", autoComplete: "off" }, "people who want to reach you are sent here")}
        {text("github", "GitHub", { placeholder: "https://github.com/your-name", inputMode: "url", autoComplete: "off" })}
        {text("website", "Website or portfolio", { placeholder: "https://example.com", inputMode: "url", autoComplete: "off" })}
      </fieldset>

      {msg && <p className="form-msg err" role="alert" style={{ whiteSpace: "pre-line" }}>{msg}</p>}
      {saved && !msg && <p className="form-msg ok" role="status">{saved === "visible" ? "Saved. Your profile is visible to other BMSIT users." : "Saved. Your profile is hidden: nobody else can see it."}</p>}
      <div className="notice-actions"><button className="btn" disabled={pending}>Save profile</button></div>
    </form>
  );
}
