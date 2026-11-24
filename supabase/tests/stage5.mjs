import { run } from "../../scripts/rls-harness.mjs";

const CSE = "Computer Science & Engineering";

await run("Stage 5: alerts", async (t) => {
  const a = await t.user("alice", { branch: CSE, year: 2 });
  const b = await t.user("bob", { branch: CSE, year: 2 });
  const raw = await t.user("raw", { status: "unverified", branch: null, year: null });
  await t.admin("insert into public.app_private (key, value) values ('job_secret', 'test-secret') on conflict (key) do update set value = excluded.value");
  const outbox = (uid) => t.admin("select channel, kind, status, send_after <= now() as due from public.outbox where user_id = $1 order by id", [uid]);

  // --- urgent notification -> email (push only when subscribed and enabled) ---
  await t.admin("insert into public.notifications (user_id, kind, title, urgency) values ($1, 'announcement', 'Exam moved', 0)", [a]);
  let o = await outbox(a);
  t.check("urgent notice queues an email", o.rows.length === 1 && o.rows[0].channel === "email");
  await t.admin("insert into public.notifications (user_id, kind, title, urgency) values ($1, 'announcement', 'Library hours', 2)", [a]);
  t.check("a Soon notice is left for the digest", (await outbox(a)).rows.length === 1);

  await t.as(a, "insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/1', 'k', 'a')", [a]);
  await t.as(a, "insert into public.notification_prefs (user_id, push) values ($1, true) on conflict (user_id) do update set push = true", [a]);
  await t.admin("insert into public.notifications (user_id, kind, title, urgency) values ($1, 'announcement', 'Lab cancelled', 1)", [a]);
  o = await outbox(a);
  t.check("with push on and a device, push is queued too", o.rows.filter((r) => r.channel === "push").length === 1);

  // --- preferences are respected ---
  await t.as(b, "insert into public.notification_prefs (user_id, email) values ($1, false)", [b]);
  await t.admin("insert into public.notifications (user_id, kind, title, urgency) values ($1, 'announcement', 'Hello', 0)", [b]);
  t.check("email off means no email", (await outbox(b)).rows.length === 0);
  t.check("unverified users get no alerts", (await t.admin("insert into public.notifications (user_id, kind, title, urgency) values ($1, 'announcement', 'x', 0) returning id", [raw]), (await outbox(raw)).rows.length === 0));

  // --- quiet hours delay normal reminders but not urgent notices ---
  await t.as(b, "update public.notification_prefs set email = true, quiet_start = 0, quiet_end = 23, urgent_overrides_quiet = true where user_id = $1", [b]);
  await t.admin("insert into public.notifications (user_id, kind, title, urgency) values ($1, 'reminder', 'Reminder: viva', 1)", [b]);
  t.check("urgent reminder ignores quiet hours when allowed", (await outbox(b)).rows.at(-1)?.due === true);
  await t.as(b, "update public.notification_prefs set urgent_overrides_quiet = false where user_id = $1", [b]);
  await t.admin("insert into public.notifications (user_id, kind, title, urgency) values ($1, 'reminder', 'Reminder: viva 2', 1)", [b]);
  const last = (await outbox(b)).rows.at(-1);
  const hourNow = (await t.admin("select extract(hour from (now() at time zone 'Asia/Kolkata'))::int h")).rows[0].h;
  t.check("inside quiet hours the message is held back", hourNow >= 23 ? last.due === true : last.due === false, JSON.stringify(last));

  // --- reminders ---
  await t.as(a, "insert into public.reminders (user_id, kind, ref_id, title, remind_at) values ($1, 'exam', gen_random_uuid(), 'Maths exam', now() - interval '1 minute')", [a]);
  await t.as(a, "insert into public.reminders (user_id, kind, ref_id, title, remind_at) values ($1, 'exam', gen_random_uuid(), 'Far away', now() + interval '2 days')", [a]);
  const n = (await t.admin("select public.due_reminders() n")).rows[0].n;
  t.check("only the due reminder fires", n === 1);
  t.check("it becomes a notification", (await t.as(a, "select 1 from public.notifications where title = 'Reminder: Maths exam'")).rows.length === 1);
  t.check("and is not sent twice", (await t.admin("select public.due_reminders() n")).rows[0].n === 0);
  t.check("students cannot call the reminder job", !!(await t.as(a, "select public.due_reminders()")).error);

  // --- digest ---
  const d1 = (await t.admin("select public.build_digests() n")).rows[0].n;
  t.check("digest built for students with non-urgent news", d1 >= 1);
  const d2 = (await t.admin("select public.build_digests() n")).rows[0].n;
  const digests = (await t.admin("select count(*)::int c from public.outbox where user_id = $1 and kind = 'digest'", [a])).rows[0].c;
  t.check("running it twice sends one digest per day", digests === 1, `digests=${digests} second run=${d2}`);
  t.check("students cannot build digests", !!(await t.as(a, "select public.build_digests()")).error);

  // --- outbox is private; dispatcher needs the secret ---
  t.check("students cannot read the outbox", !!(await t.as(a, "select * from public.outbox")).error || (await t.as(a, "select * from public.outbox")).rows.length === 0);
  t.check("students cannot write the outbox", !!(await t.as(a, "insert into public.outbox (user_id, channel, subject) values ($1, 'email', 'spam')", [a])).error);
  t.check("job secret table is private", !!(await t.as(a, "select * from public.app_private")).error);
  t.check("dispatcher refuses a wrong secret", !!(await t.as(null, "select public.dispatch_claim('nope', 5)")).error);
  const claim = await t.as(null, "select public.dispatch_claim('test-secret', 50) j");
  t.check("dispatcher with the secret receives due messages", !claim.error && claim.rows[0].j.length >= 2, claim.error);
  t.check("claimed messages carry the address", claim.rows[0].j.every((x) => x.email));
  const first = claim.rows[0].j[0];
  await t.as(null, "select public.dispatch_finish('test-secret', $1, true)", [first.id]);
  t.check("finishing marks it sent", (await t.admin("select status from public.outbox where id = $1", [first.id])).rows[0].status === "sent");
  await t.as(null, "select public.dispatch_finish('test-secret', $1, false, 'smtp down')", [claim.rows[0].j[1].id]);
  t.check("a failure is retried later, not lost", (await t.admin("select status from public.outbox where id = $1", [claim.rows[0].j[1].id])).rows[0].status === "pending");

  // --- test alert and profile ---
  t.check("student can send themself a test alert", !(await t.as(a, "select public.send_test_alert()")).error);
  t.check("unverified user cannot", !!(await t.as(raw, "select public.send_test_alert()")).error);
  t.check("profile edit works", !(await t.as(a, "select public.update_my_profile('Hi', '{react, python}', '{music}', 'B')")).error);
  t.check("role cannot be changed through the profile", !!(await t.as(a, "update public.profiles set role = 'super_admin' where id = $1", [a])).error || (await t.admin("select role from public.profiles where id = $1", [a])).rows[0].role === "student");
});
