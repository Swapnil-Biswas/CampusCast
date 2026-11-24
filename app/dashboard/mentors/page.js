import Link from "next/link";
import { Star } from "lucide-react";
import { requireVerified } from "../../../lib/dash/ctx";
import { shortBranch } from "../../../lib/dash/meta";
import { AskMentor, MentorProfileForm, RequestCard } from "../../../components/dashboard/MentorUI";
import { ReportBlock } from "../../../components/dashboard/Common";
import { Tabs } from "../../../components/dashboard/Bits";

export const metadata = { title: "Free mentorship" };
const TABS = [["find", "Find a mentor"], ["requests", "My requests & sessions"]];

export default async function Mentors({ searchParams }) {
  const sp = await searchParams;
  const one = (v) => (Array.isArray(v) ? v[0] : v) || "";
  const tab = TABS.some(([v]) => v === sp.tab) ? sp.tab : "find";
  const domain = one(sp.domain).trim().toLowerCase();
  const { supabase, user, profile } = await requireVerified();

  const [{ data: dir }, { data: mineProfile }, { data: reqs }, { data: people }] = await Promise.all([
    supabase.rpc("mentor_directory"),
    supabase.from("mentor_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("mentor_requests").select("*, mentor_sessions(*)").order("created_at", { ascending: false }),
    supabase.rpc("mentor_people"),
  ]);
  const who = new Map((people || []).map((p) => [p.id, p]));
  const canMentor = Number(profile.year) >= 3;
  const mentors = (dir || []).filter((m) => m.user_id !== user.id && (!domain || m.domains.some((d) => d.includes(domain)))).sort((a, b) => Number(b.avg_rating || 0) - Number(a.avg_rating || 0));
  const allDomains = [...new Set((dir || []).flatMap((m) => m.domains))].sort();
  const mySent = new Set((reqs || []).filter((r) => r.mentee_id === user.id && ["pending", "accepted"].includes(r.status)).map((r) => r.mentor_id));
  const pendingIn = (reqs || []).filter((r) => r.mentor_id === user.id && r.status === "pending").length;

  return (
    <>
      <div className="page-head">
        <div><h1>Free mentorship</h1><p>Seniors in year 3 and above guide juniors for free. Request a mentor, agree a time, and rate the session afterwards.</p></div>
        {canMentor ? <MentorProfileForm mine={mineProfile} /> : <p className="audience">Mentoring opens in year 3.</p>}
      </div>
      <Tabs tabs={TABS.map(([v, l]) => [v, v === "requests" && pendingIn ? `${l} (${pendingIn} new)` : l])} current={tab} base="/dashboard/mentors" />

      {tab === "find" ? (
        <>
          <form className="filters" method="get" role="search">
            <label className="sel"><span>Domain</span><input name="domain" list="domains" defaultValue={domain} placeholder="web, dsa, placements…" /><datalist id="domains">{allDomains.map((d) => <option key={d} value={d} />)}</datalist></label>
            <button className="chip on">Search</button>{domain && <Link className="link-btn" href="/dashboard/mentors">Clear</Link>}
          </form>
          {!mentors.length ? <div className="empty"><h2>No mentors found</h2><p>{domain ? "Try another domain." : "Mentors from year 3 and above will appear here once they sign up."}</p></div> : (
            <div className="feed">{mentors.map((m) => (
              <article key={m.user_id} className="notice" style={{ "--u": "#c58ad1" }}>
                <div className="notice-top">
                  {m.domains.map((d) => <span key={d} className="pill soft" style={{ "--c": "#c58ad1" }}>{d}</span>)}
                  <span className="when">{m.avg_rating ? <><Star size={14} style={{ verticalAlign: "-2px" }} /> {m.avg_rating} · </> : null}{m.sessions} session{m.sessions === 1 ? "" : "s"}</span>
                </div>
                <h3 className="notice-title">{m.full_name || "A senior"}</h3>
                <p className="audience">{shortBranch(m.branch)} · Year {m.year}{m.availability ? ` · ${m.availability}` : ""}</p>
                {m.bio && <p style={{ whiteSpace: "pre-wrap" }}>{m.bio}</p>}
                <div className="notice-actions">
                  {mySent.has(m.user_id) ? <span className="inline-msg">You have an open request with this mentor.</span> : <AskMentor mentorId={m.user_id} />}
                  <ReportBlock kind="user" refId={m.user_id} ownerId={m.user_id} />
                </div>
              </article>
            ))}</div>
          )}
        </>
      ) : !reqs?.length ? (
        <div className="empty"><h2>No requests yet</h2><p>Requests you send, and requests you receive as a mentor, appear here.</p></div>
      ) : (
        <div className="feed">{reqs.map((r) => {
          const asMentor = r.mentor_id === user.id;
          const sessions = [...(r.mentor_sessions || [])].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
          return <RequestCard key={r.id} r={r} asMentor={asMentor} session={sessions[0]} person={who.get(asMentor ? r.mentee_id : r.mentor_id)} />;
        })}</div>
      )}
    </>
  );
}
