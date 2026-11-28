import fs from "node:fs";
import { run } from "../../scripts/rls-harness.mjs";

const SHA = (c) => c.repeat(64);

await run("Stage 12: workshops (drafts, publishing, posters, reminders, waitlist)", async (t) => {
  // After a signed-in step the session claims linger inside the transaction; clear them before every admin statement.
  const rawAdmin = t.admin.bind(t);
  t.admin = async (sql, params = []) => {
    await rawAdmin("select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true)");
    return rawAdmin(sql, params);
  };

  const adm = await t.user("admin", { role: "admin" });
  const clubA = await t.user("clubA", {});
  const clubB = await t.user("clubB", {});
  const s1 = await t.user("s1", {});
  const s2 = await t.user("s2", {});
  const s3 = await t.user("s3", {});
  const ece = await t.user("ece", { branch: "Electronics & Communication Engineering" });
  const raw = await t.user("raw", { status: "unverified" });
  await t.admin("insert into public.clubs (name, slug) values ('ZZ Club A', 'zz-a'), ('ZZ Club B', 'zz-b')");
  const [a, b] = (await t.admin("select id from public.clubs where slug in ('zz-a', 'zz-b') order by slug")).rows.map((r) => r.id);
  await t.admin("insert into public.club_admins (club_id, user_id) values ($1, $2), ($3, $4)", [a, clubA, b, clubB]);

  const mk = (u, { club = a, status = "draft", title = "Git workshop", days = 5, seats = 2 } = {}) =>
    t.as(u, `insert into public.workshops (title, club_id, status, starts_at, seats, organizer_id) values ($1, $2, $3, now() + make_interval(days => $4), $5, $6) returning id`,
      [title, club, status, days, seats, u]);
  const ids = async (u) => (await t.as(u, "select id from public.workshops")).rows.map((r) => r.id);
  const reg = (u, w) => t.as(u, "select public.register_workshop($1) as s", [w]);
  const status = async (w, u) => (await t.admin("select status from public.workshop_registrations where workshop_id = $1 and user_id = $2", [w, u])).rows[0]?.status;
  const reminders = async (w, u) => (await t.admin("select remind_at from public.reminders where kind = 'workshop' and ref_id = $1 and user_id = $2 and sent_at is null order by remind_at", [w, u])).rows;

  // ---------- workshops posted before this file stay visible ----------
  const old = (await t.admin("insert into public.workshops (title, starts_at) values ('Old workshop', now() + interval '4 days') returning id, status")).rows[0];
  t.check("an old workshop is published by default", old.status === "published");
  t.check("students still see it", (await ids(s1)).includes(old.id));

  // ---------- who can post ----------
  const d = await mk(clubA);
  t.check("a club admin can create a draft for their club", !d.error, d.error);
  const w = d.rows[0].id;
  t.check("a club admin cannot post for another club", !!(await mk(clubA, { club: b })).error);
  t.check("a club admin cannot post without a club", !!(await mk(clubA, { club: null })).error);
  t.check("a student cannot post", !!(await mk(s1)).error);
  t.check("an admin can post without a club", !(await mk(adm, { club: null })).error);
  t.check("a club admin cannot move a workshop to another club", !!(await t.as(clubA, "update public.workshops set club_id = $2 where id = $1", [w, b])).error);

  // ---------- drafts are private ----------
  t.check("students do not see drafts", !(await ids(s1)).includes(w));
  t.check("another club's admin does not", !(await ids(clubB)).includes(w));
  t.check("the club admin and the central admin do", (await ids(clubA)).includes(w) && (await ids(adm)).includes(w));
  t.check("no counts are given for a hidden draft", (await t.as(s1, "select 1 from public.workshop_counts() where workshop_id = $1", [w])).rows.length === 0);
  t.check("nobody can register for a draft", !!(await reg(s1, w)).error);
  t.check("a draft may have no date", !(await t.as(clubA, "insert into public.workshops (title, club_id, status, organizer_id) values ('Undated', $1, 'draft', $2)", [a, clubA])).error);
  t.check("a published one must have a date", !!(await t.as(clubA, "update public.workshops set status = 'published', starts_at = null where id = $1", [w])).error);

  // ---------- posters and AI readings ----------
  const path = `${clubA}/11111111-1111-1111-1111-111111111111.jpg`;
  t.check("an organiser can upload into their own folder", !(await t.as(clubA, "insert into storage.objects (bucket_id, name) values ('workshop-files', $1)", [path])).error);
  t.check("not into someone else's", !!(await t.as(clubA, "insert into storage.objects (bucket_id, name) values ('workshop-files', $1)", [`${clubB}/x.jpg`])).error);
  t.check("a student cannot upload", !!(await t.as(s1, "insert into storage.objects (bucket_id, name) values ('workshop-files', $1)", [`${s1}/x.jpg`])).error);
  const doc = await t.as(clubA, `insert into public.workshop_documents (workshop_id, storage_path, original_filename, mime_type, size_bytes, sha256, uploaded_by) values ($1, $2, 'p.jpg', 'image/jpeg', 10, $3, $4) returning id`, [w, path, SHA("a"), clubA]);
  t.check("the poster can be attached", !doc.error, doc.error);
  const docId = doc.rows[0].id;
  t.check("another club cannot attach to it", !!(await t.as(clubB, `insert into public.workshop_documents (workshop_id, storage_path, original_filename, mime_type, size_bytes, sha256, uploaded_by) values ($1, $2, 'p.jpg', 'image/jpeg', 10, $3, $4)`, [w, `${clubB}/y.jpg`, SHA("b"), clubB])).error);
  const own = (await mk(clubB, { club: b })).rows[0].id;
  t.check("nobody can attach somebody else's file", !!(await t.as(clubB, `insert into public.workshop_documents (workshop_id, storage_path, original_filename, mime_type, size_bytes, sha256, uploaded_by) values ($1, $2, 'p.jpg', 'image/jpeg', 10, $3, $4)`, [own, `${clubA}/z.jpg`, SHA("c"), clubB])).error);
  const ex = await t.as(clubA, "insert into public.workshop_extractions (document_id) values ($1) returning id", [docId]);
  t.check("the organiser can start a reading", !ex.error, ex.error);
  t.check("students cannot see readings", (await t.as(s1, "select 1 from public.workshop_extractions")).rows.length === 0);
  t.check("students cannot see a draft's poster", (await t.as(s1, "select 1 from storage.objects where bucket_id = 'workshop-files'")).rows.length === 0 && (await t.as(s1, "select 1 from public.workshop_documents")).rows.length === 0);
  t.check("duplicates are found for managers only", (await t.as(clubA, "select * from public.workshop_find_duplicates($1)", [SHA("a")])).rows.length === 1 && (await t.as(clubB, "select * from public.workshop_find_duplicates($1)", [SHA("a")])).rows.length === 0);

  // ---------- publishing ----------
  const pub = await t.as(clubA, "update public.workshops set status = 'published' where id = $1 returning published_at", [w]);
  t.check("the organiser publishes with no approval", !pub.error && pub.rows[0]?.published_at, pub.error);
  t.check("students now see it", (await ids(s1)).includes(w));
  t.check("and its poster", (await t.as(s1, "select 1 from storage.objects where bucket_id = 'workshop-files'")).rows.length === 1);
  t.check("unverified users see nothing", (await ids(raw)).length === 0);
  await t.as(clubA, "update public.workshops set audience_depts = array['Computer Science & Engineering'] where id = $1", [w]);
  t.check("the department limit still applies", !(await ids(ece)).includes(w));
  t.check("students cannot edit it", (await t.as(s1, "update public.workshops set title = 'Hacked' where id = $1 returning id", [w])).rows.length === 0);

  // ---------- seats, waitlist, reminders ----------
  t.check("two seats, third waits", (await reg(s1, w)).rows[0]?.s === "registered" && (await reg(s2, w)).rows[0]?.s === "registered" && (await reg(s3, w)).rows[0]?.s === "waitlist");
  t.check("registered students have two reminders", (await reminders(w, s1)).length === 2);
  t.check("the organiser can export attendees", (await t.as(clubA, "select * from public.workshop_attendees($1)", [w])).rows.length === 3);
  t.check("another club cannot", !!(await t.as(clubB, "select * from public.workshop_attendees($1)", [w])).error);
  await t.as(clubA, "update public.workshops set seats = 3 where id = $1", [w]);
  t.check("adding a seat moves the waitlist up", (await status(w, s3)) === "registered");
  t.check("and the student is told", (await t.as(s3, "select 1 from public.notifications where title like 'You got a seat%'")).rows.length === 1);
  t.check("with reminders", (await reminders(w, s3)).length === 2);

  await t.as(clubA, "update public.workshops set starts_at = starts_at + interval '2 days' where id = $1", [w]);
  const moved = await t.admin("select count(*)::int n, bool_and(r.remind_at in (w.starts_at - interval '24 hours', w.starts_at - interval '1 hour')) ok from public.reminders r join public.workshops w on w.id = r.ref_id where r.ref_id = $1", [w]);
  t.check("a new start time moves the reminders", moved.rows[0].ok && moved.rows[0].n === 6, JSON.stringify(moved.rows[0]));

  await t.as(clubA, "update public.workshops set status = 'cancelled' where id = $1", [w]);
  t.check("cancelling removes pending reminders", (await reminders(w, s1)).length === 0);
  t.check("students see it as cancelled", (await ids(s1)).includes(w));
  t.check("nobody can register for a cancelled one", !!(await reg(ece, w)).error);
  await t.as(s1, "select public.cancel_registration($1)", [w]);
  await t.as(clubA, "update public.workshops set status = 'published' where id = $1", [w]);
  t.check("publishing again restores reminders", (await reminders(w, s2)).length === 2);

  await t.as(clubA, "delete from public.workshops where id = $1", [w]);
  t.check("deleting removes the reminders", (await t.admin("select 1 from public.reminders where ref_id = $1", [w])).rows.length === 0);

  // ---------- safe to run again ----------
  const sql = fs.readFileSync(new URL("../dashboard-12-workshops.sql", import.meta.url), "utf8");
  let again = null;
  try { await t.admin(sql); } catch (e) { again = e.message; }
  t.check("the file can be run again", !again, again);
});
