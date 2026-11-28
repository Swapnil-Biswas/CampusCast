import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Pencil } from "lucide-react";
import { requireVerified } from "../../../../../lib/dash/ctx";
import { shortBranch } from "../../../../../lib/dash/meta";
import { MAX, initials } from "../../../../../lib/connect/profile";
import { safeHref, safeLinkedIn } from "../../../../../lib/connect/links";
import { isUuid } from "../../../../../lib/connect/ids";
import { ReportBlock } from "../../../../../components/dashboard/Common";
import { HideNow } from "../../../../../components/dashboard/PeopleUI";

export const metadata = { title: "Profile" };

const Section = ({ title, children }) => <section className="person-section"><h2>{title}</h2>{children}</section>;
const Tags = ({ list, type }) => <div className="checks">{list.map((s) => <Link key={s} className="chip" href={`/dashboard/connect/people?type=${type}&skill=${encodeURIComponent(s)}`}>{s}</Link>)}</div>;
const Item = ({ x, venue }) => {
  const href = safeHref(x.url);
  const sub = venue ? x.venue : x.detail;
  return (
    <li>
      {href ? <a href={href} target="_blank" rel="noopener noreferrer nofollow"><b>{x.title}</b> <ExternalLink size={13} aria-label="opens in a new tab" /></a> : <b>{x.title}</b>}
      {x.year ? <small> · {x.year}</small> : null}
      {sub ? <div className="audience">{sub}</div> : null}
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
  const li = safeLinkedIn(p.linkedin_url), gh = safeHref(p.github_url);
  const first = (p.full_name || "this person").split(" ")[0];
  // Only the essentials, and only a few of each, even if an older row holds more.
  const top = (a, n) => (Array.isArray(a) ? a.slice(0, n) : []);
  const skills = top(p.skills, MAX.skills), interests = top(p.interests, MAX.interests), achievements = top(p.achievements, MAX.achievements);
  const areas = top(p.research_areas, MAX.areas), papers = top(p.publications, MAX.publications);
  const nothing = !p.headline && (faculty ? !areas.length && !papers.length && !p.career : !skills.length && !interests.length && !p.goals && !achievements.length);

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
        {p.email && <a className="btn-s" href={`mailto:${p.email}`}>{p.email}</a>}
        {!p.is_me && <ReportBlock kind="user" refId={p.id} ownerId={p.id} />}
      </div>
      {li && !p.is_me && <p className="audience">CampusCast has no chat. Connect with {first} on LinkedIn to take the conversation further. The link opens in a new tab.</p>}

      {nothing && <div className="empty"><h2>{p.is_me ? "Your profile is empty" : `${first} has not added anything yet`}</h2><p>{p.is_me ? "Add the essentials in the editor, or fill it from your resume." : "Check back later."}</p></div>}

      {faculty ? (<>
        {areas.length > 0 && <Section title="Research areas"><Tags list={areas} type="faculty" /></Section>}
        {papers.length > 0 && <Section title="Main papers"><ul className="person-list">{papers.map((x, i) => <Item key={i} x={x} venue />)}</ul></Section>}
        {p.career && <Section title="Where the work is heading"><p>{p.career}</p></Section>}
      </>) : (<>
        {skills.length > 0 && <Section title="Top skills"><Tags list={skills} type="student" /></Section>}
        {achievements.length > 0 && <Section title="Key achievements"><ul className="person-list">{achievements.map((x, i) => <Item key={i} x={x} />)}</ul></Section>}
        {interests.length > 0 && <Section title="Interests"><Tags list={interests} type="student" /></Section>}
        {p.goals && <Section title="Goal"><p>{p.goals}</p></Section>}
      </>)}
    </>
  );
}
