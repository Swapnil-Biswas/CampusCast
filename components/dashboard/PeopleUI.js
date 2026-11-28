"use client";
import { Suspense, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { EyeOff } from "lucide-react";
import { hideConnectProfile, saveConnectProfile } from "../../app/dashboard/connect/people-actions";
import { LIMITS, MAX, POSITIONS, formatLines, matchPosition } from "../../lib/connect/profile";
import { applyDraft, isList, mergeList } from "../../lib/connect/draft";
import ProfileAutofill from "./ProfileAutofill";
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

const without = (o, k) => { if (!(k in o)) return o; const n = { ...o }; delete n[k]; return n; };

// The visibility switch on the profile page: hide at once.
export function HideNow() {
  const { msg, pending, act } = useAct();
  return <span><button className="btn-s" disabled={pending} onClick={() => act(() => hideConnectProfile())}><EyeOff size={16} /> Hide my profile</button>{msg && <span className="inline-msg" role="alert"> {msg}</span>}</span>;
}

// Editor. `p` is the saved row (or {}), `faculty` decides which sections show. Nothing is prefilled with invented content.
export function ConnectProfileForm({ p, faculty, email, isNew, autofill }) {
  const { msg, setMsg, pending, act } = useAct();
  const [saved, setSaved] = useState(null);
  const [v, setV] = useState({
    // Faculty are reached by college email and LinkedIn, so a new faculty profile has the email ticked (still hidden until shown).
    visible: !!p.visible, showEmail: isNew && faculty ? true : !!p.show_email,
    headline: p.headline || "", skills: (p.skills || []).join(", "), interests: (p.interests || []).join(", "), goals: p.goals || "",
    achievements: formatLines(p.achievements, "Achievement"),
    designation: matchPosition(p.designation), researchAreas: (p.research_areas || []).join(", "), publications: formatLines(p.publications, "Paper"),
    career: p.career || "", linkedin: p.linkedin_url || "", github: p.github_url || "",
  });
  const set = (k, x) => { setV((o) => ({ ...o, [k]: x })); setMsg(""); setSaved(null); setFilled((o) => without(o, k)); };

  // Automatic filling: empty fields are filled and marked "Check"; fields with your own words only get a suggestion.
  const [filled, setFilled] = useState({});
  const [suggested, setSuggested] = useState({});
  const [more, setMore] = useState(false);          // faculty: the optional research details start closed
  const latest = useRef(v);
  latest.current = v;
  const onDraft = (draft) => {
    const r = applyDraft(latest.current, draft);
    latest.current = r.values;
    setV(r.values); setFilled((o) => ({ ...o, ...r.filled })); setSuggested(r.suggestions); setMsg(""); setSaved(null);
    if ([...Object.keys(r.filled), ...Object.keys(r.suggestions)].some((k) => k !== "designation" && k !== "linkedin")) setMore(true);
    return { filled: Object.keys(r.filled), suggested: Object.keys(r.suggestions) };
  };
  const take = (k, value, flag) => { setV((o) => ({ ...o, [k]: value })); setFilled((o) => ({ ...o, [k]: flag })); setSuggested((o) => without(o, k)); setSaved(null); };
  const badge = (k) => filled[k] && <span className="check-badge">{filled[k] === "read" ? "Check · from your documents" : "Check · worked out by AI"}</span>;
  const suggestion = (k) => suggested[k] && (
    <div className="suggestion">
      <b>Suggestion from your documents:</b>
      <p>{suggested[k].value}</p>
      <div className="notice-actions">
        {isList(k) && <button type="button" className="btn-s" onClick={() => take(k, mergeList(k, v[k], suggested[k].value), suggested[k].flag)}>Add the new ones</button>}
        <button type="button" className="btn-s" onClick={() => take(k, suggested[k].value, suggested[k].flag)}>Replace mine</button>
        <button type="button" className="btn-s ghost" onClick={() => setSuggested((o) => without(o, k))}>Keep mine</button>
      </div>
    </div>
  );
  const text = (k, label, props = {}, hint) => (
    <div className="field"><label htmlFor={`cp-${k}`}>{label}{hint && <> <small>{hint}</small></>} {badge(k)}</label>
      <input id={`cp-${k}`} type="text" value={v[k]} onChange={(e) => set(k, e.target.value)} {...props} />{suggestion(k)}</div>
  );
  const area = (k, label, props = {}, hint) => (
    <div className="field"><label htmlFor={`cp-${k}`}>{label}{hint && <> <small>{hint}</small></>} {badge(k)}</label>
      <textarea id={`cp-${k}`} value={v[k]} onChange={(e) => set(k, e.target.value)} style={{ minHeight: 84 }} {...props} />{suggestion(k)}</div>
  );
  const toCheck = Object.keys(filled).length;
  const panel = autofill && <ProfileAutofill {...autofill} defaultGithub={v.github} onDraft={onDraft} />;
  const visibility = (
    <fieldset className="acc-group">
      <legend>Who can see this</legend>
      <label className="check"><input type="checkbox" checked={v.visible} onChange={(e) => set("visible", e.target.checked)} /> Show my profile to other signed-in BMSIT students and staff</label>
      <small>Off by default. Only people signed in with a college email can ever see it, and you can switch it off at any time.</small>
      {!faculty && <>
        <label className="check"><input type="checkbox" checked={v.showEmail} onChange={(e) => set("showEmail", e.target.checked)} /> Also show my college email address</label>
        <small>No phone numbers are collected. For anything else, people are pointed to your LinkedIn.</small>
      </>}
    </fieldset>
  );
  const headline = text("headline", "Headline", { maxLength: LIMITS.headline, placeholder: faculty ? "Machine learning and natural language processing" : "Third-year CSE, web and ML" }, "one line under your name");
  const linkedin = text("linkedin", "LinkedIn", { placeholder: "https://www.linkedin.com/in/your-name", inputMode: "url", autoComplete: "off" }, "people who want to reach you are sent here");
  const github = text("github", "GitHub", { placeholder: "https://github.com/your-name", inputMode: "url", autoComplete: "off" });
  const foot = (
    <>
      {msg && <p className="form-msg err" role="alert" style={{ whiteSpace: "pre-line" }}>{msg}</p>}
      {saved && !msg && <p className="form-msg ok" role="status">{saved === "visible" ? "Saved. Your profile is visible to other BMSIT users." : "Saved. Your profile is hidden: nobody else can see it."}</p>}
      <div className="notice-actions"><button className="btn" disabled={pending}>{toCheck ? "Confirm and save" : "Save profile"}</button>{toCheck > 0 && <span className="audience">{toCheck} filled field{toCheck > 1 ? "s" : ""} to check</span>}</div>
    </>
  );
  const submit = (e) => { e.preventDefault(); act(() => saveConnectProfile(v), (r) => { setSaved(r.visible ? "visible" : "hidden"); setFilled({}); setSuggested({}); }); };

  // Faculty: only the position, college email and LinkedIn. Everything about research is optional and tucked away.
  if (faculty) {
    return (
      <>
        <form className="form connect-form" onSubmit={submit}>
          <div className="field"><label htmlFor="cp-designation">Position {badge("designation")}</label>
            <select id="cp-designation" value={v.designation} onChange={(e) => set("designation", e.target.value)}>
              <option value="">Select your position</option>
              {POSITIONS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>{suggestion("designation")}</div>
          <div className="field"><label htmlFor="cp-email">College email <small>from your account</small></label>
            <input id="cp-email" type="text" value={email || ""} readOnly />
            <label className="check"><input type="checkbox" checked={v.showEmail} onChange={(e) => set("showEmail", e.target.checked)} /> Show it on my profile</label></div>
          {linkedin}
          {visibility}
          <details className="more" open={more} onToggle={(e) => setMore(e.currentTarget.open)}>
            <summary>Add research details (optional)</summary>
            {headline}
            {text("researchAreas", "Research areas", { placeholder: "machine learning, nlp" }, `comma separated, up to ${MAX.areas}`)}
            {area("publications", "Main papers", { placeholder: "One per line:  Title | journal or conference | year | https://link", style: { minHeight: 120 } }, `up to ${MAX.publications}, one per line: title | venue | year | link`)}
            {area("career", "Where your work is heading", { maxLength: LIMITS.career, placeholder: "One or two sentences, so students know what you do.", style: { minHeight: 70 } })}
            {github}
          </details>
          {foot}
        </form>
        {panel && <details className="more connect-form"><summary>Fill the research details from my resume (optional)</summary>{panel}</details>}
      </>
    );
  }

  return (
    <>
      {panel}
      <form className="form connect-form" onSubmit={submit}>
        {visibility}
        <p className="audience">Keep it short: only the essentials appear on your profile.</p>
        {headline}
        {text("skills", "Top skills", { placeholder: "react, python, figma" }, `comma separated, up to ${MAX.skills}`)}
        {text("interests", "Interests", { placeholder: "hackathons, robotics, open source" }, `comma separated, up to ${MAX.interests}`)}
        {area("goals", "Goal", { maxLength: LIMITS.goals, placeholder: "What you want to do next", style: { minHeight: 60 } }, "one or two sentences")}
        {area("achievements", "Key achievements", { placeholder: "One per line:  Title | what you did | year", style: { minHeight: 110 } }, `up to ${MAX.achievements}, one per line: title | details | year`)}
        <fieldset className="acc-group">
          <legend>Links <small>(https only)</small></legend>
          {linkedin}
          {github}
        </fieldset>
        {foot}
      </form>
    </>
  );
}
