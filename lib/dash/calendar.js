// One list of everything with a date, for the calendar page and the .ics download.
import { examAgendaItems, todayIST } from "../exams/student";
const DAY = 864e5;

export const KIND = {
  exam: { label: "Exam", color: "#e8603c", href: "/dashboard/exams" },
  workshop: { label: "Workshop", color: "#7fb48a", href: "/dashboard/workshops" },
  hackathon: { label: "Hackathon", color: "#8ec5d6", href: "/dashboard/hackathons" },
  event: { label: "Event", color: "#c58ad1", href: "/dashboard/events" },
  mentor: { label: "Mentor session", color: "#f3b63f", href: "/dashboard/mentors?tab=requests" },
  notice: { label: "Notice", color: "#d9c8a8", href: "/dashboard" },
};

export async function loadAgenda(supabase, user, { days = 90 } = {}) {
  const from = new Date(Date.now() - DAY).toISOString();
  const to = new Date(Date.now() + days * DAY).toISOString();
  const fromDate = todayIST(Date.now() - DAY), toDate = todayIST(Date.now() + days * DAY);
  const [ex, ws, regs, hk, hi, ev, rs, ms, an, rem, xt, me, sem] = await Promise.all([
    supabase.from("exams").select("id,title,course_code,exam_at,duration_min,venue").eq("kind", "exam").gte("exam_at", from).lte("exam_at", to),
    supabase.from("workshops").select("id,title,starts_at,ends_at,venue").gte("starts_at", from).lte("starts_at", to),
    supabase.from("workshop_registrations").select("workshop_id,status").eq("user_id", user.id),
    supabase.from("hackathons").select("id,title,deadline,starts_at,location,status").neq("status", "draft").or(`and(deadline.gte.${from},deadline.lte.${to}),and(starts_at.gte.${from},starts_at.lte.${to})`),
    supabase.from("hackathon_interest").select("hackathon_id").eq("user_id", user.id),
    supabase.from("events").select("id,title,starts_at,venue").gte("starts_at", from).lte("starts_at", to),
    supabase.from("event_rsvps").select("event_id,status").eq("user_id", user.id),
    supabase.from("mentor_sessions").select("id,scheduled_at,note,status,mentor_requests(topic)").eq("status", "scheduled").gte("scheduled_at", from).lte("scheduled_at", to),
    supabase.from("announcements").select("id,title,event_at").eq("status", "live").not("event_at", "is", null).gte("event_at", from).lte("event_at", to),
    supabase.from("reminders").select("id,kind,title,url,remind_at,sent_at").eq("user_id", user.id).gte("remind_at", from).order("remind_at"),
    // The new published exam timetables (row-level security already limits them to this student's notices).
    supabase.from("exam_timetable_entries").select("id, department, semester, subject_name, subject_code, exam_date, start_time, end_time, session, notice:exam_notices(status, category, title)")
      .gte("exam_date", fromDate).lte("exam_date", toDate),
    supabase.from("profiles").select("branch").eq("id", user.id).maybeSingle(),
    supabase.rpc("exam_semester"),
  ]);
  const reg = new Map((regs.data || []).map((r) => [r.workshop_id, r.status]));
  const hint = new Set((hi.data || []).map((r) => r.hackathon_id));
  const rsvp = new Map((rs.data || []).map((r) => [r.event_id, r.status]));
  const items = [
    ...(ex.data || []).map((e) => ({ key: "e" + e.id, kind: "exam", title: e.title + (e.course_code ? ` (${e.course_code})` : ""), at: e.exam_at, end: e.duration_min ? new Date(new Date(e.exam_at).getTime() + e.duration_min * 60000).toISOString() : null, place: e.venue, mine: true })),
    ...(ws.data || []).map((w) => ({ key: "w" + w.id, kind: "workshop", title: w.title, at: w.starts_at, end: w.ends_at, place: w.venue, mine: reg.has(w.id), tag: reg.get(w.id) === "waitlist" ? "Waitlist" : reg.has(w.id) ? "Registered" : "" })),
    ...(hk.data || []).filter((h) => h.status !== "cancelled" && h.deadline && new Date(h.deadline) >= new Date(from)).map((h) => ({ key: "h" + h.id, kind: "hackathon", title: h.title + " (registration closes)", at: h.deadline, place: h.location, href: `/dashboard/hackathons/${h.id}`, mine: hint.has(h.id), tag: hint.has(h.id) ? "Interested" : "" })),
    ...(hk.data || []).filter((h) => h.status !== "cancelled" && h.starts_at && new Date(h.starts_at) >= new Date(from)).map((h) => ({ key: "hs" + h.id, kind: "hackathon", title: h.title + " (starts)", at: h.starts_at, place: h.location, href: `/dashboard/hackathons/${h.id}`, mine: hint.has(h.id), tag: hint.has(h.id) ? "Interested" : "" })),
    ...(ev.data || []).map((e) => ({ key: "v" + e.id, kind: "event", title: e.title, at: e.starts_at, place: e.venue, mine: rsvp.has(e.id), tag: rsvp.get(e.id) === "going" ? "Going" : rsvp.get(e.id) ? "Interested" : "" })),
    ...(ms.data || []).map((s) => ({ key: "m" + s.id, kind: "mentor", title: `Mentoring: ${s.mentor_requests?.topic || "session"}`, at: s.scheduled_at, place: s.note, mine: true })),
    ...examAgendaItems((xt.data || []).filter((e) => e.notice?.status === "published"), { branch: me.data?.branch, semester: typeof sem.data === "number" ? sem.data : null }),
    ...(an.data || []).map((a) => ({ key: "a" + a.id, kind: "notice", title: a.title, at: a.event_at, href: `/dashboard?open=${a.id}`, mine: false })),
  ].filter((i) => i.at).sort((a, b) => new Date(a.at) - new Date(b.at));
  return { items, reminders: rem.data || [] };
}

// ---- .ics (RFC 5545) ----
const esc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const fold = (line) => (line.length <= 73 ? line : line.match(/.{1,73}/g).join("\r\n "));

export function toIcs(items, host = "campuscast") {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CampusCast//Dashboard//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:CampusCast"];
  for (const i of items) {
    const start = new Date(i.at), end = i.end ? new Date(i.end) : new Date(start.getTime() + 3600000);
    lines.push("BEGIN:VEVENT", `UID:${i.key}@${host}`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
      `SUMMARY:${esc(i.title)}`, ...(i.place ? [`LOCATION:${esc(i.place)}`] : []), `DESCRIPTION:${esc(KIND[i.kind].label + (i.tag ? " · " + i.tag : ""))}`);
    // A 1-hour heads-up on the phone's own calendar.
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(i.title)}`, "TRIGGER:-PT1H", "END:VALARM", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
