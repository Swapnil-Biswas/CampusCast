import Link from "next/link";
import { CalendarClock, Download, ExternalLink, FileText, MapPin, Timer } from "lucide-react";
import { requireVerified } from "../../../lib/dash/ctx";
import { audienceLabel, fmtDate } from "../../../lib/dash/meta";
import { TAB_LABELS, TAB_ORDER, countByCategory, dayName, isOver, nextExam, pickTab, rowsForStudent, sortNoticesSoonestFirst, sortRows, timeRange, todayIST } from "../../../lib/exams/student";
import ExamCountdown from "../../../components/dashboard/ExamCountdown";
import RelTime from "../../../components/dashboard/RelTime";
import { OpenFile } from "../../../components/dashboard/Bits";

export const metadata = { title: "Examinations" };

const TYPE_LABEL = { timetable: "Timetable", notification: "Notification", guidelines: "Guidelines", result: "Results", circular: "Circular" };
const GROUPS = [["examination", "Examination instructions"], ["hallTicket", "Hall ticket"], ["requiredDocuments", "Required documents"], ["important", "Important notes"], ["other", "Other"]];
const dateOnly = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "");

export default async function Exams({ searchParams }) {
  const sp = await searchParams;
  const { supabase, profile, isAdmin } = await requireVerified();
  const today = todayIST();

  // Row-level security returns only published notices for this student's department and semester.
  const [{ data: notices, error }, { data: sem }] = await Promise.all([
    supabase.from("exam_notices")
      .select("id, title, notice_type, category, special_kind, original_exam_name, semesters, academic_year, regulation, notification_date, degree_programme, result_link, details, audience_depts, published_at")
      .eq("status", "published").order("published_at", { ascending: false }).limit(200),
    supabase.rpc("exam_semester"),
  ]);
  const semester = typeof sem === "number" ? sem : null;
  const all = notices || [];
  const counts = countByCategory(all);
  const { count: legacyCount } = await supabase.from("exams").select("id", { count: "exact", head: true });
  const tab = sp.tab === "earlier" ? "earlier" : pickTab(sp.tab, counts);

  const inTab = tab === "earlier" ? [] : all.filter((n) => n.category === tab);
  const ids = inTab.map((n) => n.id);
  const [{ data: entries }, { data: docs }] = ids.length ? await Promise.all([
    supabase.from("exam_timetable_entries").select("*").in("notice_id", ids),
    supabase.from("exam_documents").select("id, notice_id, original_filename, page_count, mime_type, deleted_at").in("notice_id", ids).order("created_at"),
  ]) : [{ data: [] }, { data: [] }];
  const rowsOf = (id) => sortRows(rowsForStudent((entries || []).filter((e) => e.notice_id === id), { branch: profile.branch, semester }));
  // The notice with the nearest coming exam goes first; finished ones follow, most recent first.
  const order = new Map(sortNoticesSoonestFirst(inTab.map((n) => ({ id: n.id, rows: rowsOf(n.id), publishedAt: n.published_at }))).map((x, i) => [x.id, i]));
  const shown = [...inTab].sort((a, b) => order.get(a.id) - order.get(b.id));

  let legacy = [];
  if (tab === "earlier") {
    const { data } = await supabase.from("exams").select("*").order("created_at", { ascending: false }).limit(100);
    legacy = data || [];
  }

  const tabs = [...TAB_ORDER.map((t) => [t, TAB_LABELS[t], counts[t] || 0]), ...(legacyCount ? [["earlier", "Earlier postings", legacyCount]] : [])];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Examinations</h1>
          <p>Official notices and timetables for your department{semester ? ` and semester ${semester}` : ""}. Each one links to the original PDF.</p>
        </div>
        {isAdmin && <Link className="btn-s" href="/dashboard/admin/exams">Manage exam notices</Link>}
      </div>

      <nav className="filters" aria-label="Examination category">
        {tabs.map(([v, label, n]) => (
          <Link key={v} className={"chip" + (tab === v ? " on" : "")} href={`/dashboard/exams?tab=${v}`} aria-current={tab === v ? "page" : undefined}>{label}{n > 0 && <small> {n}</small>}</Link>
        ))}
      </nav>
      {error && <p className="form-msg err">{error.message}</p>}

      {tab === "earlier" ? (
        legacy.length === 0 ? <div className="empty"><h2>Nothing here</h2></div> : (
          <div className="feed">
            {legacy.map((e) => (
              <article key={e.id} className="notice" style={{ "--u": "#d9c8a8" }}>
                <div className="notice-top"><span className="pill soft" style={{ "--c": "#d9c8a8" }}>{e.kind === "exam" ? "Exam" : e.kind === "timetable" ? "Timetable" : "Results"}</span>{e.course_code && <span className="pill soft" style={{ "--c": "#d9c8a8" }}>{e.course_code}</span>}{e.exam_at && <span className="when"><RelTime date={e.exam_at} mode="until" /></span>}</div>
                <h3 className="notice-title">{e.title}</h3>
                <p className="audience">For {audienceLabel(e)}</p>
                {e.exam_at && <p className="when-line"><CalendarClock size={16} /> {fmtDate(e.exam_at)}{e.duration_min && <> · <Timer size={16} /> {e.duration_min} min</>}{e.venue && <> · <MapPin size={16} /> {e.venue}</>}</p>}
                {e.notes && <p style={{ whiteSpace: "pre-wrap" }}>{e.notes}</p>}
                <div className="notice-actions"><OpenFile file={e.file} /></div>
              </article>
            ))}
          </div>
        )
      ) : shown.length === 0 ? (
        <div className="empty">
          <h2>No {TAB_LABELS[tab]} notice yet</h2>
          <p>When your college publishes one for your department{semester ? ` and semester ${semester}` : ""}, it will appear here and you will get a notification.</p>
        </div>
      ) : (
        <div className="feed">
          {shown.map((n) => {
            const rows = rowsOf(n.id);
            const over = isOver(rows, today);
            const next = nextExam(rows);
            const noticeDocs = (docs || []).filter((d) => d.notice_id === n.id);
            const groups = GROUPS.map(([g, label]) => [label, n.details?.instructions?.[g] || []]).filter(([, items]) => items.length);
            const dates = n.details?.importantDates || [];
            return (
              <article key={n.id} className={`notice exam-notice${over ? " over" : ""}`} style={{ "--u": "#e8603c" }}>
                <div className="notice-top">
                  <span className="pill soft" style={{ "--c": "#e8603c" }}>{TAB_LABELS[n.category]}</span>
                  {n.special_kind && <span className="pill soft" style={{ "--c": "#f3b63f" }}>{n.special_kind[0].toUpperCase() + n.special_kind.slice(1)}</span>}
                  <span className="pill soft" style={{ "--c": "#d9c8a8" }}>{TYPE_LABEL[n.notice_type] || n.notice_type}</span>
                  {over && <span className="pill soft" style={{ "--c": "#d9c8a8" }}>Over</span>}
                </div>
                <h3 className="notice-title">{n.title}</h3>
                <p className="audience">
                  {[n.original_exam_name && `As written in the notice: ${n.original_exam_name}`, n.academic_year && `Academic year ${n.academic_year}`, n.regulation, n.notification_date && `Notice dated ${dateOnly(n.notification_date)}`].filter(Boolean).join(" · ")}
                </p>

                <div className="notice-actions">
                  {noticeDocs.map((d) => d.deleted_at ? (
                    <span key={d.id} className="inline-msg">The original file was removed some days after the exams ended. The details here are kept.</span>
                  ) : (
                    <span key={d.id} className="doc-actions">
                      <a className="btn-s" href={`/api/exams/pdf/${d.id}`} target="_blank" rel="noreferrer"><FileText size={14} /> View original {d.mime_type?.startsWith("image/") ? "photo" : "PDF"} <ExternalLink size={12} /></a>
                      <a className="btn-s" href={`/api/exams/pdf/${d.id}?download=1`}><Download size={14} /> Download</a>
                    </span>
                  ))}
                  {n.result_link && <a className="btn-s clay" href={n.result_link} target="_blank" rel="noreferrer noopener"><ExternalLink size={14} /> Open results</a>}
                </div>

                {next && <ExamCountdown startsAt={next.startsAt} endsAt={next.endsAt} subject={next.row.subject_name} code={next.row.subject_code} hasTime={next.hasTime} />}

                {rows.length > 0 ? (
                  <div className="table-wrap">
                    <table className="tbl exam-tt">
                      <thead><tr><th>Date</th><th>Time</th><th>Subject</th><th>Code</th></tr></thead>
                      <tbody>{rows.map((r) => (
                        <tr key={r.id} className={r.exam_date && r.exam_date < today ? "past" : ""}>
                          <td><b>{r.exam_date ? dateOnly(r.exam_date) : "—"}</b><small>{dayName(r.exam_date)}</small></td>
                          <td>{timeRange(r.start_time, r.end_time) || "—"}{r.session && <small>{r.session}</small>}</td>
                          <td>{r.subject_name || "—"}{r.notes && <small>{r.notes}</small>}</td>
                          <td>{r.subject_code || "—"}</td>
                        </tr>))}
                      </tbody>
                    </table>
                  </div>
                ) : n.notice_type === "timetable" && <p className="inline-msg">No timetable rows for your department and semester. Check the original PDF.</p>}

                {dates.length > 0 && (
                  <ul className="exam-dates">{dates.map((d, i) => <li key={i}><b>{d.date ? dateOnly(d.date) : d.dateText || ""}</b> {d.label}</li>)}</ul>
                )}
                {groups.map(([label, items]) => (
                  <details key={label} className="exam-guide"><summary>{label}</summary><ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul></details>
                ))}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
