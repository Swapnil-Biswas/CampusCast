import fs from "node:fs";
import { run } from "../../scripts/rls-harness.mjs";

const SHA = (c) => c.repeat(64);

await run("Stage 11: notes and question papers (details, checks, instant publishing)", async (t) => {
  const rawAdmin = t.admin.bind(t);
  t.admin = async (sql, params = []) => {
    await rawAdmin("select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true)");
    return rawAdmin(sql, params);
  };
  // the file must be safe to run twice
  await t.admin(fs.readFileSync(new URL("../dashboard-11-notes-papers.sql", import.meta.url), "utf8"));

  const adm = await t.user("admin", { role: "admin" });
  const ann = await t.user("ann", {});
  const bob = await t.user("bob", {});
  const raw = await t.user("raw", { status: "unverified" });

  const base = (u, over = {}) => ({
    kind: "paper", title: "BCS304 Data Structures · IA 1 · 2026", subject: "Data Structures", semester: 3, branch: "Computer Science & Engineering",
    path: `${u}/a.pdf`, sha: SHA("a"), code: "BCS304", exam: "ia1", year: 2026, desc: null, status: "pending", auto: false, ...over,
  });
  const mk = (u, over = {}) => {
    const v = base(u, over);
    return t.as(u, `insert into public.notes (kind, title, subject, semester, branch, file, sha256, course_code, exam_type, exam_year, description, status, auto_published)
      values ($1, $2, $3, $4, $5, jsonb_build_object('path', $6::text, 'name', 'a.pdf'), $7, $8, $9, $10, $11, $12, $13) returning id`,
      [v.kind, v.title, v.subject, v.semester, v.branch, v.path, v.sha, v.code, v.exam, v.year, v.desc, v.status, v.auto]);
  };
  const row = async (id) => (await t.admin("select * from public.notes where id = $1", [id])).rows[0];
  const check = (u, over = {}) => {
    const v = { path: `${u}/a.pdf`, sha: SHA("a"), passed: true, fields: { courseCode: "BCS304", courseName: "Data Structures", department: "Computer Science & Engineering", semester: 3, examType: "ia1", examYear: 2026 }, ...over };
    return t.admin(`insert into public.note_checks (path, uploader_id, sha256, passed, fields) values ($1, $2, $3, $4, $5)
      on conflict (path) do update set uploader_id = excluded.uploader_id, sha256 = excluded.sha256, passed = excluded.passed, fields = excluded.fields`, [v.path, u, v.sha, v.passed, JSON.stringify(v.fields)]);
  };
  const publish = async (id, sha = SHA("a")) => (await t.admin("select public.publish_checked_note($1, $2) ok", [id, sha])).rows[0].ok;

  // ---------- what may be uploaded ----------
  const first = await mk(ann);
  t.check("a student can upload a question paper with all its details", !first.error, first.error);
  const id = first.rows[0].id;
  t.check("it waits as pending", (await row(id)).status === "pending");
  t.check("a paper without a course code is refused", !!(await mk(ann, { code: null, sha: SHA("b") })).error);
  t.check("a paper without an exam is refused", !!(await mk(ann, { exam: null, sha: SHA("b") })).error);
  t.check("a paper without a year is refused", !!(await mk(ann, { year: null, sha: SHA("b") })).error);
  t.check("an unknown exam is refused", !!(await mk(ann, { exam: "ia4", sha: SHA("b") })).error);
  t.check("a badly written course code is refused", !!(await mk(ann, { code: "bcs 304", sha: SHA("b") })).error);
  t.check("class notes need no exam details", !(await mk(ann, { kind: "notes", code: null, exam: null, year: null, sha: SHA("c"), path: `${ann}/c.pdf` })).error);
  t.check("nobody can upload as already approved", !!(await mk(ann, { status: "approved", sha: SHA("d") })).error);
  t.check("nobody can mark their own upload as auto-published", !!(await mk(ann, { auto: true, sha: SHA("d") })).error);
  t.check("an upload cannot point at someone else's file", !!(await mk(bob, { path: `${ann}/a.pdf`, sha: SHA("e") })).error);
  t.check("an unverified user cannot upload", !!(await mk(raw, { sha: SHA("f") })).error);
  t.check("the same file cannot be uploaded twice", (await mk(bob, { path: `${bob}/a.pdf` })).code === "23505");
  t.check("other students do not see a pending paper", (await t.as(bob, "select id from public.notes where id = $1", [id])).rows.length === 0);
  t.check("a student cannot approve their own paper", ((await t.as(ann, "update public.notes set status = 'approved' where id = $1", [id])).rowCount || 0) === 0);

  // ---------- the AI check cannot be faked ----------
  t.check("a student cannot write a check", !!(await t.as(ann, "insert into public.note_checks (path, uploader_id, sha256, passed) values ($1, $2, $3, true)", [`${ann}/z.pdf`, ann, SHA("a")])).error);
  t.check("a student cannot call the publish function", !!(await t.as(ann, "select public.publish_checked_note($1, $2)", [id, SHA("a")])).error);
  t.check("without a check nothing is published", (await publish(id)) === false);
  await check(ann, { passed: false });
  t.check("a check that did not pass publishes nothing", (await publish(id)) === false);
  t.check("a student cannot turn a failed check into a pass", !!(await t.as(ann, "update public.note_checks set passed = true")).error);
  t.check("a student reads only their own check", (await t.as(ann, "select 1 from public.note_checks")).rows.length === 1 && (await t.as(bob, "select 1 from public.note_checks")).rows.length === 0);
  t.check("admins can read checks", (await t.as(adm, "select 1 from public.note_checks")).rows.length === 1);
  await check(ann);
  t.check("a changed file (different fingerprint) is not published", (await publish(id, SHA("9"))) === false);
  await t.admin("update public.note_checks set uploader_id = $1 where path = $2", [bob, `${ann}/a.pdf`]);
  t.check("a check belonging to someone else is not used", (await publish(id)) === false);
  await t.admin("update public.note_checks set uploader_id = $1 where path = $2", [ann, `${ann}/a.pdf`]);

  const edits = { course_code: "'BCS305'", exam_type: "'ia2'", exam_year: "2025", semester: "4", branch: "null", subject: "'Something else'", title: "'Free movie links'", description: "'hello'" };
  for (const [col, val] of Object.entries(edits)) {
    const before = (await row(id))[col];
    await t.admin(`update public.notes set ${col} = ${val} where id = $1`, [id]);
    t.check(`a ${col} that differs from the paper goes to an admin`, (await publish(id)) === false);
    await t.admin(`update public.notes set ${col} = $2 where id = $1`, [id, before]);
  }
  const published = await publish(id);
  t.check("a matching, passed paper is published at once", published === true);
  const live = await row(id);
  t.check("it is approved and marked as auto-published", live.status === "approved" && live.auto_published === true);
  t.check("other students now see it", (await t.as(bob, "select id from public.notes where id = $1", [id])).rows.length === 1);
  t.check("publishing is written to the audit log", (await t.admin("select 1 from public.audit_log where action = 'note.auto_published' and target_id = $1", [id])).rows.length === 1);
  t.check("it cannot be published twice", (await publish(id)) === false);

  // a paper with no readable course name, common to all departments
  const common = await mk(ann, { path: `${ann}/m.pdf`, sha: SHA("7"), code: "BMATS101", subject: "BMATS101", branch: null, semester: 1, exam: "final", title: "BMATS101 · Final · 2025", year: 2025 });
  await check(ann, { path: `${ann}/m.pdf`, sha: SHA("7"), fields: { courseCode: "BMATS101", courseName: null, department: null, semester: 1, examType: "final", examYear: 2025 } });
  t.check("a common paper without a course name can be published", (await publish(common.rows[0].id, SHA("7"))) === true);

  const noDept = await mk(ann, { path: `${ann}/n.pdf`, sha: SHA("6"), code: "BCS401", subject: "BCS401", title: "BCS401 · IA 2 · 2025", semester: 4, exam: "ia2", year: 2025 });
  await check(ann, { path: `${ann}/n.pdf`, sha: SHA("6"), fields: { courseCode: "BCS401", courseName: null, department: null, departmentKnown: false, semester: 4, examType: "ia2", examYear: 2025 } });
  t.check("when the paper shows no department, the student's choice is accepted", (await publish(noDept.rows[0].id, SHA("6"))) === true);

  // ---------- files cannot be swapped ----------
  await t.admin("insert into storage.objects (bucket_id, name) values ('notes', $1), ('notes', $2)", [`${ann}/a.pdf`, `${ann}/unused.pdf`]);
  const del = async (u, name) => (await t.as(u, "delete from storage.objects where bucket_id = 'notes' and name = $1", [name])).rowCount;
  t.check("the uploader cannot remove a file that a paper uses", (await del(ann, `${ann}/a.pdf`)) === 0);
  t.check("another student cannot remove it either", (await del(bob, `${ann}/unused.pdf`)) === 0);
  t.check("the uploader can remove an unused file", (await del(ann, `${ann}/unused.pdf`)) === 1);
  await t.as(ann, "delete from public.notes where id = $1", [id]);
  t.check("after deleting the paper, its file can be removed", (await del(ann, `${ann}/a.pdf`)) === 1);

  // ---------- AI reading limit ----------
  const claim = async (u) => (await t.as(u, "select public.claim_note_read() ok")).rows?.[0]?.ok;
  let allowed = 0;
  for (let i = 0; i < 23; i++) if (await claim(ann)) allowed++;
  t.check("a student gets 20 AI readings a day", allowed === 20, `${allowed}`);
  t.check("the limit is per student", (await claim(bob)) === true);
  t.check("unverified users get none", (await claim(raw)) === false);
  t.check("a student cannot reset their own count", !!(await t.as(ann, "delete from public.note_reads")).error);
});
