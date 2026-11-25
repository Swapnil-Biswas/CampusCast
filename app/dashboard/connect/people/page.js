import Link from "next/link";
import { requireVerified } from "../../../../lib/dash/ctx";
import { shortBranch } from "../../../../lib/dash/meta";
import { initials } from "../../../../lib/connect/profile";
import { safeLinkedIn } from "../../../../lib/connect/links";

export const metadata = { title: "People" };
const PAGE = 24;

export default async function People({ searchParams }) {
  const sp = await searchParams;
  const one = (v) => (Array.isArray(v) ? v[0] : v) || "";
  const type = one(sp.type) === "faculty" ? "faculty" : "student";
  const f = { q: one(sp.q).trim().slice(0, 80), dept: one(sp.dept), skill: one(sp.skill).trim().toLowerCase().slice(0, 40) };
  const page = Math.max(1, Math.min(200, parseInt(one(sp.page), 10) || 1));
  const { supabase } = await requireVerified();

  const [{ data: rows, error }, { data: depts }] = await Promise.all([
    supabase.rpc("people_directory", { p_type: type, p_q: f.q || null, p_dept: f.dept || null, p_skill: f.skill || null, p_limit: PAGE, p_offset: (page - 1) * PAGE }),
    supabase.from("departments").select("name").eq("active", true).order("sort"),
  ]);
  const total = Number(rows?.[0]?.total || 0);
  const qs = (over) => { const p = new URLSearchParams({ type, ...(f.q && { q: f.q }), ...(f.dept && { dept: f.dept }), ...(f.skill && { skill: f.skill }), ...over }); return `/dashboard/connect/people?${p}`; };
  const faculty = type === "faculty";
  const filtered = f.q || f.dept || f.skill;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{faculty ? "Faculty" : "Students"}</h1>
          <p>{faculty ? "See what each professor works on, their papers and where their career is heading." : "Find students by skill, interest or department, and see what they have achieved."} Only people who chose to share a profile are listed. To get in touch, use their LinkedIn.</p>
        </div>
        <Link className="btn-s clay" href="/dashboard/connect/me">Edit my profile</Link>
      </div>

      <form className="filters" method="get" role="search">
        <input type="hidden" name="type" value={type} />
        <label className="sel"><span>Search</span><input name="q" defaultValue={f.q} maxLength={80} placeholder={faculty ? "name, research area…" : "name, skill, interest…"} /></label>
        <label className="sel"><span>Department</span><select name="dept" defaultValue={f.dept}><option value="">Any</option>{(depts || []).map((d) => <option key={d.name} value={d.name}>{shortBranch(d.name)}</option>)}</select></label>
        <label className="sel"><span>{faculty ? "Research area" : "Skill"}</span><input name="skill" defaultValue={f.skill} maxLength={40} placeholder={faculty ? "nlp" : "react"} /></label>
        <button className="chip on">Apply</button>
        {filtered && <Link className="link-btn" href={`/dashboard/connect/people?type=${type}`}>Clear</Link>}
      </form>

      {error && <p className="form-msg err">{/people_directory|schema cache|42883|PGRST202/i.test(`${error.code} ${error.message}`) ? "Connect profiles are not set up yet. Run supabase/dashboard-9-connect-people.sql in the Supabase SQL Editor." : "Could not load people. Try again."}</p>}
      {!error && !rows?.length ? (
        <div className="empty">
          <h2>{filtered ? "Nobody matches" : faculty ? "No faculty profiles yet" : "No student profiles yet"}</h2>
          <p>{filtered ? "Loosen the search or clear the filters." : "Profiles appear here when people choose to share them. Be the first: add yours."}</p>
        </div>
      ) : (
        <div className="people-grid">
          {(rows || []).map((r) => {
            const li = safeLinkedIn(r.linkedin_url);
            const tags = (faculty ? r.research_areas : r.skills) || [];
            return (
              <article key={r.id} className="person-card">
                <Link className="person-link" href={`/dashboard/connect/people/${r.id}`}>
                  <span className="avatar" aria-hidden="true">{initials(r.full_name)}</span>
                  <span className="person-main">
                    <b>{r.full_name || "BMSIT member"}{r.is_me && <small> (you)</small>}</b>
                    <small>{faculty ? [r.designation, shortBranch(r.branch)].filter(Boolean).join(" · ") : [shortBranch(r.branch), r.year ? `Year ${r.year}` : null].filter(Boolean).join(" · ")}</small>
                  </span>
                </Link>
                {r.headline && <p className="person-headline">{r.headline}</p>}
                {tags.length > 0 && <div className="checks">{tags.slice(0, 6).map((s) => <Link key={s} className="chip" href={qs({ skill: s, page: 1 })}>{s}</Link>)}</div>}
                <div className="notice-actions">
                  <Link className="btn-s" href={`/dashboard/connect/people/${r.id}`}>View profile</Link>
                  {li && <a className="btn-s" href={li} target="_blank" rel="noopener noreferrer nofollow">LinkedIn</a>}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {total > PAGE && (
        <div className="filters" style={{ marginTop: 16 }}>
          {page > 1 && <Link className="chip" href={qs({ page: page - 1 })}>Previous</Link>}
          <span className="audience">Page {page} of {Math.ceil(total / PAGE)} · {total} people</span>
          {page * PAGE < total && <Link className="chip" href={qs({ page: page + 1 })}>Next</Link>}
        </div>
      )}
    </>
  );
}
