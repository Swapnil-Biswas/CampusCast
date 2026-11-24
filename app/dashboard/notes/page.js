import Link from "next/link";
import { requireVerified } from "../../../lib/dash/ctx";
import { shortBranch, timeAgo } from "../../../lib/dash/meta";
import { NoteActions, NoteUpload } from "../../../components/dashboard/NotesUI";
import { Tabs } from "../../../components/dashboard/Bits";

export const metadata = { title: "Notes & previous papers" };
const TABS = [["browse", "Browse"], ["mine", "My uploads"]];

export default async function Notes({ searchParams }) {
  const sp = await searchParams;
  const one = (v) => (Array.isArray(v) ? v[0] : v) || "";
  const tab = TABS.some(([v]) => v === sp.tab) ? sp.tab : "browse";
  const f = { q: one(sp.q).trim(), semester: one(sp.semester), kind: one(sp.kind), subject: one(sp.subject).trim() };
  const { supabase, user } = await requireVerified();

  let q = supabase.from("notes").select("*").order("created_at", { ascending: false }).limit(80);
  q = tab === "mine" ? q.eq("uploader_id", user.id) : q.eq("status", "approved");
  if (f.semester) q = q.eq("semester", Number(f.semester));
  if (f.kind) q = q.eq("kind", f.kind);
  if (f.subject) q = q.ilike("subject", `%${f.subject.replace(/[%,]/g, "")}%`);
  if (f.q) q = q.textSearch("search", f.q, { type: "websearch", config: "english" });
  const [{ data, error }, { data: counts }, { data: mine }, { data: subjects }] = await Promise.all([
    q, supabase.rpc("note_vote_counts"), supabase.from("note_votes").select("note_id").eq("user_id", user.id),
    supabase.from("notes").select("subject").eq("status", "approved"),
  ]);
  const votes = new Map((counts || []).map((c) => [c.note_id, c.votes]));
  const voted = new Set((mine || []).map((m) => m.note_id));
  const list = [...(data || [])].sort((a, b) => (votes.get(b.id) || 0) - (votes.get(a.id) || 0) || (a.created_at < b.created_at ? 1 : -1));
  const subjectList = [...new Set((subjects || []).map((s) => s.subject))].sort();

  return (
    <>
      <div className="page-head">
        <div><h1>Notes &amp; previous papers</h1><p>Search by subject and semester. The most upvoted rise to the top. Uploads are reviewed before they go live.</p></div>
        <NoteUpload userId={user.id} />
      </div>
      <Tabs tabs={TABS} current={tab} base="/dashboard/notes" />
      <form className="filters" method="get" role="search">
        {tab === "mine" && <input type="hidden" name="tab" value="mine" />}
        <label className="sel"><span>Search</span><input name="q" defaultValue={f.q} placeholder="keywords" /></label>
        <label className="sel"><span>Subject</span><input name="subject" defaultValue={f.subject} list="subjects" placeholder="any" /><datalist id="subjects">{subjectList.map((s) => <option key={s} value={s} />)}</datalist></label>
        <label className="sel"><span>Semester</span><select name="semester" defaultValue={f.semester}><option value="">All</option>{[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        <label className="sel"><span>Type</span><select name="kind" defaultValue={f.kind}><option value="">All</option><option value="notes">Notes</option><option value="paper">Previous papers</option></select></label>
        <button className="chip on">Search</button>
        {(f.q || f.subject || f.semester || f.kind) && <Link className="link-btn" href={tab === "mine" ? "/dashboard/notes?tab=mine" : "/dashboard/notes"}>Clear</Link>}
      </form>
      {error && <p className="form-msg err">{error.message}</p>}
      {!list.length ? <div className="empty"><h2>{tab === "mine" ? "You have not uploaded anything" : "Nothing found"}</h2><p>{tab === "mine" ? "Share your notes or a previous paper to help classmates." : "Try different keywords, or upload what you have."}</p></div> : (
        <div className="feed">{list.map((n) => (
          <article key={n.id} className="notice" style={{ "--u": n.kind === "paper" ? "#e8603c" : "#8ec5d6" }}>
            <div className="notice-top">
              <span className="pill soft" style={{ "--c": n.kind === "paper" ? "#e8603c" : "#8ec5d6" }}>{n.kind === "paper" ? "Previous paper" : "Notes"}</span>
              <span className="pill soft" style={{ "--c": "#d9c8a8" }}>Sem {n.semester}</span>
              {n.branch && <span className="pill soft" style={{ "--c": "#d9c8a8" }}>{shortBranch(n.branch)}</span>}
              {tab === "mine" && <span className="pill soft" style={{ "--c": n.status === "approved" ? "#7fb48a" : n.status === "pending" ? "#f3b63f" : "#bbb" }}>{n.status}</span>}
              <span className="when">{timeAgo(n.created_at)}</span>
            </div>
            <h3 className="notice-title">{n.title}</h3>
            <p className="audience">{n.subject}</p>
            {n.description && <p>{n.description}</p>}
            {n.review_note && n.status === "rejected" && <p className="inline-msg">Reviewer: {n.review_note}</p>}
            <div className="notice-actions">
              <NoteActions id={n.id} file={n.file} votes={votes.get(n.id) || 0} voted={voted.has(n.id)} mine={n.uploader_id === user.id} ownerId={n.uploader_id} status={n.status} />
            </div>
          </article>
        ))}</div>
      )}
    </>
  );
}
