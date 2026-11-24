import { run } from "../../scripts/rls-harness.mjs";

const CSE = "Computer Science & Engineering", ECE = "Electronics & Communication Engineering";

await run("Stage 1: announcement engine security", async (t) => {
  const admin = await t.user("admin", { role: "admin" });
  const supers = await t.user("super", { role: "super_admin" });
  const a = await t.user("cse2", { branch: CSE, year: 2 });          // CSE year 2
  const b = await t.user("ece3", { branch: ECE, year: 3 });          // ECE year 3
  const raw = await t.user("raw", { status: "unverified", branch: null, year: null });
  const pend = await t.user("pending", { status: "pending", branch: CSE, year: 2 });

  const ins = (uid, o) => t.as(uid, `insert into public.announcements (title, body, category, urgency, audience_depts, audience_years, audience_club, publish_at, status)
    values ($1, 'body text', $2, $3, $4, $5, $6, coalesce($7::timestamptz, now()), 'live') returning id, status`, [o.title, o.category || "general", o.urgency ?? 2, o.depts || null, o.years || null, o.club || null, o.at || null]);

  // --- who may publish ---
  t.check("student cannot publish a Now notice", (await ins(a, { title: "Student now", urgency: 0 })).error?.includes("Only admins"));
  t.check("student cannot publish a Today notice", !!(await ins(a, { title: "Student today", urgency: 1 })).error);
  t.check("student cannot publish at all (no club role)", !!(await ins(a, { title: "Student soon", urgency: 2 })).error);
  const n1 = await ins(admin, { title: "Exam moved", urgency: 0, depts: [CSE], years: [2], category: "exam" });
  t.check("admin can publish a Now notice", !n1.error, n1.error);
  const n2 = await ins(admin, { title: "Everyone notice", urgency: 3 });
  const n3 = await ins(admin, { title: "ECE only", urgency: 2, depts: [ECE], years: [3] });

  // --- who sees what ---
  const seen = async (u) => (await t.as(u, "select title from public.announcements order by title")).rows.map((r) => r.title);
  const sa = await seen(a), sb = await seen(b);
  t.check("CSE y2 student sees the CSE y2 notice and the global one only", sa.includes("Exam moved") && sa.includes("Everyone notice") && !sa.includes("ECE only"), JSON.stringify(sa));
  t.check("ECE y3 student sees the ECE notice, not the CSE one", sb.includes("ECE only") && !sb.includes("Exam moved"), JSON.stringify(sb));
  t.check("unverified student sees nothing", (await seen(raw)).length === 0);
  t.check("pending student sees nothing", (await seen(pend)).length === 0);
  t.check("admin sees everything", (await seen(admin)).length >= 3);

  // --- in-app notifications fan out to the right people only ---
  const notes = async (u) => (await t.as(u, "select title, urgency from public.notifications")).rows;
  t.check("matching student got the notification", (await notes(a)).some((r) => r.title === "Exam moved" && r.urgency === 0));
  t.check("non-matching student did not", !(await notes(b)).some((r) => r.title === "Exam moved"));
  t.check("author did not notify themselves", (await notes(admin)).length === 0);
  const otherNotes = await t.as(b, "select count(*)::int c from public.notifications where user_id = $1", [a]);
  t.check("a student cannot read another student's notifications", otherNotes.rows[0].c === 0);

  // --- nobody can promote or verify themselves ---
  await t.as(a, "update public.profiles set role = 'super_admin', status = 'verified' where id = $1", [a]);
  const me = (await t.admin("select role from public.profiles where id = $1", [a])).rows[0];
  t.check("student cannot change their own role", me.role === "student");
  await t.as(raw, "update public.profiles set status = 'verified' where id = $1", [raw]);
  t.check("student cannot verify themselves", (await t.admin("select status from public.profiles where id = $1", [raw])).rows[0].status === "unverified");
  t.check("admin cannot change roles", !!(await t.as(admin, "select public.set_role($1, 'admin')", [a])).error);
  t.check("super-admin can change roles", !(await t.as(supers, "select public.set_role($1, 'admin')", [a])).error);
  t.check("role change was audited", (await t.admin("select count(*)::int c from public.audit_log where action = 'role.changed'")).rows[0].c === 1);
  await t.admin("update public.profiles set role = 'student' where id = $1", [a]);

  // --- read receipts and analytics ---
  const id1 = n1.rows[0].id;
  t.check("student can record a read", !(await t.as(a, "insert into public.announcement_reads (announcement_id, user_id) values ($1, $2)", [id1, a])).error);
  t.check("student cannot record a read for someone else", !!(await t.as(a, "insert into public.announcement_reads (announcement_id, user_id) values ($1, $2)", [id1, b])).error);
  t.check("student cannot see the analytics", !!(await t.as(a, "select public.announcement_stats($1)", [id1])).error);
  const st = await t.as(admin, "select public.announcement_stats($1) s", [id1]);
  t.check("admin sees analytics with the read counted", st.rows?.[0]?.s?.reads === 1 && st.rows[0].s.audience === 3, JSON.stringify(st.rows?.[0]?.s ?? st.error));
  t.check("audience preview counts only matching verified students", (await t.as(admin, "select public.audience_size($1, $2, null) n", [[CSE], [2]])).rows[0].n === 3 && (await t.as(admin, "select public.audience_size($1, $2, null) n", [[ECE], [3]])).rows[0].n === 1);
  t.check("a student cannot use the audience preview", !!(await t.as(a, "select public.audience_size(null, null, null)")).error);

  // --- scheduling ---
  const sch = await ins(admin, { title: "Later notice", urgency: 3, at: new Date(Date.now() + 3600e3).toISOString() });
  t.check("future notice is stored as scheduled", sch.rows?.[0]?.status === "scheduled", JSON.stringify(sch));
  t.check("scheduled notice is hidden from students", !(await seen(a)).includes("Later notice"));
  await t.admin("update public.announcements set publish_at = now() - interval '1 minute' where title = 'Later notice'");
  await t.admin("select public.publish_due()");
  t.check("publish_due makes it live and notifies the audience", (await seen(a)).includes("Later notice") && (await notes(a)).some((r) => r.title === "Later notice"));

  // --- expiry ---
  await t.admin("update public.announcements set expires_at = now() - interval '1 second' where title = 'Everyone notice'");
  t.check("expired notice disappears for students", !(await seen(a)).includes("Everyone notice"));

  // --- clubs ---
  const club = (await t.admin("select id from public.clubs where slug = 'coding'")).rows[0].id;
  await t.admin("insert into public.club_follows (user_id, club_id) values ($1, $2)", [a, club]);
  await t.admin("insert into public.club_admins (user_id, club_id) values ($1, $2)", [a, club]);
  const cl = await ins(a, { title: "Club night", urgency: 2, club });
  t.check("club lead can publish to their own club", !cl.error, cl.error);
  t.check("club lead cannot send Today", !!(await ins(a, { title: "Club today", urgency: 1, club })).error);
  const cb = await ins(a, { title: "Other club", urgency: 2, club: (await t.admin("select id from public.clubs where slug = 'dance'")).rows[0].id });
  t.check("club lead cannot publish to another club", !!cb.error);
  t.check("club notice reaches followers, not others", (await seen(a)).includes("Club night") === true);
  const sB = await seen(b);
  t.check("non-follower does not see the club notice", !sB.includes("Club night"));

  // --- verification review ---
  t.check("student cannot review verifications", !!(await t.as(a, "select public.review_verification($1, true, null)", [pend])).error);
  t.check("admin can approve a pending student", !(await t.as(admin, "select public.review_verification($1, true, null)", [pend])).error);
  t.check("approval verified the profile and notified them", (await t.admin("select status from public.profiles where id = $1", [pend])).rows[0].status === "verified"
    && (await notes(pend)).some((r) => r.title.includes("approved")));
  t.check("admin cannot review themselves", !!(await t.as(admin, "select public.review_verification($1, true, null)", [admin])).error);

  // --- bookmarks & reminders are private ---
  await t.as(a, "insert into public.bookmarks (user_id, announcement_id) values ($1, $2)", [a, id1]);
  t.check("other students cannot see my bookmarks", (await t.as(b, "select count(*)::int c from public.bookmarks")).rows[0].c === 0);
  t.check("student cannot read the audit log", (await t.as(a, "select count(*)::int c from public.audit_log")).rows[0].c === 0);
});
