import Link from "next/link";
import { Upload } from "lucide-react";
import { requireVerified } from "../../../lib/dash/ctx";
import { shortBranch, timeAgo } from "../../../lib/dash/meta";
import { EXAMS, EXAM_LABEL, SEMESTERS } from "../../../lib/papers/constants";
import { FilterSelect, NoteActions } from "../../../components/dashboard/NotesUI";
import { Tabs } from "../../../components/dashboard/Bits";

export const metadata = { title: "Notes & previous papers" };
const TABS = [["papers", "Question papers"], ["notes", "Class notes"], ["mine", "My uploads"]];
const STATUS = { approved: ["Live", "#7fb48a"], pending: ["Waiting for review", "#f3b63f"], rejected: ["Not accepted", "#bbb"] };
const EXAM_COLOR = { ia1: "#8ec5d6", ia2: "#b9a7e0", ia3: "#f3b63f", final: "#e8603c" };

// Uploads from before course codes existed are listed under their subject name.
const courseKey = (n) => n.course_code || n.subject;

export default async function Notes({ searchParams }) {
  const sp = await searchParams;
  const one = (v) => (Array.isArray(v) ? v[0] : v) || "";
  const tab = TABS.some(([v]) => v === sp.tab) ? sp.tab : "papers";
  const { supabase, user, profile } = await requireVerified();
  const { data: departments } = await supabase.from("departments").select("name").eq("active", true).order("sort");
  const names = (departments || []).map((d) => d.name);

  // The student's own department is chosen until they pick another ("all" = every department).
  const asked = one(sp.dept);
  const dept = asked === "all" || names.includes(asked) ? asked : names.includes(profile.branch) ? profile.branch : "all";
  const sem = SEMESTERS.includes(Number(one(sp.sem))) ? Number(one(sp.sem)) : 0;
  const exam = tab === "papers" && EXAM_LABEL[one(sp.exam)] ? one(sp.exam) : "";
  const course = one(sp.course).slice(0, 80);

  let q = supabase.from("notes").select("*").order("created_at", { ascending: false }).limit(1000);
  if (tab === "mine") q = q.eq("uploader_id", user.id);
  else {
    q = q.eq("status", "approved").eq("kind", tab === "papers" ? "paper" : "notes");
    // papers marked "all departments" (no branch) show under every department
    if (dept !== "all") q = q.or(`branch.is.null,branch.eq."${dept}"`);
  }
  const [{ data, error }, { data: counts }, { data: myVotes }] = await Promise.all([
    q, supabase.rpc("note_vote_counts"), supabase.from("note_votes").select("note_id").eq("user_id", user.id),
  ]);
  const votes = new Map((counts || []).map((c) => [c.note_id, c.votes]));
  const voted = new Set((myVotes || []).map((m) => m.note_id));

  const all = data || [];
  const inChoice = tab === "mine" ? all : all.filter((n) => (!sem || n.semester === sem) && (!exam || n.exam_type === exam));
  // Only courses that have something to show under the current choice are offered, so there are no dead ends.
  const courses = new Map();
  for (const n of inChoice) {
    const c = courses.get(courseKey(n)) || { key: courseKey(n), name: n.course_code && n.subject !== n.course_code ? n.subject : null, count: 0 };
    c.name ||= n.course_code && n.subject !== n.course_code ? n.subject : null;
    c.count++;
    courses.set(c.key, c);
  }
  const courseList = [...courses.values()].sort((a, b) => a.key.localeCompare(b.key));
  const list = inChoice.filter((n) => tab === "mine" || !course || courseKey(n) === course);

  const examOrder = (n) => EXAMS.findIndex(([v]) => v === n.exam_type);
  if (tab === "papers") list.sort((a, b) => (b.exam_year || 0) - (a.exam_year || 0) || courseKey(a).localeCompare(courseKey(b)) || examOrder(a) - examOrder(b) || (votes.get(b.id) || 0) - (votes.get(a.id) || 0));
  if (tab === "notes") list.sort((a, b) => (votes.get(b.id) || 0) - (votes.get(a.id) || 0) || (a.created_at < b.created_at ? 1 : -1));
  const groups = new Map();
  for (const n of list) {
    const label = tab === "papers" ? n.exam_year || "Year not recorded" : "";
    groups.set(label, [...(groups.get(label) || []), n]);
  }

  // A link that keeps the other choices. Changing semester or exam also clears the course, which may not exist there.
  const href = (changes) => {
    const next = { tab: tab === "papers" ? "" : tab, dept: asked ? dept : "", sem: sem || "", exam, course, ...changes };
    const params = new URLSearchParams(Object.entries(next).filter(([, v]) => v).map(([k, v]) => [k, String(v)]));
    return `/dashboard/notes${params.size ? `?${params}` : ""}`;
  };
  const uploadHref = `/dashboard/notes/upload?${new URLSearchParams(Object.entries({ kind: tab === "notes" ? "notes" : "paper", dept: dept === "all" ? "" : dept, sem: sem || "", exam, course }).filter(([, v]) => v).map(([k, v]) => [k, String(v)]))}`;
  const filtered = sem || exam || course;

  return (
    <>
      <div className="page-head">
        <div><h1>Notes &amp; previous papers</h1><p>Old question papers and notes shared by seniors. Pick your semester, exam and course.</p></div>
        <Link className="btn" href={uploadHref}><Upload size={16} /> Upload {tab === "notes" ? "notes" : "a paper"}</Link>
      </div>
      <Tabs tabs={TABS} current={tab} base="/dashboard/notes" />

      {tab !== "mine" && (
        <section className="pp-filters" aria-label="Find">
          <div className="pp-row">
            <span className="pp-lab">Department</span>
            <FilterSelect label="Department" value={dept} options={[...names.map((n) => ({ value: n, label: n, href: href({ dept: n, course: "" }) })), { value: "all", label: "Every department", href: href({ dept: "all", course: "" }) }]} />
          </div>
          <div className="pp-row">
            <span className="pp-lab">Semester</span>
            <div className="pp-chips">
              <Link className={"chip" + (!sem ? " on" : "")} href={href({ sem: "", course: "" })}>All</Link>
              {SEMESTERS.map((s) => <Link key={s} className={"chip pp-num" + (sem === s ? " on" : "")} href={href({ sem: s, course: "" })} aria-label={`Semester ${s}`}>{s}</Link>)}
            </div>
          </div>
          {tab === "papers" && (
            <div className="pp-row">
              <span className="pp-lab">Exam</span>
              <div className="pp-chips">
                <Link className={"chip" + (!exam ? " on" : "")} href={href({ exam: "", course: "" })}>All</Link>
                {EXAMS.map(([v, l]) => <Link key={v} className={"chip" + (exam === v ? " on" : "")} href={href({ exam: v, course: "" })}>{l}</Link>)}
              </div>
            </div>
          )}
          <div className="pp-row">
            <span className="pp-lab">Course</span>
            <FilterSelect label="Course" value={courses.has(course) ? course : ""} options={[{ value: "", label: courseList.length ? `All courses (${inChoice.length})` : "No courses yet", href: href({ course: "" }) }, ...courseList.map((c) => ({ value: c.key, label: `${c.key}${c.name ? ` · ${c.name}` : ""} (${c.count})`, href: href({ course: c.key }) }))]} />
            {filtered ? <Link className="link-btn" href={href({ sem: "", exam: "", course: "" })}>Clear</Link> : null}
          </div>
        </section>
      )}

      {error && <p className="form-msg err">{error.message}</p>}
      {!list.length ? (
        <div className="empty">
          <h2>{tab === "mine" ? "You have not uploaded anything" : tab === "papers" ? "No question paper here yet" : "No notes here yet"}</h2>
          <p>{tab === "mine" ? "Share a question paper or your notes to help your juniors." : "Have it? Upload it and your juniors will find it here."}</p>
          <div className="notice-actions" style={{ justifyContent: "center" }}><Link className="btn-s clay" href={uploadHref}><Upload size={16} /> Upload it</Link></div>
        </div>
      ) : [...groups].map(([label, items]) => (
        <section key={label || "all"} className="pp-group">
          {label ? <h2>{label}</h2> : null}
          <div className="feed">{items.map((n) => (
            <article key={n.id} className="notice pp-card" style={{ "--u": n.kind === "paper" ? EXAM_COLOR[n.exam_type] || "#e8603c" : "#8ec5d6" }}>
              <div className="notice-top">
                {n.course_code && <b className="pp-code">{n.course_code}</b>}
                {n.exam_type && <span className="pill soft" style={{ "--c": EXAM_COLOR[n.exam_type] }}>{EXAM_LABEL[n.exam_type]}</span>}
                <span className="pill soft" style={{ "--c": "#d9c8a8" }}>Sem {n.semester}</span>
                <span className="pill soft" style={{ "--c": "#d9c8a8" }}>{n.branch ? shortBranch(n.branch) : "All departments"}</span>
                {tab === "mine" && <span className="pill soft" style={{ "--c": STATUS[n.status][1] }}>{STATUS[n.status][0]}</span>}
                <span className="when">{n.pages ? `${n.pages} page${n.pages === 1 ? "" : "s"} · ` : ""}added {timeAgo(n.created_at)}</span>
              </div>
              <h3 className="notice-title">{n.kind === "paper" && n.course_code ? (n.subject !== n.course_code ? n.subject : "Question paper") : n.title}</h3>
              {n.kind === "notes" && <p className="audience">{n.subject}</p>}
              {n.description && <p>{n.description}</p>}
              {n.review_note && n.status === "rejected" && <p className="inline-msg">Reviewer: {n.review_note}</p>}
              <div className="notice-actions">
                <NoteActions id={n.id} file={n.file} votes={votes.get(n.id) || 0} voted={voted.has(n.id)} mine={n.uploader_id === user.id} ownerId={n.uploader_id} status={n.status} />
              </div>
            </article>
          ))}</div>
        </section>
      ))}
    </>
  );
}
