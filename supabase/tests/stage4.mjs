import { run } from "../../scripts/rls-harness.mjs";

const CSE = "Computer Science & Engineering";

await run("Stage 4: community modules", async (t) => {
  const admin = await t.user("admin", { role: "admin" });
  const a = await t.user("alice", { branch: CSE, year: 2 });
  const b = await t.user("bob", { branch: CSE, year: 2 });
  const c = await t.user("carol", { branch: CSE, year: 4 });
  const raw = await t.user("raw", { status: "unverified", branch: null, year: null });

  // --- Connect ---
  const post = await t.as(a, "insert into public.connect_posts (kind, title, body, skills) values ('need', 'Need a frontend dev', 'React please', '{react}') returning id");
  t.check("student can post on Connect", !post.error, post.error);
  const pid = post.rows[0].id;
  t.check("another student sees the open post", (await t.as(b, "select 1 from public.connect_posts")).rows.length === 1);
  t.check("unverified user sees nothing", (await t.as(raw, "select 1 from public.connect_posts")).rows.length === 0);
  t.check("cannot post as someone else", !!(await t.as(b, "insert into public.connect_posts (author_id, kind, title, body) values ($1, 'need', 'Fake post', 'x')", [a])).error);
  t.check("cannot request your own post", !!(await t.as(a, "select public.request_connect($1, 'hi')", [pid])).error);
  t.check("bob can send a request", !(await t.as(b, "select public.request_connect($1, 'I know React')", [pid])).error);
  t.check("alice gets notified", (await t.as(a, "select 1 from public.notifications where title like 'Someone wants to team up%'")).rows.length === 1);
  const rid = (await t.as(a, "select id from public.connect_requests")).rows[0].id;
  t.check("contact hidden before acceptance", !!(await t.as(b, "select * from public.connect_contact($1)", [rid])).error);
  t.check("a third student cannot read the request", (await t.as(c, "select 1 from public.connect_requests")).rows.length === 0);
  t.check("requester cannot accept their own request", !!(await t.as(b, "select public.respond_connect($1, true)", [rid])).error);
  await t.as(a, "select public.respond_connect($1, true)", [rid]);
  const ct = await t.as(b, "select email from public.connect_contact($1)", [rid]);
  t.check("contact revealed to requester after acceptance", ct.rows.length === 1 && ct.rows[0].email.endsWith("@test.local") || ct.rows.length === 1, JSON.stringify(ct.rows));
  t.check("contact revealed to author too", (await t.as(a, "select email from public.connect_contact($1)", [rid])).rows.length === 1);
  t.check("outsider still cannot see contact", !!(await t.as(c, "select * from public.connect_contact($1)", [rid])).error);

  // --- blocks ---
  await t.as(a, "insert into public.blocks (blocker, blocked) values ($1, $2)", [a, c]);
  t.check("blocked user no longer sees the blocker's posts", (await t.as(c, "select 1 from public.connect_posts")).rows.length === 0);
  t.check("blocked user cannot contact the blocker", !!(await t.as(c, "select public.request_connect($1, 'hello')", [pid])).error);
  t.check("cannot block on behalf of someone else", !!(await t.as(b, "insert into public.blocks (blocker, blocked) values ($1, $2)", [a, b])).error);

  // --- reports and moderation ---
  t.check("student can report a post", !(await t.as(b, "insert into public.reports (reporter, kind, ref_id, reason) values ($1, 'connect_post', $2, 'spam')", [b, pid])).error);
  t.check("reporter cannot file for someone else", !!(await t.as(b, "insert into public.reports (reporter, kind, ref_id, reason) values ($1, 'connect_post', $2, 'spam')", [a, pid])).error);
  t.check("students cannot read others' reports", (await t.as(c, "select 1 from public.reports")).rows.length === 0);
  const q = await t.as(admin, "select * from public.report_queue()");
  t.check("admin sees the report with a preview", q.rows.length === 1 && /frontend/i.test(q.rows[0].preview || ""), JSON.stringify(q.rows));
  t.check("student cannot resolve reports", !!(await t.as(b, "select public.resolve_report($1, true)", [q.rows[0]?.id])).error);
  await t.as(admin, "select public.resolve_report($1, true, 'spam removed')", [q.rows[0].id]);
  t.check("removing hides the post from everyone", (await t.as(b, "select 1 from public.connect_posts")).rows.length === 0);

  // --- notes ---
  const note = await t.as(a, `insert into public.notes (title, subject, semester, file, sha256) values ('DS unit 1', 'Data Structures', 3, jsonb_build_object('name', 'ds.pdf', 'path', $1::text), 'aaa111') returning id`, [`${a}/ds.pdf`]);
  t.check("student can upload notes (pending)", !note.error, note.error);
  t.check("pending notes are hidden from others", (await t.as(b, "select 1 from public.notes")).rows.length === 0);
  t.check("uploader sees their own pending note", (await t.as(a, "select 1 from public.notes")).rows.length === 1);
  t.check("duplicate file is rejected", !!(await t.as(b, `insert into public.notes (title, subject, semester, file, sha256) values ('Same file', 'DS', 3, jsonb_build_object('name', 'c.pdf', 'path', $1::text), 'aaa111')`, [`${b}/c.pdf`])).error);
  t.check("student cannot approve their own note", !!(await t.as(a, "select public.review_note($1, true)", [note.rows[0].id])).error);
  await t.as(admin, "select public.review_note($1, true)", [note.rows[0].id]);
  t.check("approved notes are visible to other students", (await t.as(b, "select 1 from public.notes")).rows.length === 1);
  t.check("student can upvote", !(await t.as(b, "insert into public.note_votes (note_id, user_id) values ($1, $2)", [note.rows[0].id, b])).error);
  t.check("vote counts work", (await t.as(a, "select votes from public.note_vote_counts()")).rows[0].votes === 1);
  t.check("cannot vote twice", !!(await t.as(b, "insert into public.note_votes (note_id, user_id) values ($1, $2)", [note.rows[0].id, b])).error);

  // --- CampusXchange ---
  const li = await t.as(a, "insert into public.listings (title, price, category) values ('Used DSA book', 250, 'books') returning id");
  t.check("student can list an item", !li.error, li.error);
  const lid = li.rows[0].id;
  t.check("listing expires in about 30 days", (await t.admin("select expires_at > now() + interval '29 days' as ok from public.listings where id = $1", [lid])).rows[0].ok);
  t.check("another student can see it", (await t.as(b, "select 1 from public.listings")).rows.length === 1);
  t.check("buyer sends a request", !(await t.as(b, "select public.request_listing($1, 'Is it available?')", [lid])).error);
  const lr = (await t.as(a, "select id from public.listing_requests")).rows[0].id;
  t.check("no chat before the seller accepts", !!(await t.as(b, "insert into public.messages (request_id, body) values ($1, 'hello')", [lr])).error);
  await t.as(a, "select public.respond_listing($1, true)", [lr]);
  t.check("buyer can message after acceptance", !(await t.as(b, "insert into public.messages (request_id, body) values ($1, 'hello')", [lr])).error);
  t.check("seller can reply", !(await t.as(a, "insert into public.messages (request_id, body) values ($1, 'yes')", [lr])).error);
  t.check("outsider cannot read the chat", (await t.as(c, "select 1 from public.messages")).rows.length === 0);
  t.check("outsider cannot write in the chat", !!(await t.as(c, "insert into public.messages (request_id, body) values ($1, 'hi')", [lr])).error);
  t.check("participants read the whole chat", (await t.as(b, "select 1 from public.messages")).rows.length === 2);
  t.check("buyer cannot mark the item sold", (await t.as(b, "update public.listings set status = 'sold' where id = $1 returning id", [lid])).rows.length === 0);
  await t.as(a, "update public.listings set status = 'sold' where id = $1", [lid]);
  t.check("sold items disappear from browse", (await t.as(b, "select 1 from public.listings")).rows.length === 0);
  await t.admin("update public.listings set status = 'active', expires_at = now() - interval '1 day' where id = $1", [lid]);
  t.check("expired items disappear from browse", (await t.as(b, "select 1 from public.listings")).rows.length === 0);
  await t.admin("select public.expire_listings()");
  t.check("expiry job marks them expired", (await t.admin("select status from public.listings where id = $1", [lid])).rows[0].status === "expired");

  // --- mentors ---
  t.check("year 2 cannot become a mentor", !!(await t.as(b, "insert into public.mentor_profiles (user_id, domains) values ($1, '{web}')", [b])).error);
  t.check("year 4 can become a mentor", !(await t.as(c, "insert into public.mentor_profiles (user_id, domains, bio) values ($1, '{web,dsa}', 'Happy to help')", [c])).error);
  t.check("students can browse mentors", (await t.as(b, "select * from public.mentor_directory()")).rows.length === 1);
  t.check("mentee can request a mentor", !(await t.as(b, "select public.request_mentor($1, 'Help with DSA', 'please')", [c])).error);
  t.check("duplicate open request refused", !!(await t.as(b, "select public.request_mentor($1, 'Again', '')", [c])).error);
  const mr = (await t.as(c, "select id from public.mentor_requests")).rows[0].id;
  t.check("mentee cannot accept for the mentor", !!(await t.as(b, "select public.respond_mentor($1, true)", [mr])).error);
  await t.as(c, "select public.respond_mentor($1, true)", [mr]);
  t.check("mentor schedules a session", !(await t.as(c, "select public.schedule_session($1, now() + interval '2 days', 'Meet link')", [mr])).error);
  t.check("both sides got reminders", (await t.admin("select count(*)::int c from public.reminders where kind = 'mentor_session'")).rows[0].c === 4);
  const sid = (await t.as(b, "select id from public.mentor_sessions")).rows[0].id;
  t.check("cannot rate before the session is done", !!(await t.as(b, "select public.rate_session($1, 5, 'great')", [sid])).error);
  await t.as(c, "select public.complete_session($1)", [sid]);
  t.check("mentee can rate after the session", !(await t.as(b, "select public.rate_session($1, 5, 'great')", [sid])).error);
  t.check("rating shows in the directory", Number((await t.as(b, "select avg_rating from public.mentor_directory()")).rows[0].avg_rating) === 5);
  t.check("cannot rate twice", !!(await t.as(b, "select public.rate_session($1, 1, 'meh')", [sid])).error);
  t.check("mentor cannot rate their own session", !!(await t.as(c, "select public.rate_session($1, 5, 'x')", [sid])).error);
});
