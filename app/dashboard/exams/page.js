import { CalendarClock, MapPin, Timer } from "lucide-react";
import { requireVerified } from "../../../lib/dash/ctx";
import { audienceLabel, fmtDate } from "../../../lib/dash/meta";
import RelTime from "../../../components/dashboard/RelTime";
import RecordEditor from "../../../components/dashboard/RecordEditor";
import { OpenFile, Remind, Tabs } from "../../../components/dashboard/Bits";

export const metadata = { title: "Examinations" };

const TABS = [["upcoming", "Upcoming exams"], ["timetable", "Timetables"], ["result", "Results archive"]];

export default async function Exams({ searchParams }) {
  const sp = await searchParams;
  const tab = TABS.some(([v]) => v === sp.tab) ? sp.tab : "upcoming";
  const { supabase, user, isAdmin } = await requireVerified();
  const nowIso = new Date().toISOString();
  let q = supabase.from("exams").select("*");
  q = tab === "upcoming" ? q.eq("kind", "exam").gte("exam_at", nowIso).order("exam_at") : tab === "timetable" ? q.eq("kind", "timetable").order("created_at", { ascending: false }) : q.eq("kind", "result").order("created_at", { ascending: false });
  const [{ data, error }, { count: pastCount }] = await Promise.all([q, supabase.from("exams").select("id", { count: "exact", head: true }).eq("kind", "exam").lt("exam_at", nowIso)]);
  const next = tab === "upcoming" ? data?.[0] : null;

  return (
    <>
      <div className="page-head">
        <div><h1>Examinations</h1><p>Your exam calendar, timetables and results. If a date, time or venue changes you are alerted as Now.</p></div>
        {isAdmin && <RecordEditor table="exams" userId={user.id} isAdmin big />}
      </div>

      {next && (
        <div className="reach" style={{ marginBottom: 16 }}>
          Next exam: <b>{next.title}</b> <RelTime date={next.exam_at} mode="until" /> · {fmtDate(next.exam_at)}
        </div>
      )}
      <Tabs tabs={TABS} current={tab} base="/dashboard/exams" />
      {error && <p className="form-msg err">{error.message}</p>}

      {!data?.length ? (
        <div className="empty"><h2>{tab === "upcoming" ? "No exams scheduled" : tab === "timetable" ? "No timetables yet" : "No results published"}</h2>
          <p>{tab === "upcoming" && pastCount ? `${pastCount} earlier exam${pastCount === 1 ? "" : "s"} are over.` : "Anything that applies to you will be listed here."}</p></div>
      ) : (
        <div className="feed">
          {data.map((e) => (
            <article key={e.id} className="notice" style={{ "--u": e.kind === "exam" ? "#e8603c" : e.kind === "timetable" ? "#f3b63f" : "#7fb48a" }}>
              <div className="notice-top">
                <span className="pill soft" style={{ "--c": "#e8603c" }}>{e.kind === "exam" ? "Exam" : e.kind === "timetable" ? "Timetable" : "Results"}</span>
                {e.course_code && <span className="pill soft" style={{ "--c": "#d9c8a8" }}>{e.course_code}</span>}
                {e.exam_at && <span className="when"><RelTime date={e.exam_at} mode="until" /></span>}
              </div>
              <h3 className="notice-title">{e.title}</h3>
              <p className="audience">For {audienceLabel(e)}</p>
              {e.exam_at && <p className="when-line"><CalendarClock size={16} /> {fmtDate(e.exam_at)}{e.duration_min && <> · <Timer size={16} /> {e.duration_min} min</>}{e.venue && <> · <MapPin size={16} /> {e.venue}</>}</p>}
              {e.notes && <p style={{ whiteSpace: "pre-wrap" }}>{e.notes}</p>}
              <div className="notice-actions">
                <OpenFile file={e.file} />
                {e.kind === "exam" && <Remind kind="exam" refId={e.id} title={e.title} url="/dashboard/exams" at={e.exam_at} offsets={[["1 week before", 7 * 864e5], ["1 day before", 864e5], ["2 hours before", 72e5]]} />}
                {isAdmin && <RecordEditor table="exams" record={e} userId={user.id} isAdmin />}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
