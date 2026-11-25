import fs from "node:fs";
import { run } from "../../scripts/rls-harness.mjs";

const SHA = (c) => c.repeat(64);

await run("Stage 8: hackathons (details, documents, access)", async (t) => {
  // After a signed-in step the session claims linger inside the transaction; clear them before every admin statement.
  const rawAdmin = t.admin.bind(t);
  t.admin = async (sql, params = []) => {
    await rawAdmin("select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true)");
    return rawAdmin(sql, params);
  };

  const sup = await t.user("super", { role: "super_admin" });
  const adm = await t.user("admin", { role: "admin" });
  const clubA = await t.user("clubA", {});          // a student who is admin of the Coding Club
  const clubB = await t.user("clubB", {});          // a student who is admin of another club
  const stu = await t.user("student", {});
  const raw = await t.user("raw", { status: "unverified" });
  const [coding, other] = (await t.admin("select id, slug from public.clubs order by slug")).rows.filter((c) => ["coding", "cultural", "robotics", "drama", "music", "sports"].includes(c.slug) || true).slice(0, 2).map((c) => c.id);
  await t.admin("insert into public.club_admins (club_id, user_id) values ($1, $2), ($3, $4)", [coding, clubA, other, clubB]);

  const base = { title: "Campus Build Sprint 2026", theme: "Open innovation", mode: "offline", club: coding, status: "draft", starts: "2026-12-12T09:00:00+05:30", deadline: "2026-12-10T18:00:00+05:30" };
  const mk = (u, over = {}) => {
    const v = { ...base, ...over };
    return t.as(u, `insert into public.hackathons (title, theme, mode, club_id, status, starts_at, deadline, created_by) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [v.title, v.theme, v.mode, v.club, v.status, v.starts, v.deadline, u]);
  };
  const ids = async (u) => (await t.as(u, "select id from public.hackathons")).rows.map((r) => r.id);
  const status = async (id) => (await t.admin("select status from public.hackathons where id = $1", [id])).rows[0].status;

  // ---------- hackathons posted before this file keep working ----------
  const old = (await t.admin("insert into public.hackathons (title, theme, mode, deadline) values ('Old style hackathon', 'AI', 'online', now() + interval '5 days') returning id, status")).rows[0];
  t.check("an old hackathon is published by default", old.status === "published");
  t.check("students still see it", (await ids(stu)).includes(old.id));
  t.check("its registration deadline is also its 'closes' time", (await t.admin("select registration_closes = deadline ok from public.hackathons where id = $1", [old.id])).rows[0].ok);

  // ---------- the college's clubs are there ----------
  const wanted = ["Coding Club", "GenAI Club", "OSCode Club", "ASTRA Club", "AR/VR Hub", "E-Yantra Club", "IEEE Computer Society", "IEEE Robotics and Automation Society", "IEEE Computational Intelligence Society", "IEEE Signal Processing Society", "IEEE Communications Society", "IEEE Aerospace and Electronic Systems Society", "IEEE Circuits and Systems Society", "IETE Club", "ISTE Club", "BMESI Club", "ICE Student Chapter", "Motorheads Club", "Access Denied Club", "Money Plant Club", "Alterino Club", "Epoch Society", "NODE – Network of Decentralised Engineers"];
  const have = (await t.admin("select name, count(*)::int n from public.clubs where name = any($1) group by name", [wanted])).rows;
  t.check("all 23 of the college's clubs exist", have.length === 23, `${have.length} found`);
  t.check("each club exists exactly once (Coding Club was already there)", have.every((r) => r.n === 1));
  t.check("students can read the club list", (await t.as(stu, "select count(*)::int n from public.clubs where name = any($1)", [wanted])).rows[0].n === 23);
  t.check("a student cannot add or rename a club", !!(await t.as(stu, "insert into public.clubs (name, slug) values ('Fake Club', 'fake-club')")).error);
  t.check("the club slugs are clean web names", (await t.admin("select count(*)::int n from public.clubs where name = any($1) and slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'", [wanted])).rows[0].n === 0);

  // ---------- who can post ----------
  const d1 = await mk(clubA);
  t.check("a club admin can create a draft for their own club", !d1.error, d1.error);
  const h1 = d1.rows[0].id;
  t.check("a club admin cannot post for another club", !!(await mk(clubA, { club: other })).error);
  t.check("a club admin cannot post with no club", !!(await mk(clubA, { club: null })).error);
  t.check("an ordinary student cannot post", !!(await mk(stu)).error);
  t.check("an unverified user cannot post", !!(await mk(raw)).error);
  t.check("an admin can post with no club (another organizer)", !(await mk(adm, { club: null, title: "Society hackathon" })).error);

  // ---------- who sees drafts ----------
  t.check("the club admin sees their own draft", (await ids(clubA)).includes(h1));
  t.check("another club's admin does not", !(await ids(clubB)).includes(h1));
  t.check("students do not see drafts", !(await ids(stu)).includes(h1));
  t.check("unverified users see nothing", (await ids(raw)).length === 0);
  t.check("admins see every draft", (await ids(adm)).includes(h1) && (await ids(sup)).includes(h1));

  // ---------- all the details ----------
  const full = await t.as(clubA, `update public.hackathons set
      organizer_name = 'Coding Club, BMSIT', tagline = '24 hours, one idea', ends_at = '2026-12-13T09:00:00+05:30', registration_opens_at = '2026-11-20T10:00:00+05:30',
      location = 'Seminar Hall 2, Block A', map_url = 'https://maps.example.com/x', prize_amount = 50000, prize_breakdown = '[{"label":"First","amount":25000},{"label":"Second","amount":15000}]',
      fee_amount = 0, fee_note = 'Free for all students', eligibility = 'All B.E. students', tracks = array['AI', 'Web'], team_min = 2, team_max = 4,
      contact_name = 'Aarav', contact_phone = '+91 98450 12345', contact_email = 'codingclub@bmsit.in', website_url = 'https://buildsprint.example.com', link = 'https://buildsprint.example.com/register',
      schedule = '[{"at":"2026-12-12T09:00:00+05:30","title":"Registration and breakfast"},{"at":"2026-12-12T10:30:00+05:30","title":"Opening ceremony","note":"Main hall"}]',
      details = '{"perks":["Certificates"],"sponsors":["Acme"]}' where id = $1`, [h1]);
  t.check("every new detail can be saved", !full.error, full.error);

  const bad = async (label, set) => t.check(`refused: ${label}`, !!(await t.as(clubA, `update public.hackathons set ${set} where id = $1`, [h1])).error);
  await bad("an unknown status", "status = 'archived'");
  await bad("ending before it starts", "ends_at = '2026-12-01T09:00:00+05:30'");
  await bad("registration opening after it closes", "registration_opens_at = '2026-12-11T09:00:00+05:30'");
  await bad("a negative prize pool", "prize_amount = -1");
  await bad("a negative fee", "fee_amount = -5");
  await bad("a javascript: website link", "website_url = 'javascript:alert(1)'");
  await bad("a map link without http(s)", "map_url = 'ftp://x'");
  await bad("a phone number with letters", "contact_phone = 'call me'");
  await bad("a broken email address", "contact_email = 'not-an-email'");
  await bad("a schedule that is not a list", `schedule = '{"a":1}'`);
  await bad("more than 100 schedule entries", "schedule = (select jsonb_agg(jsonb_build_object('at', now(), 'title', 'x')) from generate_series(1, 101))");
  await bad("more than 20 prizes", "prize_breakdown = (select jsonb_agg(jsonb_build_object('label', 'x')) from generate_series(1, 21))");
  // ---------- outside the campus: the venue pin and the route ----------
  const pin = await t.as(clubA, "update public.hackathons set off_campus = true, venue_address = 'EPIP Zone, Whitefield, Bengaluru', venue_lat = 12.966654, venue_lng = 77.711623, route_km = 36.9, route_minutes = 42, route_source = 'road' where id = $1", [h1]);
  t.check("a club admin can mark a hackathon as outside the campus, with a pin and a measured route", !pin.error, pin.error);
  const row = (await t.admin("select off_campus, venue_lat, venue_lng, route_km, route_minutes, route_source from public.hackathons where id = $1", [h1])).rows[0];
  t.check("the pin and route are stored exactly", row.off_campus === true && Number(row.venue_lat) === 12.966654 && Number(row.venue_lng) === 77.711623 && Number(row.route_km) === 36.9 && row.route_minutes === 42 && row.route_source === "road", JSON.stringify(row));
  await bad("a pin with a latitude but no longitude", "venue_lng = null");
  await bad("a latitude beyond 90 degrees", "venue_lat = 95");
  await bad("a longitude beyond 180 degrees", "venue_lng = 181");
  await bad("a route source that is not road or straight", "route_source = 'teleport'");
  await bad("a negative distance", "route_km = -3");
  await bad("a negative travel time", "route_minutes = -1");
  t.check("a straight-line distance can be stored with no travel time", !(await t.as(clubA, "update public.hackathons set route_km = 24.2, route_minutes = null, route_source = 'straight' where id = $1", [h1])).error);
  t.check("a hackathon on campus needs no pin, and new ones default to on campus", (await t.admin("insert into public.hackathons (title, theme, mode, deadline) values ('On campus one', 'x', 'offline', now() + interval '2 days') returning off_campus, venue_lat")).rows[0].off_campus === false);
  t.check("students can read the pin and distance of a published hackathon", await (async () => { await t.as(clubA, "update public.hackathons set status = 'published' where id = $1", [h1]); const r = (await t.as(stu, "select off_campus, venue_lat, route_km from public.hackathons where id = $1", [h1])).rows[0]; return r && r.off_campus === true && Number(r.route_km) === 24.2; })());
  await t.as(clubA, "update public.hackathons set status = 'draft' where id = $1", [h1]);
  t.check("the schedule is kept in order as written", JSON.stringify((await t.admin("select schedule from public.hackathons where id = $1", [h1])).rows[0].schedule.map((s) => s.title)) === JSON.stringify(["Registration and breakfast", "Opening ceremony"]));

  // ---------- publishing needs no approval ----------
  const noDates = await mk(clubA, { starts: null, deadline: null, title: "Poster without dates" });
  t.check("a draft may have no dates yet", !noDates.error, noDates.error);
  t.check("it cannot be published without a deadline or start", !!(await t.as(clubA, "update public.hackathons set status = 'published' where id = $1", [noDates.rows[0].id])).error);
  const notesBefore = (await t.admin("select count(*)::int n from public.notifications")).rows[0].n;
  t.check("the club admin publishes their own hackathon straight away", !(await t.as(clubA, "update public.hackathons set status = 'published' where id = $1", [h1])).error);
  t.check("no notification is sent about hackathons", (await t.admin("select count(*)::int n from public.notifications")).rows[0].n === notesBefore);
  t.check("it is now published, with a publish time", (await status(h1)) === "published" && (await t.admin("select published_at is not null ok from public.hackathons where id = $1", [h1])).rows[0].ok);
  t.check("students now see it", (await ids(stu)).includes(h1));
  t.check("registration closes at the deadline", (await t.admin("select registration_closes = deadline ok from public.hackathons where id = $1", [h1])).rows[0].ok);
  t.check("with no deadline, registration closes at the start", (await t.admin("insert into public.hackathons (title, theme, mode, starts_at) values ('Start only', 'x', 'online', '2027-01-01T10:00:00+05:30') returning registration_closes = starts_at ok")).rows[0].ok);
  t.check("another club's admin cannot change it", (await t.as(clubB, "update public.hackathons set title = 'Hijacked' where id = $1", [h1])).rowCount === 0);
  t.check("a student cannot change it", (await t.as(stu, "update public.hackathons set title = 'Hijacked' where id = $1", [h1])).rowCount === 0);
  t.check("a club admin can cancel it, and students still see it as cancelled", !(await t.as(clubA, "update public.hackathons set status = 'cancelled' where id = $1", [h1])).error && (await t.as(stu, "select status from public.hackathons where id = $1", [h1])).rows[0]?.status === "cancelled");
  await t.as(clubA, "update public.hackathons set status = 'published' where id = $1", [h1]);
  const log = (await t.admin("select action from public.audit_log where target_id = $1 order by id", [h1])).rows.map((r) => r.action);
  t.check("publishing and cancelling are written to the audit log", log.includes("hackathon.published") && log.includes("hackathon.cancelled"), JSON.stringify(log));
  t.check("a club admin can delete their own draft", !!(await t.as(clubA, "delete from public.hackathons where id = $1", [noDates.rows[0].id])) && (await ids(clubA)).every((i) => i !== noDates.rows[0].id));

  // ---------- documents ----------
  const doc = (u, hid, over = {}) => {
    const v = { path: `${u}/p1.jpg`, mime: "image/jpeg", size: 90000, sha: SHA("a"), ...over };
    return t.as(u, `insert into public.hackathon_documents (hackathon_id, storage_path, original_filename, mime_type, size_bytes, sha256, page_count, uploaded_by) values ($1, $2, 'poster.jpg', $3, $4, $5, 1, $6) returning id`, [hid, v.path, v.mime, v.size, v.sha, u]);
  };
  const dd = await doc(clubA, h1);
  t.check("a club admin can attach a poster photo to their hackathon", !dd.error, dd.error);
  t.check("another club's admin cannot", !!(await doc(clubB, h1, { path: `${clubB}/p2.jpg`, sha: SHA("b") })).error);
  t.check("a student cannot", !!(await doc(stu, h1, { path: `${stu}/p3.jpg`, sha: SHA("c") })).error);
  t.check("only a PDF or a photo is accepted", !!(await doc(clubA, h1, { path: `${clubA}/z.zip`, mime: "application/zip", sha: SHA("d") })).error && !!(await doc(clubA, h1, { path: `${clubA}/g.gif`, mime: "image/gif", sha: SHA("e") })).error);
  t.check("a PDF brochure is accepted too", !(await doc(clubA, h1, { path: `${clubA}/b.pdf`, mime: "application/pdf", sha: SHA("f") })).error);
  t.check("students see the documents of a published hackathon", (await t.as(stu, "select id from public.hackathon_documents where hackathon_id = $1", [h1])).rows.length === 2);
  const h2 = (await mk(clubA, { title: "Draft with poster" })).rows[0].id;
  await doc(clubA, h2, { path: `${clubA}/draft.jpg`, sha: SHA("1") });
  t.check("students do not see the documents of a draft", (await t.as(stu, "select id from public.hackathon_documents where hackathon_id = $1", [h2])).rows.length === 0);
  t.check("the same file is detected for the club admin who uploaded it", (await t.as(clubA, "select * from public.hackathon_find_duplicates($1)", [SHA("a")])).rows.length === 1);
  t.check("another club's admin is not told about it", (await t.as(clubB, "select * from public.hackathon_find_duplicates($1)", [SHA("a")])).rows.length === 0);
  t.check("signed-out visitors cannot call the duplicate check", (await t.admin("select has_function_privilege('anon', 'public.hackathon_find_duplicates(text)', 'execute') a")).rows[0].a === false);

  // ---------- what the AI read ----------
  const ex = await t.as(clubA, "insert into public.hackathon_extractions (document_id, status) values ($1, 'queued') returning id", [dd.rows[0].id]);
  t.check("a club admin can queue a reading of their own document", !ex.error, ex.error);
  t.check("they can read the result", (await t.as(clubA, "select id from public.hackathon_extractions")).rows.length === 1);
  t.check("another club's admin cannot", (await t.as(clubB, "select id from public.hackathon_extractions")).rows.length === 0);
  t.check("students never see extraction data", (await t.as(stu, "select id from public.hackathon_extractions")).rows.length === 0);
  t.check("another club's admin cannot queue a reading", !!(await t.as(clubB, "insert into public.hackathon_extractions (document_id, status) values ($1, 'queued')", [dd.rows[0].id])).error);

  // ---------- storage ----------
  const bucket = (await t.admin("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'hackathon-files'")).rows[0];
  t.check("the poster bucket is private, 20 MB, PDF and photos only", bucket && bucket.public === false && Number(bucket.file_size_limit) === 20971520 && bucket.allowed_mime_types.join() === "application/pdf,image/jpeg,image/png,image/webp", JSON.stringify(bucket));
  const put = (u, path) => t.as(u, "insert into storage.objects (bucket_id, name, owner) values ('hackathon-files', $1, $2)", [path, u]);
  t.check("a club admin can upload into their own folder", !(await put(clubA, `${clubA}/new.jpg`)).error);
  t.check("but not into someone else's folder", !!(await put(clubA, `${clubB}/new.jpg`)).error);
  t.check("an ordinary student cannot upload at all", !!(await put(stu, `${stu}/new.jpg`)).error);
  for (const f of ["p1.jpg", "draft.jpg"]) await t.admin("insert into storage.objects (bucket_id, name, owner) values ('hackathon-files', $1, $2)", [`${clubA}/${f}`, clubA]);
  const readable = async (u, path) => (await t.as(u, "select name from storage.objects where bucket_id = 'hackathon-files' and name = $1", [path])).rows.length === 1;
  t.check("students can read the poster of a published hackathon", await readable(stu, `${clubA}/p1.jpg`));
  t.check("students cannot read the poster of a draft", !(await readable(stu, `${clubA}/draft.jpg`)));

  // ---------- interest still works ----------
  t.check("a student can mark interest in a published hackathon", !(await t.as(stu, "insert into public.hackathon_interest (hackathon_id, user_id) values ($1, $2)", [h1, stu])).error);
  t.check("the interest count works", (await t.as(stu, "select interested from public.hackathon_counts() where hackathon_id = $1", [h1])).rows[0]?.interested === 1);

  // ---------- safe to run again ----------
  await t.admin("savepoint rerun");
  const again = await t.admin(fs.readFileSync(new URL("../dashboard-8-hackathons.sql", import.meta.url), "utf8")).then(() => null, (e) => e.message);
  t.check("re-running dashboard-8-hackathons.sql is harmless", again === null, again || "");
  if (again) await t.admin("rollback to savepoint rerun");
  t.check("existing data survives a re-run", (await t.admin("select count(*)::int n from public.hackathons where id = $1", [h1])).rows[0].n === 1);
});
