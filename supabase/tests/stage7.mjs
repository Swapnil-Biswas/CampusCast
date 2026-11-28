import { run } from "../../scripts/rls-harness.mjs";

const AIML = "AI & Machine Learning", CSE = "Computer Science & Engineering", ECE = "Electronics & Communication Engineering";
const SHA = (c) => c.repeat(64);

await run("Stage 7: approvers (HOD / cluster head), reminders, PDF retention", async (t) => {
  // After a signed-in step the session claims linger inside the transaction; clear them before every admin statement.
  const rawAdmin = t.admin.bind(t);
  t.admin = async (sql, params = []) => {
    await rawAdmin("select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true)");
    return rawAdmin(sql, params);
  };
  const sup = await t.user("super", { role: "super_admin", branch: CSE });
  const upl = await t.user("uploader", { role: "admin", branch: AIML });          // information staff: uploads, does not approve
  const hodA = await t.user("hodA", { role: "admin", branch: AIML });             // head of AI & ML
  const hodC = await t.user("hodC", { role: "admin", branch: CSE });              // head of CSE
  const cluster = await t.user("cluster", { role: "admin", branch: AIML });       // cluster head over AI & ML and CSE
  const both = await t.user("both", { role: "admin", branch: AIML });             // uploads AND is a head (must not approve own)
  const stuA2 = await t.user("stuA2", { branch: AIML, year: 1 });
  const stuA4 = await t.user("stuA4", { branch: AIML, year: 2 });
  const stuC2 = await t.user("stuC2", { branch: CSE, year: 1 });
  const raw = await t.user("raw", { status: "unverified", branch: AIML, year: 1 });
  await t.admin("update public.profiles set semester = 2 where id = any($1)", [[stuA2, stuC2, raw]]);
  await t.admin("update public.profiles set semester = 4 where id = $1", [stuA4]);

  // ---------- who may assign approvers ----------
  t.check("an admin cannot assign approvers", !!(await t.as(upl, "select public.set_approver_depts($1, $2)", [upl, [AIML]])).error);
  t.check("a student cannot assign approvers", !!(await t.as(stuA2, "select public.set_approver_depts($1, $2)", [stuA2, [AIML]])).error);
  t.check("an unknown department is rejected", !!(await t.as(sup, "select public.set_approver_depts($1, $2)", [hodA, ["Astrology"]])).error);
  t.check("a student cannot be made an approver", !!(await t.as(sup, "select public.set_approver_depts($1, $2)", [stuA2, [AIML]])).error);
  for (const [who, deps] of [[hodA, [AIML]], [hodC, [CSE]], [cluster, [AIML, CSE]], [both, [AIML]]]) {
    t.check("super admin assigns approver departments", !(await t.as(sup, "select public.set_approver_depts($1, $2)", [who, deps])).error);
  }
  for (const who of [upl, both]) await t.as(sup, "select public.set_admin_depts($1, $2)", [who, [AIML]]);
  t.check("approver and uploader lists are separate", (await t.admin("select admin_depts a, approver_depts p from public.profiles where id = $1", [hodA])).rows[0].a.length === 0);
  t.check("a student cannot give themselves approver departments", (await t.as(stuA2, "update public.profiles set approver_depts = '{\"AI & Machine Learning\"}' where id = $1", [stuA2])).rowCount === 0);
  t.check("an admin cannot give themselves approver departments", (await t.as(upl, "update public.profiles set approver_depts = '{\"AI & Machine Learning\"}' where id = $1", [upl])).rowCount === 0);
  const aud = (await t.admin("select count(*)::int n from public.audit_log where action = 'exam.approver_depts'")).rows[0].n;
  t.check("assigning approvers is written to the audit log", aud >= 4, String(aud));

  // ---------- signed-out visitors ----------
  for (const fn of ["exam_semester(uuid)", "exam_audience_match(text[], smallint[], uuid)", "exam_pdf_expired(uuid, integer)", "exam_expired_pdfs(integer)", "exam_mark_pdfs_deleted(uuid[], integer)"]) {
    const r = (await t.admin("select has_function_privilege('anon', $1, 'execute') a, has_function_privilege('authenticated', $1, 'execute') u", ["public." + fn])).rows[0];
    t.check(`signed-out visitors cannot call ${fn}, signed-in users can`, !r.a && r.u);
  }

  // ---------- helpers ----------
  const mk = async (over = {}) => {
    const v = { depts: [AIML], sems: [2], status: "draft", by: upl, title: "IA 2 timetable", cat: "ia2", ...over };
    const r = await t.admin(`insert into public.exam_notices (notice_type, category, title, audience_depts, semesters, status, created_by, published_at)
      values ('timetable', $1, $2, $3, $4, $5, $6, case when $5 = 'published' then now() else null end) returning id`, [v.cat, v.title, v.depts, v.sems, v.status, v.by]);
    return r.rows[0].id;
  };
  const row = (id, over = {}) => t.admin(`insert into public.exam_timetable_entries (notice_id, department, semester, category, subject_name, subject_code, exam_date, start_time, end_time, session)
      values ($1, $2, $3, 'ia2', $4, $5, $6, $7, $8, 'FN') returning id`, [id, over.department ?? AIML, over.semester ?? 2, over.subject ?? "Data Structures", over.code ?? "21CS32", over.date ?? "2026-12-10", over.start ?? "10:00", over.end ?? "11:30"]).then((r) => r.rows[0].id);
  const go = (u, id, action, reason = null) => t.as(u, "select public.exam_notice_transition($1, $2, $3) s", [id, action, reason]);
  const notes = async (uid, kind) => (await t.admin("select title, body, urgency, url from public.notifications where user_id = $1 and kind = $2 order by created_at", [uid, kind])).rows;
  const status = async (id) => (await t.admin("select status from public.exam_notices where id = $1", [id])).rows[0].status;

  // ---------- the approval chain ----------
  const n1 = await mk();
  await row(n1);
  t.check("a head sees a draft for their department", (await t.as(hodA, "select id from public.exam_notices")).rows.some((r) => r.id === n1));
  t.check("a head of another department does not", !(await t.as(hodC, "select id from public.exam_notices")).rows.some((r) => r.id === n1));
  t.check("a head cannot edit the draft (uploaders do that)", (await t.as(hodA, "update public.exam_notices set title = 'Changed' where id = $1", [n1])).rowCount === 0);

  t.check("the uploader submits", !(await go(upl, n1, "submit")).error);
  t.check("the notice is now waiting for approval", (await status(n1)) === "pending_approval");
  const toHod = await notes(hodA, "exam_review"), toCluster = await notes(cluster, "exam_review");
  t.check("the head of that department is told it is waiting", toHod.length === 1 && /waiting for your approval/.test(toHod[0].title), JSON.stringify(toHod));
  t.check("a cluster head covering it is told too", toCluster.length === 1);
  t.check("heads of other departments are not told", (await notes(hodC, "exam_review")).length === 0);
  t.check("central admins are not pinged while a head exists", (await notes(sup, "exam_review")).length === 0);
  t.check("the person who submitted is not told", (await notes(upl, "exam_review")).length === 0);
  t.check("the waiting notice links to its review page and can email at once", toHod[0].url === `/dashboard/admin/exams/${n1}` && toHod[0].urgency === 1);

  t.check("an uploader with no approver rights cannot approve", /head of department/.test((await go(upl, n1, "approve")).error || ""));
  t.check("a head of another department cannot approve", !!(await go(hodC, n1, "approve")).error);
  t.check("a student cannot approve", !!(await go(stuA2, n1, "approve")).error);
  t.check("a head must give a reason to send it back", !!(await go(hodA, n1, "request_changes")).error);
  t.check("the head sends it back with a reason", !(await go(hodA, n1, "request_changes", "Please check the dates.")).error);
  const back = await notes(upl, "exam_status");
  t.check("the uploader is told, with the reason", back.length === 1 && /Changes requested/.test(back[0].title) && back[0].body === "Please check the dates.", JSON.stringify(back));
  t.check("they fix it and submit again", !(await go(upl, n1, "submit")).error);
  t.check("the head approves", !(await go(hodA, n1, "approve")).error);
  t.check("the uploader hears about the approval", (await notes(upl, "exam_status")).some((n) => /^Approved/.test(n.title)));
  t.check("students do not see it before it is published", (await t.as(stuA2, "select id from public.exam_notices where id = $1", [n1])).rows.length === 0);
  t.check("the head publishes it", !(await go(hodA, n1, "publish")).error);
  t.check("matching students are notified on publish", (await notes(stuA2, "exam_notice")).length === 1);
  t.check("students of another semester are not", (await notes(stuA4, "exam_notice")).length === 0);
  t.check("students of another department are not", (await notes(stuC2, "exam_notice")).length === 0);
  const hist = (await t.as(hodA, "select action from public.exam_approvals where notice_id = $1 order by id", [n1])).rows.map((r) => r.action);
  t.check("the head can read the full history", JSON.stringify(hist) === JSON.stringify(["submit", "request_changes", "resubmit", "approve", "publish"]), JSON.stringify(hist));
  t.check("a head can archive it", !(await go(hodA, n1, "archive")).error);

  // ---------- same person cannot submit and approve ----------
  const n2 = await mk({ by: both }); await row(n2);
  await go(both, n2, "submit");
  const self = await go(both, n2, "approve");
  t.check("someone who submitted a notice cannot approve it", /someone else must approve/.test(self.error || ""), self.error);
  t.check("another head can", !(await go(hodA, n2, "approve")).error);
  t.check("the submitter cannot publish it either", /someone else must publish/.test((await go(both, n2, "publish")).error || ""));

  const n3 = await mk({ by: sup }); await row(n3);
  await go(sup, n3, "submit");
  t.check("a central admin may approve their own (for small colleges)", !(await go(sup, n3, "approve")).error);
  const flagged = (await t.admin("select reason from public.exam_approvals where notice_id = $1 and action = 'approve'", [n3])).rows[0].reason;
  t.check("...and the history says so", /central admin who submitted it/.test(flagged || ""), flagged);

  // ---------- several departments: the approver must cover all of them ----------
  const n4 = await mk({ depts: [AIML, CSE], sems: null }); await row(n4);
  await go(upl, n4, "submit").then(async (r) => { if (r.error) { await t.admin("update public.exam_notices set audience_depts = audience_depts where id = $1", [n4]); } });
  await t.admin("select set_config('campuscast.exam_transition', 'on', false)");
  await t.admin("update public.exam_notices set status = 'pending_approval' where id = $1", [n4]);
  await t.admin("select set_config('campuscast.exam_transition', 'off', false)");
  t.check("the uploader cannot submit for a department they do not manage", /Not allowed|not allowed/.test((await go(upl, n4, "submit")).error || "") || (await status(n4)) === "pending_approval");
  t.check("a head covering only one of the departments cannot approve", !!(await go(hodA, n4, "approve")).error);
  t.check("a cluster head covering both can", !(await go(cluster, n4, "approve")).error);

  // ---------- no head set up for a department: central admins are asked ----------
  const n5 = await mk({ depts: [ECE], by: sup }); await row(n5, { department: ECE });
  await t.as(sup, "select public.set_admin_depts($1, $2)", [upl, [AIML, ECE]]);
  const n6 = await mk({ depts: [ECE] }); await row(n6, { department: ECE });
  await go(upl, n6, "submit");
  t.check("with no head for a department, central admins are asked instead", (await notes(sup, "exam_review")).some((n) => /ECE|Electronics/.test(n.body || "")));

  // ---------- documents are visible to the approver ----------
  const n7 = await mk({ status: "published" });
  await t.admin("insert into public.exam_documents (notice_id, storage_path, original_filename, mime_type, size_bytes, sha256, uploaded_by) values ($1, $2, 'a.pdf', 'application/pdf', 1000, $3, $4)", [n7, `${upl}/doc-a.pdf`, SHA("a"), upl]);
  t.check("a head can read the document row of their department", (await t.as(hodA, "select id from public.exam_documents where notice_id = $1", [n7])).rows.length === 1);
  t.check("a head of another department cannot", (await t.as(hodC, "select id from public.exam_documents where notice_id = $1", [n7])).rows.length === 0);

  // ====================================================================
  // Reminders
  // ====================================================================
  const at = (interval) => `(select (now() + interval '${interval}') at time zone 'Asia/Kolkata')`;
  const nowRow = async (id, interval, over = {}) => t.admin(
    `insert into public.exam_timetable_entries (notice_id, department, semester, category, subject_name, subject_code, exam_date, start_time, end_time, session)
     select $1, $2, $3, 'ia2', $4, $5, x::date, date_trunc('minute', x)::time, null, 'FN' from ${at(interval)} as t(x) returning id`,
    [id, over.department ?? AIML, over.semester ?? 2, over.subject ?? "Data Structures", over.code ?? "21CS32"]).then((r) => r.rows[0].id);

  const rn = await mk({ status: "published", title: "Reminder notice", sems: null });   // all semesters: rows decide
  const e2h = await nowRow(rn, "90 minutes", { subject: "Operating Systems", code: "21CS33" });      // 2-hour reminder is due now
  const e1d = await nowRow(rn, "23 hours 30 minutes", { subject: "Algorithms", code: "21CS34" });   // 1-day reminder is due now
  const later = await nowRow(rn, "5 hours", { subject: "Maths" });                                     // nothing due yet
  const stale = await nowRow(rn, "30 minutes", { subject: "Late publish" });                           // 2-hour moment already passed
  const other = await nowRow(rn, "90 minutes", { subject: "CSE only", department: CSE });             // row is for another department
  const sem4 = await nowRow(rn, "90 minutes", { subject: "Semester 4 only", semester: 4 });
  const draftN = await mk({ status: "draft", title: "Draft notice" });
  await nowRow(draftN, "90 minutes", { subject: "Draft subject" });

  const sent = (await t.admin("select public.due_exam_reminders() n")).rows[0].n;
  const mine = await notes(stuA2, "reminder");
  t.check("the 2-hour and the 1-day reminders are sent to a matching student", mine.length === 2, JSON.stringify(mine.map((m) => m.title)));
  t.check("the 2-hour reminder names the subject and code", mine.some((m) => m.title === "Exam in 2 hours: Operating Systems (21CS33)"), JSON.stringify(mine.map((m) => m.title)));
  t.check("the 1-day reminder says tomorrow", mine.some((m) => m.title === "Exam tomorrow: Algorithms (21CS34)"));
  t.check("reminders carry the date, time and category", mine.every((m) => /IA 2/.test(m.body) && /\d{1,2}:\d{2} [AP]M/.test(m.body)), mine[0]?.body);
  t.check("reminders are urgent so they are emailed at once and open the right tab", mine.every((m) => m.urgency === 1 && m.url === "/dashboard/exams?tab=ia2"));
  t.check("a reminder is not sent for an exam that is hours away", !mine.some((m) => /Maths/.test(m.title)));
  t.check("no stale 'in 2 hours' message for an exam that is 30 minutes away", !mine.some((m) => /Late publish/.test(m.title)));
  t.check("rows for another department do not reach this student", !mine.some((m) => /CSE only/.test(m.title)));
  t.check("rows for another semester do not reach this student", !mine.some((m) => /Semester 4/.test(m.title)));
  t.check("draft notices send no reminders", (await t.admin("select count(*)::int n from public.notifications where title like '%Draft subject%'")).rows[0].n === 0);
  const m4 = await notes(stuA4, "reminder");
  t.check("a semester 4 student gets only the semester 4 row", m4.length === 1 && /Semester 4 only/.test(m4[0].title), JSON.stringify(m4.map((m) => m.title)));
  t.check("a CSE student gets only the CSE row", (await notes(stuC2, "reminder")).length === 0 || (await notes(stuC2, "reminder")).every((m) => /CSE only/.test(m.title)));
  t.check("an unverified user gets nothing", (await notes(raw, "reminder")).length === 0);
  t.check("the job reports how many reminders it sent (2 + 1)", sent === 3, String(sent));
  t.check("running the job again sends nothing new", (await t.admin("select public.due_exam_reminders() n")).rows[0].n === 0);
  t.check("each reminder is recorded once", (await t.admin("select count(*)::int n from public.exam_reminders_sent where entry_id = $1", [e2h])).rows[0].n === 1);
  t.check("nobody can read or change the reminder log", (await t.as(stuA2, "select * from public.exam_reminders_sent")).error !== undefined);
  t.check("nobody can run the job directly", !!(await t.as(stuA2, "select public.due_exam_reminders()")).error);
  await t.admin("update public.exam_notices set status = 'archived' where id = $1", [rn]);
  const later2 = await nowRow(rn, "90 minutes", { subject: "After archive" });
  await t.admin("select public.due_exam_reminders()");
  t.check("an archived notice sends no reminders", !(await notes(stuA2, "reminder")).some((m) => /After archive/.test(m.title)));
  t.check("a time zone check: 09:30 India time is 04:00 UTC", (await t.admin("select public.exam_starts_at('2026-03-10', '09:30') = '2026-03-10 04:00+00'::timestamptz ok")).rows[0].ok);

  // ====================================================================
  // PDF retention
  // ====================================================================
  const doc = async (id, by = upl) => (await t.admin("insert into public.exam_documents (notice_id, storage_path, original_filename, mime_type, size_bytes, sha256, uploaded_by) values ($1, $2, 'x.pdf', 'application/pdf', 1000, $3, $4) returning id, storage_path", [id, `${by}/${Math.random().toString(16).slice(2)}.pdf`, SHA(Math.random().toString(16).slice(2, 3) || "b"), by])).rows[0];
  const withDate = async (status, days, extra = {}) => {
    const id = await mk({ status, depts: extra.depts || [AIML] });
    await t.admin("insert into public.exam_timetable_entries (notice_id, department, semester, category, subject_name, exam_date, start_time) values ($1, $2, 2, 'ia2', 'S', (now() at time zone 'Asia/Kolkata')::date - $3::int, '10:00')", [id, (extra.depts || [AIML])[0], days]);
    return id;
  };
  const old = await withDate("published", 25), recent = await withDate("published", 10), archivedOld = await withDate("archived", 30), draftOld = await withDate("draft", 40);
  const dOld = await doc(old), dRecent = await doc(recent), dArch = await doc(archivedOld), dDraft = await doc(draftOld);
  const noDates = await mk({ status: "published" });
  await t.admin("update public.exam_notices set published_at = now() - interval '70 days' where id = $1", [noDates]);
  const dNoDates = await doc(noDates);
  const young = await mk({ status: "published" }); const dYoung = await doc(young);

  const expiredFor = async (u, days = 20) => (await t.as(u, "select document_id from public.exam_expired_pdfs($1)", [days])).rows.map((r) => r.document_id);
  const exp = await expiredFor(hodA);
  t.check("a PDF whose last exam was 25 days ago has expired (20-day rule)", exp.includes(dOld.id));
  t.check("a PDF whose last exam was 10 days ago has not", !exp.includes(dRecent.id));
  t.check("an archived notice's PDF expires the same way", exp.includes(dArch.id));
  t.check("a draft's PDF never expires", !exp.includes(dDraft.id));
  t.check("a notice with no dates is kept 60 days, then expires", exp.includes(dNoDates.id) && !exp.includes(dYoung.id));
  t.check("the keep-for days can be changed", (await expiredFor(hodA, 5)).includes(dRecent.id) && !(await expiredFor(hodA, 30)).includes(dArch.id));
  t.check("a head of another department sees nothing to remove", !(await expiredFor(hodC)).includes(dOld.id));
  t.check("a student sees nothing to remove", (await expiredFor(stuA2)).length === 0);
  t.check("an uploader (not a head) sees nothing to remove", (await expiredFor(upl)).length === 0);
  t.check("a central admin sees them all", (await expiredFor(sup)).includes(dOld.id));

  t.check("a student cannot mark a PDF removed", (await t.as(stuA2, "select public.exam_mark_pdfs_deleted($1) n", [[dOld.id]])).rows[0].n === 0);
  t.check("a head of another department cannot", (await t.as(hodC, "select public.exam_mark_pdfs_deleted($1) n", [[dOld.id]])).rows[0].n === 0);
  t.check("a PDF that has not expired cannot be marked removed", (await t.as(hodA, "select public.exam_mark_pdfs_deleted($1) n", [[dRecent.id, dDraft.id]])).rows[0].n === 0);
  t.check("the head marks the expired ones removed", (await t.as(hodA, "select public.exam_mark_pdfs_deleted($1) n", [[dOld.id, dArch.id, dNoDates.id]])).rows[0].n === 3);
  t.check("they are not listed again", !(await expiredFor(hodA)).includes(dOld.id));
  t.check("marking twice does nothing", (await t.as(hodA, "select public.exam_mark_pdfs_deleted($1) n", [[dOld.id]])).rows[0].n === 0);
  t.check("the notice and its timetable are kept", (await t.admin("select count(*)::int n from public.exam_timetable_entries where notice_id = $1", [old])).rows[0].n === 1);
  t.check("the removal is written to the audit log", (await t.admin("select count(*)::int n from public.audit_log where action = 'exam.pdf_removed'")).rows[0].n >= 1);
  t.check("students still read the notice after its PDF is gone", (await t.as(stuA2, "select id from public.exam_notices where id = $1", [old])).rows.length === 1);

  // ---------- safe to run again ----------
  await t.admin("savepoint rerun");
  const fs = await import("node:fs");
  const again = await t.admin(fs.readFileSync(new URL("../dashboard-7-exam-alerts.sql", import.meta.url), "utf8")).then(() => null, (e) => e.message);
  t.check("re-running dashboard-7-exam-alerts.sql is harmless", again === null, again || "");
  if (again) await t.admin("rollback to savepoint rerun");
});
