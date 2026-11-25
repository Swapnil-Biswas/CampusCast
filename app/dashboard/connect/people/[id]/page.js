import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Globe, Pencil } from "lucide-react";
import { requireVerified } from "../../../../../lib/dash/ctx";
import { shortBranch } from "../../../../../lib/dash/meta";
import { initials } from "../../../../../lib/connect/profile";
import { safeHref, safeLinkedIn } from "../../../../../lib/connect/links";
import { isUuid } from "../../../../../lib/connect/ids";
import { ReportBlock } from "../../../../../components/dashboard/Common";
import { HideNow } from "../../../../../components/dashboard/PeopleUI";

export const metadata = { title: "Profile" };

const Section = ({ title, children }) => <section className="person-section"><h2>{title}</h2>{children}</section>;
const Tags = ({ list, type }) => <div className="checks">{list.map((s) => <Link key={s} className="chip" href={`/dashboard/connect/people?type=${type}&skill=${encodeURIComponent(s)}`}>{s}</Link>)}</div>;
const Item = ({ x, venue }) => {
  const href = safeHref(x.url);
  return (
    <li>
      <b>{x.title}</b>{x.year ? <small> · {x.year}</small> : null}
      {venue && x.venue ? <div className="audience">{x.venue}</div> : null}
      {x.detail ? <div className="audience">{x.detail}</div> : null}
      {href && <a className="link-btn" href={href} target="_blank" rel="noopener noreferrer nofollow"><ExternalLink size={13} /> Open link</a>}
    </li>
  );
};

export default async function Person({ params }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await requireVerified();
  const { data, error } = await supabase.rpc("person_profile", { p_id: id });
  if (error) {
    return <div className="empty"><h2>Not set up yet</h2><p>Run <code>supabase/dashboard-9-connect-people.sql</code> in the Supabase SQL Editor, then reload.</p></div>;
  }
  const p = data?.[0];
  if (!p) notFound();      // missing, hidden, blocked and not-allowed all look the same, so nothing leaks

  const faculty = p.person_type === "faculty";
  const li = safeLinkedIn(p.linkedin_url), gh = safeHref(p.github_url), web = safeHref(p.website_url);
  const first = (p.full_name || "this person").split(" ")[0];
  const has = (a) => Array.isArray(a) && a.length > 0;
  const nothing = !p.headline && !p.about && !has(p.skills) && !has(p.interests) && !p.goals && !has(p.achievements) && !has(p.research_areas) && !has(p.publications) && !has(p.work) && !p.career;

  return (
    <>
      <p><Link className="link-btn" href={`/dashboard/connect/people?type=${faculty ? "faculty" : "student"}`}>← All {faculty ? "faculty" : "students"}</Link></p>
      {p.is_me && (
        <div className="form-msg" role="status" style={{ marginBottom: 14 }}>
          {p.visible ? "This is how other BMSIT users see your profile." : "Your profile is hidden: only you can see this page. Switch visibility on in the editor to share it."}
          {" "}<Link className="link-btn" href="/dashboard/connect/me"><Pencil size={13} /> Edit</Link> {p.visible && <HideNow />}
        </div>
      )}
      <header className="person-head">
        <span className="avatar big" aria-hidden="true">{initials(p.full_name)}</span>
        <div>
          <h1 style={{ margin: 0 }}>{p.full_name || "BMSIT member"}</h1>
          <p className="audience" style={{ margin: "2px 0" }}>
            <span className="pill soft" style={{ "--c": faculty ? "#8ec5d6" : "#f3b63f" }}>{faculty ? "Faculty" : "Student"}</span>{" "}
            {faculty ? [p.designation, shortBranch(p.branch)].filter(Boolean).join(" · ") : [shortBranch(p.branch), p.year ? `Year ${p.year}` : null].filter(Boolean).join(" · ")}
          </p>
          {p.headline && <p style={{ margin: "6px 0 0", fontSize: 17 }}>{p.headline}</p>}
        </div>
      </header>

      <div className="notice-actions" style={{ margin: "14px 0" }}>
        {li ? <a className="btn-s clay" href={li} target="_blank" rel="noopener noreferrer nofollow">{p.is_me ? "My LinkedIn" : `Message ${first} on LinkedIn`}</a>
          : <span className="audience">{p.is_me ? "You have not added a LinkedIn link." : `${first} has not added a LinkedIn link.`}</span>}
        {gh && <a className="btn-s" href={gh} target="_blank" rel="noopener noreferrer nofollow">GitHub</a>}
        {web && <a className="btn-s" href={web} target="_blank" rel="noopener noreferrer nofollow"><Globe size={15} /> Website</a>}
        {p.email && <a className="btn-s" href={`mailto:${p.email}`}>{p.email}</a>}
        {!p.is_me && <ReportBlock kind="user" refId={p.id} ownerId={p.id} />}
      </div>
      {li && !p.is_me && <p className="audience">CampusCast has no chat. Connect with {first} on LinkedIn to take the conversation further. The link opens in a new tab.</p>}

      {nothing && <div className="empty"><h2>{p.is_me ? "Your profile is empty" : `${first} has not added anything yet`}</h2><p>{p.is_me ? "Add your skills, goals and achievements in the editor." : "Check back later."}</p></div>}

      {p.about && <Section title="About"><p style={{ whiteSpace: "pre-wrap" }}>{p.about}</p></Section>}
      {faculty ? (<>
        {has(p.research_areas) && <Section title="Research areas"><Tags list={p.research_areas} type="faculty" /></Section>}
        {has(p.publications) && <Section title="Research papers"><ul className="person-list">{p.publications.map((x, i) => <Item key={i} x={x} venue />)}</ul></Section>}
        {has(p.work) && <Section title="Related work"><ul className="person-list">{p.work.map((x, i) => <Item key={i} x={x} />)}</ul></Section>}
        {p.career && <Section title="Career path"><p style={{ whiteSpace: "pre-wrap" }}>{p.career}</p></Section>}
        {p.open_to && <Section title="Open to"><p style={{ whiteSpace: "pre-wrap" }}>{p.open_to}</p></Section>}
        {has(p.skills) && <Section title="Skills"><Tags list={p.skills} type="faculty" /></Section>}
        {has(p.interests) && <Section title="Interests"><Tags list={p.interests} type="faculty" /></Section>}
      </>) : (<>
        {has(p.skills) && <Section title="Skills"><Tags list={p.skills} type="student" /></Section>}
        {has(p.interests) && <Section title="Interests"><Tags list={p.interests} type="student" /></Section>}
        {p.goals && <Section title="Goals"><p style={{ whiteSpace: "pre-wrap" }}>{p.goals}</p></Section>}
        {has(p.achievements) && <Section title="Achievements"><ul className="person-list">{p.achievements.map((x, i) => <Item key={i} x={x} />)}</ul></Section>}
      </>)}
    </>
  );
}
