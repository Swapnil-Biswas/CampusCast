import Link from "next/link";
import { requireVerified } from "../../../lib/dash/ctx";
import { shortBranch, timeAgo } from "../../../lib/dash/meta";
import { OwnPostControls, PostForm, RequestRow } from "../../../components/dashboard/ConnectUI";
import { ReportBlock, RequestBox } from "../../../components/dashboard/Common";
import { Tabs } from "../../../components/dashboard/Bits";

export const metadata = { title: "Connect" };
const TABS = [["board", "Browse"], ["mine", "My posts"], ["requests", "Requests"]];

export default async function Connect({ searchParams }) {
  const sp = await searchParams;
  const one = (v) => (Array.isArray(v) ? v[0] : v) || "";
  const tab = TABS.some(([v]) => v === sp.tab) ? sp.tab : "board";
  const f = { kind: one(sp.kind), skill: one(sp.skill).trim().toLowerCase(), hackathon: one(sp.hackathon) };
  const { supabase, user } = await requireVerified();

  const [{ data: hacks }, { data: myReqs }, { data: inReqs }] = await Promise.all([
    supabase.from("hackathons").select("id,title,deadline").gte("deadline", new Date().toISOString()).order("deadline"),
    supabase.from("connect_requests").select("*").eq("requester_id", user.id).order("created_at", { ascending: false }),
    supabase.from("connect_requests").select("*, connect_posts!inner(title,author_id)").eq("connect_posts.author_id", user.id).order("created_at", { ascending: false }),
  ]);

  let q = supabase.from("connect_posts").select("*, hackathons(title)").order("created_at", { ascending: false }).limit(60);
  q = tab === "mine" ? q.eq("author_id", user.id) : q.eq("status", "open").neq("author_id", user.id);
  if (f.kind) q = q.eq("kind", f.kind);
  if (f.skill) q = q.contains("skills", [f.skill]);
  if (f.hackathon) q = q.eq("hackathon_id", f.hackathon);
  const { data: posts, error } = tab === "requests" ? { data: [] } : await q;

  const postIds = (myReqs || []).map((r) => r.post_id);
  const { data: reqPosts } = postIds.length ? await supabase.from("connect_posts").select("id,title,author_id").in("id", postIds) : { data: [] };
  const postById = new Map((reqPosts || []).map((p) => [p.id, p]));
  const peopleIds = [...new Set([...(posts || []).map((p) => p.author_id), ...(reqPosts || []).map((p) => p.author_id), ...(inReqs || []).map((r) => r.requester_id)])];
  const { data: people } = peopleIds.length ? await supabase.rpc("author_names", { p_ids: peopleIds }) : { data: [] };
  const who = new Map((people || []).map((p) => [p.id, p]));
  const myReqByPost = new Map((myReqs || []).map((r) => [r.post_id, r]));
  const pendingIn = (inReqs || []).filter((r) => r.status === "pending").length;

  return (
    <>
      <div className="page-head">
        <div><h1>Connect</h1><p>Find teammates for a project or hackathon, or join someone else's team. Contact details are shared only after the author accepts.</p></div>
        <PostForm hackathons={hacks || []} presetHackathon={f.hackathon} />
      </div>
      <Tabs tabs={TABS.map(([v, l]) => [v, v === "requests" && pendingIn ? `${l} (${pendingIn} new)` : l])} current={tab} base="/dashboard/connect" />

      {tab === "board" && (
        <form className="filters" method="get" role="search">
          <label className="sel"><span>Looking for</span><select name="kind" defaultValue={f.kind}><option value="">All</option><option value="need">Teammates for a project</option><option value="team">A team to join</option></select></label>
          <label className="sel"><span>Skill</span><input name="skill" defaultValue={f.skill} placeholder="react, python…" /></label>
          <label className="sel"><span>Hackathon</span><select name="hackathon" defaultValue={f.hackathon}><option value="">Any</option>{(hacks || []).map((h) => <option key={h.id} value={h.id}>{h.title}</option>)}</select></label>
          <button className="chip on">Apply</button>
          {(f.kind || f.skill || f.hackathon) && <Link className="link-btn" href="/dashboard/connect">Clear</Link>}
        </form>
      )}
      {error && <p className="form-msg err">{error.message}</p>}

      {tab === "requests" ? (
        <div className="feed">
          {!(inReqs?.length || myReqs?.length) && <div className="empty"><h2>No requests yet</h2><p>Requests you send and receive show up here.</p></div>}
          {(inReqs || []).map((r) => <RequestRow key={r.id} r={r} incoming title={r.connect_posts.title} person={who.get(r.requester_id)} />)}
          {(myReqs || []).map((r) => <RequestRow key={r.id} r={r} title={postById.get(r.post_id)?.title || "A post"} person={who.get(postById.get(r.post_id)?.author_id)} />)}
        </div>
      ) : !posts?.length ? (
        <div className="empty"><h2>{tab === "mine" ? "You have not posted yet" : "No posts match"}</h2><p>{tab === "mine" ? "Post what you are building and who you need." : "Be the first to post, or loosen the filters."}</p></div>
      ) : (
        <div className="feed">{posts.map((p) => {
          const a = who.get(p.author_id), mine = p.author_id === user.id, req = myReqByPost.get(p.id);
          return (
            <article key={p.id} className="notice" style={{ "--u": p.kind === "need" ? "#8ec5d6" : "#f3b63f" }}>
              <div className="notice-top">
                <span className="pill soft" style={{ "--c": p.kind === "need" ? "#8ec5d6" : "#f3b63f" }}>{p.kind === "need" ? "Needs teammates" : "Looking for a team"}</span>
                {p.status !== "open" && <span className="pill soft" style={{ "--c": "#bbb" }}>{p.status}</span>}
                {p.hackathons?.title && <span className="pill soft" style={{ "--c": "#7fb48a" }}>{p.hackathons.title}</span>}
                <span className="when">{timeAgo(p.created_at)}</span>
              </div>
              <h3 className="notice-title">{p.title}</h3>
              <p className="audience">{mine ? "You" : a?.full_name || "A student"}{a?.branch ? ` · ${shortBranch(a.branch)} · Year ${a.year}` : ""}</p>
              <p style={{ whiteSpace: "pre-wrap" }}>{p.body}</p>
              {p.skills?.length > 0 && <div className="checks" style={{ margin: "6px 0" }}>{p.skills.map((s) => <Link key={s} className="chip" href={`/dashboard/connect?skill=${encodeURIComponent(s)}`}>{s}</Link>)}</div>}
              <div className="notice-actions">
                {mine ? <OwnPostControls id={p.id} status={p.status} /> : req ? <span className="inline-msg">You asked to join ({req.status}). See Requests.</span>
                  : <RequestBox kind="connect" id={p.id} placeholder="Introduce yourself and your skills" button="I'm interested" done="Request sent. You will be notified." />}
                {!mine && <ReportBlock kind="connect_post" refId={p.id} ownerId={p.author_id} />}
              </div>
            </article>
          );
        })}</div>
      )}
    </>
  );
}
