import fs from "node:fs";
import { run } from "../../scripts/rls-harness.mjs";

const AIML = "AI & Machine Learning", CSE = "Computer Science & Engineering", ECE = "Electronics & Communication Engineering";
const SHA = (c) => c.repeat(64);

// The semester the database should work out for a batch today (Asia/Kolkata): Aug-Jan odd, Feb-Jul even.
function expectedSemester(batch, now = new Date()) {
  const t = new Date(now.getTime() + 5.5 * 3600e3), m = t.getUTCMonth() + 1, y = t.getUTCFullYear();
  const study = Math.min(5, Math.max(1, (m >= 8 ? y : y - 1) - batch + 1));
  return Math.min(8, m >= 8 || m === 1 ? 2 * study - 1 : 2 * study);
}

await run("Stage 6: examination management", async (t) => {
  const sup = await t.user("super", { role: "super_admin", branch: CSE });
  const adminA = await t.user("adminA", { role: "admin", branch: AIML });
  const adminC = await t.user("adminC", { role: "admin", branch: CSE });
  const adminN = await t.user("adminN", { role: "admin", branch: CSE });          // admin with no departments assigned
  const stuA2 = await t.user("stuA2", { branch: AIML, year: 1 });
  const stuA4 = await t.user("stuA4", { branch: AIML, year: 2 });
  const stuC2 = await t.user("stuC2", { branch: CSE, year: 1 });
  const raw = await t.user("raw", { status: "unverified", branch: null, year: null });
  await t.admin("update public.profiles set semester = 2 where id = any($1)", [[stuA2, stuC2]]);
  await t.admin("update public.profiles set semester = 4 where id = $1", [stuA4]);

  // ---------- categories and departments ----------
  const cats = (await t.as(stuA2, "select label from public.exam_categories order by sort")).rows.map((r) => r.label);
  t.check("categories use the exact CampusCast names", JSON.stringify(cats) === JSON.stringify(["IA 1", "IA 2", "IA 3", "Final Examination", "Special Examination"]), JSON.stringify(cats));
  t.check("students cannot rename a category", (await t.as(stuA2, "update public.exam_categories set label = 'CIE 1' where code = 'ia1'")).rowCount === 0);
  const deps = (await t.as(stuA2, "select name from public.departments")).rows.length;
  t.check("departments are seeded and readable", deps >= 10, String(deps));
  t.check("admin cannot add a department", !!(await t.as(adminA, "insert into public.departments (name, code) values ('Robotics', 'ROBO')")).error);
  t.check("super admin can add a department", !(await t.as(sup, "insert into public.departments (name, code) values ('Robotics', 'ROBO')")).error);

  // ---------- who manages which department ----------
  t.check("admin cannot assign departments", !!(await t.as(adminA, "select public.set_admin_depts($1, $2)", [adminA, [AIML]])).error);
  t.check("unknown department is rejected", !!(await t.as(sup, "select public.set_admin_depts($1, $2)", [adminA, ["Astrology"]])).error);
  t.check("cannot assign departments to a student", !!(await t.as(sup, "select public.set_admin_depts($1, $2)", [stuA2, [AIML]])).error);
  t.check("super admin assigns AI & ML to adminA", !(await t.as(sup, "select public.set_admin_depts($1, $2)", [adminA, [AIML]])).error);
  t.check("super admin assigns CSE to adminC", !(await t.as(sup, "select public.set_admin_depts($1, $2)", [adminC, [CSE]])).error);

  // ---------- creating drafts ----------
  const mk = (u, over = {}) => {
    const v = { type: "timetable", cat: "ia2", title: "IA 2 timetable", depts: [AIML], sems: [2], ay: "2026-27", status: "draft", ...over };
    return t.as(u, `insert into public.exam_notices (notice_type, category, title, audience_depts, semesters, academic_year, status, created_by, original_exam_name)
                    values ($1, $2, $3, $4, $5, $6, $7, $8, 'CIE 2') returning id`, [v.type, v.cat, v.title, v.depts, v.sems, v.ay, v.status, u]);
  };
  const d1 = await mk(adminA);
  t.check("department admin can create a draft for their department", !d1.error, d1.error);
  const n1 = d1.rows[0].id;
  t.check("cannot create for another department", !!(await mk(adminA, { depts: [CSE] })).error);
  t.check("cannot create for own + another department", !!(await mk(adminA, { depts: [AIML, CSE] })).error);
  t.check("cannot create straight as published", !!(await mk(adminA, { status: "published" })).error);
  t.check("admin with no departments cannot create", !!(await mk(adminN)).error);
  t.check("student cannot create a notice", !!(await mk(stuA2)).error);
  t.check("original PDF wording is kept next to the category", (await t.as(adminA, "select original_exam_name from public.exam_notices where id = $1", [n1])).rows[0]?.original_exam_name === "CIE 2");

  const ids = async (u) => (await t.as(u, "select id from public.exam_notices")).rows.map((r) => r.id);
  t.check("draft is visible to its department admin", (await ids(adminA)).includes(n1));
  t.check("draft is hidden from another department's admin", !(await ids(adminC)).includes(n1));
  t.check("draft is visible to the central admin", (await ids(sup)).includes(n1));
  t.check("draft is hidden from students", !(await ids(stuA2)).includes(n1));
  t.check("draft is hidden from unverified users", (await ids(raw)).length === 0);

  // ---------- submitting needs complete data ----------
  const submit = (u, id) => t.as(u, "select public.exam_notice_transition($1, 'submit') as s", [id]);
  const e0 = await submit(adminA, n1);
  t.check("a timetable with no rows cannot be submitted", !!e0.error && /at least one row/.test(e0.error), e0.error);
  const entry = (u, id, over = {}) => {
    const v = { subject: "Data Structures", code: "21CS32", date: "2026-12-10", start: "10:00", end: "11:30", ...over };
    return t.as(u, `insert into public.exam_timetable_entries (notice_id, department, semester, category, original_exam_name, subject_name, subject_code, exam_date, start_time, end_time, session, source_page)
                    values ($1, $2, 2, 'ia2', 'CIE 2', $3, $4, $5, $6, $7, 'FN', 1) returning id`, [id, AIML, v.subject, v.code, v.date, v.start, v.end]);
  };
  const bad = await entry(adminA, n1, { date: null });
  t.check("a row without a date can be saved while drafting", !bad.error, bad.error);
  t.check("submit is blocked while a row has no date", /missing a subject or a date/.test((await submit(adminA, n1)).error || ""));
  await t.as(adminA, "delete from public.exam_timetable_entries where id = $1", [bad.rows[0].id]);
  t.check("end time must be after start time", !!(await entry(adminA, n1, { start: "12:00", end: "11:00" })).error);
  t.check("another department's admin cannot add rows", !!(await entry(adminC, n1)).error);
  t.check("a valid row is accepted", !(await entry(adminA, n1)).error);
  t.check("a category cannot be unclear at submit time", await (async () => {
    const x = await mk(adminA, { cat: null, title: "Unclear notice" });
    await entry(adminA, x.rows[0].id);
    const r = await submit(adminA, x.rows[0].id);
    return /still requires admin review/.test(r.error || "");
  })());

  // ---------- the workflow guard ----------
  t.check("a student cannot move a notice along", !!(await submit(stuA2, n1)).error);
  t.check("another department's admin cannot submit it", !!(await submit(adminC, n1)).error);
  t.check("status cannot be edited directly (admin)", !!(await t.as(adminA, "update public.exam_notices set status = 'published' where id = $1", [n1])).error);
  t.check("status cannot be edited directly (central admin)", !!(await t.as(sup, "update public.exam_notices set status = 'published' where id = $1", [n1])).error);
  t.check("category check: special kind needs the Special category", !!(await t.as(adminA, "update public.exam_notices set special_kind = 'supplementary' where id = $1", [n1])).error);
  const s1 = await submit(adminA, n1);
  t.check("complete notice can be submitted", !s1.error && s1.rows[0].s === "pending_approval", s1.error);
  t.check("editing is locked while pending", (await t.as(adminA, "update public.exam_notices set title = 'Changed' where id = $1", [n1])).rowCount === 0);
  t.check("rows are locked while pending", !!(await entry(adminA, n1)).error);

  // ---------- central review ----------
  const act = (u, id, a, reason = null) => t.as(u, "select public.exam_notice_transition($1, $2, $3) as s", [id, a, reason]);
  t.check("department admin cannot approve", !!(await act(adminA, n1, "approve")).error);
  t.check("rejecting needs a reason", !!(await act(sup, n1, "reject")).error);
  t.check("requesting changes needs a reason", !!(await act(sup, n1, "request_changes", "  ")).error);
  t.check("cannot publish before approval", !!(await act(sup, n1, "publish")).error);
  t.check("changes can be requested with a reason", (await act(sup, n1, "request_changes", "Subject codes look wrong")).rows?.[0]?.s === "changes_requested");
  const note = (await t.as(adminA, "select status, review_note from public.exam_notices where id = $1", [n1])).rows[0];
  t.check("the department admin sees the reason", note.status === "changes_requested" && note.review_note === "Subject codes look wrong", JSON.stringify(note));
  t.check("editing is open again", (await t.as(adminA, "update public.exam_notices set title = 'IA 2 timetable (corrected)' where id = $1", [n1])).rowCount === 1);
  t.check("can resubmit after requested changes", (await submit(adminA, n1)).rows?.[0]?.s === "pending_approval");
  t.check("central admin approves", (await act(sup, n1, "approve")).rows?.[0]?.s === "approved");

  const inbox = async (u) => (await t.as(u, "select title, body, urgency from public.notifications where kind = 'exam_notice'")).rows;
  t.check("nobody is notified before publishing", (await inbox(stuA2)).length === 0);
  t.check("students cannot see an approved but unpublished notice", !(await ids(stuA2)).includes(n1));
  t.check("department admin cannot publish", !!(await act(adminA, n1, "publish")).error);
  t.check("central admin publishes", (await act(sup, n1, "publish")).rows?.[0]?.s === "published");

  // ---------- who sees it, and who is told ----------
  const mine = await inbox(stuA2);
  t.check("the matching AI & ML semester 2 student is notified", mine.length === 1, JSON.stringify(mine));
  t.check("notification names the category, title and date", /^IA 2: IA 2 timetable/.test(mine[0]?.title || "") && /^Published \d{2} \w{3} \d{4}$/.test(mine[0]?.body || ""), JSON.stringify(mine[0]));
  t.check("a different semester is not notified", (await inbox(stuA4)).length === 0);
  t.check("a different department is not notified", (await inbox(stuC2)).length === 0);
  t.check("an unverified user is not notified", (await inbox(raw)).length === 0);
  t.check("the student sees the published notice", (await ids(stuA2)).includes(n1));
  t.check("other semester does not see it", !(await ids(stuA4)).includes(n1));
  t.check("other department does not see it", !(await ids(stuC2)).includes(n1));
  const rowsFor = async (u) => (await t.as(u, "select 1 from public.exam_timetable_entries where notice_id = $1", [n1])).rows.length;
  t.check("matching student sees the timetable rows", (await rowsFor(stuA2)) === 1);
  t.check("other student sees none", (await rowsFor(stuC2)) === 0 && (await rowsFor(stuA4)) === 0);
  t.check("students cannot edit a published notice", (await t.as(stuA2, "update public.exam_notices set title = 'x' where id = $1", [n1])).rowCount === 0);
  t.check("students cannot read the approval history", (await t.as(stuA2, "select 1 from public.exam_approvals")).rows.length === 0);
  const hist = (await t.as(sup, "select action from public.exam_approvals where notice_id = $1 order by id", [n1])).rows.map((r) => r.action);
  t.check("history records every step in order", JSON.stringify(hist) === JSON.stringify(["submit", "request_changes", "resubmit", "approve", "publish"]), JSON.stringify(hist));
  t.check("department admin can read history of their notice", (await t.as(adminA, "select 1 from public.exam_approvals where notice_id = $1", [n1])).rows.length === 5);
  t.check("other department's admin cannot", (await t.as(adminC, "select 1 from public.exam_approvals where notice_id = $1", [n1])).rows.length === 0);
  const aud = (await t.as(sup, "select count(*)::int c from public.audit_log where action like 'exam.%' and target_id = $1", [n1])).rows[0].c;
  t.check("every step is in the audit log", aud === 5, String(aud));

  // ---------- a notice for several departments, all semesters ----------
  const c1 = await mk(sup, { title: "Common instructions", type: "guidelines", cat: "final", depts: [AIML, CSE], sems: null });
  t.check("central admin can create a common notice", !c1.error, c1.error);
  const cid = c1.rows[0].id;
  t.check("both departments' admins can see the common draft, others cannot", (await ids(adminA)).includes(cid) && (await ids(adminC)).includes(cid) && !(await ids(adminN)).includes(cid));
  t.check("a single-department admin cannot edit a common notice", (await t.as(adminA, "update public.exam_notices set title = 'x' where id = $1", [cid])).rowCount === 0);
  await act(sup, cid, "submit"); await act(sup, cid, "approve"); await act(sup, cid, "publish");
  t.check("common notice reaches every semester of both departments", (await ids(stuA2)).includes(cid) && (await ids(stuA4)).includes(cid) && (await ids(stuC2)).includes(cid));
  t.check("but not another department", !(await ids(await t.user("ece", { branch: ECE, year: 2 }))).includes(cid));

  // ---------- special examinations and unclear categories ----------
  const sp = await t.as(adminA, `insert into public.exam_notices (notice_type, category, special_kind, title, audience_depts, semesters, created_by)
                                values ('timetable', 'special', 'supplementary', 'Supplementary exams', $1, $2, $3) returning id`, [[AIML], [2], adminA]);
  t.check("a supplementary exam is stored as Special, not Final", !sp.error && (await t.as(adminA, "select category from public.exam_notices where id = $1", [sp.rows[0].id])).rows[0].category === "special", sp.error);
  const un = await mk(adminA, { cat: null, title: "Needs a decision" });
  t.check("an unclear notice is saved with no category", !un.error && (await t.as(adminA, "select category from public.exam_notices where id = $1", [un.rows[0].id])).rows[0].category === null);
  await t.admin("savepoint console");
  const forced = await t.admin("update public.exam_notices set status = 'approved' where id = $1", [un.rows[0].id]).then(() => null, (e) => e.message);
  await t.admin("rollback to savepoint console");
  t.check("an unclear notice can never be approved, even from the console", forced !== null, "the update was accepted");

  // ---------- reject, archive ----------
  const r1 = await mk(adminA, { title: "Wrong file", cat: "ia1" });
  await entry(adminA, r1.rows[0].id);
  await submit(adminA, r1.rows[0].id);
  t.check("central admin can reject with a reason", (await act(sup, r1.rows[0].id, "reject", "Not an official notice")).rows?.[0]?.s === "rejected");
  t.check("a rejected notice cannot be published", !!(await act(sup, r1.rows[0].id, "publish")).error);
  t.check("archiving removes a published notice from students", (await act(sup, n1, "archive")).rows?.[0]?.s === "archived" && !(await ids(stuA2)).includes(n1));

  // ---------- documents ----------
  const d2 = await mk(adminA, { title: "With PDF", cat: "ia3" });
  const n2 = d2.rows[0].id;
  const doc = (u, over = {}) => {
    const v = { path: `${adminA}/a1.pdf`, mime: "application/pdf", size: 120000, sha: SHA("a"), pages: 3, ...over };
    return t.as(u, `insert into public.exam_documents (notice_id, storage_path, original_filename, mime_type, size_bytes, sha256, page_count, uploaded_by)
                    values ($1, $2, 'official_notice.pdf', $3, $4, $5, $6, $7) returning id`, [v.nid ?? n2, v.path, v.mime, v.size, v.sha, v.pages, u]);
  };
  const dc = await doc(adminA);
  t.check("admin can attach the original PDF", !dc.error, dc.error);
  t.check("only a PDF or a photo (JPEG, PNG, WebP) is accepted", !!(await doc(adminA, { path: `${adminA}/b.pdf`, mime: "application/zip" })).error && !!(await doc(adminA, { path: `${adminA}/c.pdf`, mime: "image/gif" })).error);
  t.check("a photo of a notice is accepted", !(await doc(adminA, { path: `${adminA}/d.jpg`, mime: "image/jpeg", sha: SHA("d") })).error);
  t.check("files over 20 MB are refused", !!(await doc(adminA, { path: `${adminA}/c.pdf`, size: 25 * 1024 * 1024 })).error);
  t.check("the file fingerprint must be a sha-256", !!(await doc(adminA, { path: `${adminA}/d.pdf`, sha: "nothex" })).error);
  t.check("another department's admin cannot attach to it", !!(await doc(adminC, { path: `${adminC}/e.pdf`, sha: SHA("c") })).error);
  t.check("a student cannot attach documents", !!(await doc(stuA2, { path: `${stuA2}/f.pdf`, sha: SHA("d") })).error);
  t.check("the same file is flagged for the same department", (await t.as(adminA, "select * from public.exam_find_duplicates($1)", [SHA("a")])).rows.length === 1);
  t.check("another department's admin is not told about it", (await t.as(adminC, "select * from public.exam_find_duplicates($1)", [SHA("a")])).rows.length === 0);
  t.check("students cannot use duplicate search", (await t.as(stuA2, "select * from public.exam_find_duplicates($1)", [SHA("a")])).rows.length === 0);
  t.check("students cannot see a draft's document", (await t.as(stuA2, "select 1 from public.exam_documents")).rows.length === 0);

  // ---------- extraction data ----------
  const ex = await t.as(adminA, "insert into public.exam_extractions (document_id, status) values ($1, 'queued') returning id", [dc.rows[0].id]);
  t.check("admin can queue an extraction for their document", !ex.error, ex.error);
  t.check("extraction status is checked", !!(await t.as(adminA, "update public.exam_extractions set status = 'magic' where id = $1", [ex.rows[0].id])).error);
  t.check("admin can store results and corrections", (await t.as(adminA, `update public.exam_extractions set status = 'completed', result = '{"title":"x"}', field_meta = '{"title":{"confidence":0.9,"source":"explicit","pages":[1]}}', corrections = '{"title":"y"}' where id = $1`, [ex.rows[0].id])).rowCount === 1);
  t.check("another department's admin cannot read it", (await t.as(adminC, "select 1 from public.exam_extractions")).rows.length === 0);
  t.check("another department's admin cannot queue one", !!(await t.as(adminC, "insert into public.exam_extractions (document_id) values ($1)", [dc.rows[0].id])).error);

  // ---------- storage ----------
  const bucket = (await t.admin("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'exam-pdfs'")).rows[0];
  t.check("the bucket is private, 20 MB, PDF and photos only", bucket && bucket.public === false && Number(bucket.file_size_limit) === 20971520 && bucket.allowed_mime_types.join() === "application/pdf,image/jpeg,image/png,image/webp", JSON.stringify(bucket));
  const put = (u, name) => t.as(u, "insert into storage.objects (bucket_id, name, owner) values ('exam-pdfs', $1, $2) returning id", [name, u]);
  t.check("admin can upload into their own folder", !(await put(adminA, `${adminA}/a1.pdf`)).error);
  t.check("admin cannot upload into someone else's folder", !!(await put(adminA, `${adminC}/x.pdf`)).error);
  t.check("a student cannot upload", !!(await put(stuA2, `${stuA2}/x.pdf`)).error);
  const readable = async (u, name) => (await t.as(u, "select 1 from storage.objects where bucket_id = 'exam-pdfs' and name = $1", [name])).rows.length === 1;
  t.check("uploader can read their draft's PDF", await readable(adminA, `${adminA}/a1.pdf`));
  t.check("other department's admin cannot", !(await readable(adminC, `${adminA}/a1.pdf`)));
  t.check("a student cannot read a draft's PDF", !(await readable(stuA2, `${adminA}/a1.pdf`)));
  t.check("central admin can read it", await readable(sup, `${adminA}/a1.pdf`));
  // publish it: ia3 for AI & ML semester 2
  await entry(adminA, n2, { subject: "Maths", code: "21MA31" });
  await submit(adminA, n2); await act(sup, n2, "approve"); await act(sup, n2, "publish");
  t.check("matching student can read the original PDF once published", await readable(stuA2, `${adminA}/a1.pdf`));
  t.check("student of another semester cannot", !(await readable(stuA4, `${adminA}/a1.pdf`)));
  t.check("student of another department cannot", !(await readable(stuC2, `${adminA}/a1.pdf`)));
  t.check("matching student sees the document rows (the PDF and the photo)", (await t.as(stuA2, "select 1 from public.exam_documents where notice_id = $1", [n2])).rows.length === 2);
  t.check("students still never see extraction data", (await t.as(stuA2, "select 1 from public.exam_extractions")).rows.length === 0);
  t.check("uploader cannot delete a published notice's PDF", (await t.as(adminA, "delete from storage.objects where bucket_id = 'exam-pdfs' and name = $1", [`${adminA}/a1.pdf`])).rowCount === 0);

  // ---------- field rules ----------
  t.check("academic year must look like 2026-27", !!(await mk(adminA, { ay: "26-27", title: "bad year" })).error);
  t.check("result link must be http(s)", !!(await t.as(adminA, "update public.exam_notices set result_link = 'javascript:alert(1)' where id = $1", [sp.rows[0].id])).error);
  t.check("a normal result link is accepted", (await t.as(adminA, "update public.exam_notices set result_link = 'https://results.example.edu/ia' where id = $1", [sp.rows[0].id])).rowCount === 1);
  t.check("semester must be 1 to 8", !!(await mk(adminA, { sems: [9], title: "bad sem" })).error);
  t.check("a notice needs at least one department", !!(await t.as(adminA, "insert into public.exam_notices (title, audience_depts, created_by) values ('No dept', '{}', $1)", [adminA])).error);
  t.check("only a draft can be deleted", (await t.as(adminA, "delete from public.exam_notices where id = $1", [n2])).rowCount === 0 && (await t.as(adminA, "delete from public.exam_notices where id = $1", [un.rows[0].id])).rowCount === 1);

  // ---------- semester worked out from the batch ----------
  const bs = await t.user("batch", { branch: AIML, year: 1 });
  await t.admin("update public.profiles set batch = 2025, semester = null where id = $1", [bs]);
  const got = (await t.as(bs, "select public.exam_semester() s")).rows[0].s;
  t.check(`semester is worked out from the batch (2025 -> ${expectedSemester(2025)})`, got === expectedSemester(2025), String(got));
  await t.admin("update public.profiles set semester = 7 where id = $1", [bs]);
  t.check("a semester set on the profile wins", (await t.as(bs, "select public.exam_semester() s")).rows[0].s === 7);
  await t.admin("update public.profiles set batch = null, year = null, semester = null where id = $1", [bs]);
  t.check("unknown semester is null, not guessed", (await t.as(bs, "select public.exam_semester() s")).rows[0].s === null);
  t.check("students cannot change their own semester or admin departments", (await t.as(stuA2, "update public.profiles set semester = 8, admin_depts = '{}' where id = $1", [stuA2])).rowCount === 0);

  // ---------- the script can be run again ----------
  await t.admin("savepoint rerun");
  const again = await t.admin(fs.readFileSync(new URL("../dashboard-6-exams.sql", import.meta.url), "utf8")).then(() => null, (e) => e.message);
  if (again !== null) await t.admin("rollback to savepoint rerun");
  t.check("re-running dashboard-6-exams.sql is harmless", again === null, again);
  t.check("existing data survives a re-run", (await t.admin("select count(*)::int c from public.exam_notices")).rows[0].c > 0);
});
