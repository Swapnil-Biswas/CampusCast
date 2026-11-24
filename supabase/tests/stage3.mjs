import { run } from "../../scripts/rls-harness.mjs";

const CSE = "Computer Science & Engineering", ECE = "Electronics & Communication Engineering";

await run("Stage 3: official modules", async (t) => {
  const admin = await t.user("admin", { role: "admin" });
  const s1 = await t.user("s1", { branch: CSE, year: 2 });
  const s2 = await t.user("s2", { branch: CSE, year: 2 });
  const s3 = await t.user("s3", { branch: CSE, year: 2 });
  const ece = await t.user("ece", { branch: ECE, year: 3 });
  const raw = await t.user("raw", { status: "unverified", branch: null, year: null });

  // --- exams ---
  const ex = await t.as(admin, `insert into public.exams (title, exam_at, venue, audience_depts, audience_years) values ('Data Structures', now() + interval '10 days', 'Hall A', $1, $2) returning id`, [[CSE], [2]]);
  t.check("admin can schedule an exam", !ex.error, ex.error);
  const titles = async (u) => (await t.as(u, "select title from public.exams")).rows.map((r) => r.title);
  t.check("CSE y2 student sees the exam", (await titles(s1)).includes("Data Structures"));
  t.check("ECE student does not", !(await titles(ece)).includes("Data Structures"));
  t.check("unverified user sees no exams", (await titles(raw)).length === 0);
  t.check("student cannot create an exam", !!(await t.as(s1, "insert into public.exams (title, exam_at) values ('Fake exam', now())")).error);
  const soon = (await t.as(s1, "select title, urgency from public.notifications")).rows;
  t.check("new exam notified the audience as Soon", soon.some((r) => r.title.startsWith("Exam scheduled") && r.urgency === 2), JSON.stringify(soon));
  await t.as(admin, "update public.exams set venue = 'Hall B' where id = $1", [ex.rows[0].id]);
  const now = (await t.as(s1, "select title, urgency from public.notifications")).rows;
  t.check("changing the venue auto-notifies as Now", now.some((r) => r.title.startsWith("Exam venue changed") && r.urgency === 0), JSON.stringify(now));
  t.check("ECE student not notified of CSE exam change", (await t.as(ece, "select 1 from public.notifications")).rows.length === 0);

  // --- workshops: seat cap, waitlist, promotion ---
  const w = await t.as(admin, `insert into public.workshops (title, starts_at, seats, organizer_id, audience_depts) values ('Git workshop', now() + interval '3 days', 2, $1, $2) returning id`, [admin, [CSE]]);
  t.check("admin can create a workshop", !w.error, w.error);
  const wid = w.rows[0].id;
  const reg = async (u) => (await t.as(u, "select public.register_workshop($1) as s", [wid]));
  t.check("first student gets a seat", (await reg(s1)).rows[0]?.s === "registered");
  t.check("second student gets a seat", (await reg(s2)).rows[0]?.s === "registered");
  t.check("third goes on the waitlist", (await reg(s3)).rows[0]?.s === "waitlist");
  t.check("registering twice is harmless", (await reg(s1)).rows[0]?.s === "registered");
  t.check("wrong department cannot register", !!(await reg(ece)).error);
  t.check("unverified cannot register", !!(await reg(raw)).error);
  const cnt = (await t.as(s1, "select registered, waitlist from public.workshop_counts() where workshop_id = $1", [wid])).rows[0];
  t.check("counts are right (2 seats, 1 waiting)", cnt.registered === 2 && cnt.waitlist === 1, JSON.stringify(cnt));
  t.check("student cannot write registrations directly", !!(await t.as(ece, "insert into public.workshop_registrations (workshop_id, user_id) values ($1, $2)", [wid, ece])).error);
  t.check("student cannot see other registrations", (await t.as(s1, "select 1 from public.workshop_registrations where user_id <> $1", [s1])).rows.length === 0);
  await t.as(s1, "select public.cancel_registration($1)", [wid]);
  const st3 = (await t.as(s3, "select status from public.workshop_registrations where workshop_id = $1", [wid])).rows[0];
  t.check("cancelling promotes the waitlist", st3?.status === "registered", JSON.stringify(st3));
  t.check("promoted student got a notification", (await t.as(s3, "select 1 from public.notifications where title like 'You got a seat%'")).rows.length === 1);
  t.check("promoted student has reminders", (await t.as(s3, "select 1 from public.reminders where kind = 'workshop'")).rows.length === 2);
  t.check("student cannot export attendees", !!(await t.as(s2, "select * from public.workshop_attendees($1)", [wid])).error);
  const att = await t.as(admin, "select * from public.workshop_attendees($1)", [wid]);
  t.check("admin can export attendees", !att.error && att.rows.length === 2, att.error);

  // --- hackathons ---
  t.check("student cannot post a hackathon", !!(await t.as(s1, "insert into public.hackathons (title, deadline) values ('Fake', now() + interval '1 day')")).error);
  const h = await t.as(admin, "insert into public.hackathons (title, deadline, mode) values ('CampusHack', now() + interval '5 days', 'hybrid') returning id");
  t.check("admin can post a hackathon", !h.error, h.error);
  t.check("any verified student can read it", (await t.as(ece, "select 1 from public.hackathons")).rows.length === 1);
  t.check("unverified cannot", (await t.as(raw, "select 1 from public.hackathons")).rows.length === 0);
  t.check("student can mark interest", !(await t.as(s1, "insert into public.hackathon_interest (hackathon_id, user_id) values ($1, $2)", [h.rows[0].id, s1])).error);
  t.check("cannot mark interest for someone else", !!(await t.as(s1, "insert into public.hackathon_interest (hackathon_id, user_id) values ($1, $2)", [h.rows[0].id, s2])).error);

  // --- events ---
  const ev = await t.as(admin, "insert into public.events (title, starts_at) values ('Cultural night', now() + interval '8 days') returning id");
  t.check("admin can create an event", !ev.error, ev.error);
  t.check("student can RSVP going", !(await t.as(s1, "insert into public.event_rsvps (event_id, user_id, status) values ($1, $2, 'going')", [ev.rows[0].id, s1])).error);
  t.check("bad RSVP status rejected", !!(await t.as(s2, "insert into public.event_rsvps (event_id, user_id, status) values ($1, $2, 'maybe')", [ev.rows[0].id, s2])).error);
  const ec = (await t.as(s2, "select going, interested from public.event_counts() where event_id = $1", [ev.rows[0].id])).rows[0];
  t.check("event counts visible", ec.going === 1 && ec.interested === 0, JSON.stringify(ec));
  t.check("student cannot create an event", !!(await t.as(s1, "insert into public.events (title, starts_at) values ('Fake', now())")).error);
});
