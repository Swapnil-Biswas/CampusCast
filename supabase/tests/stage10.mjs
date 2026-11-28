// Stage 10: private resume files, saved AI drafts and the reading limit.
//   Live project:  PGPASSWORD=... node supabase/tests/stage10.mjs      (everything is rolled back)
//   No password:   node supabase/tests/runtest.mjs supabase/tests/stage10.mjs dashboard-10-connect-autofill.sql
import { run } from "../../scripts/rls-harness.mjs";

await run("Stage 10: Connect automatic filling (privacy and limits)", async (t) => {
  const rawAdmin = t.admin.bind(t);
  t.admin = async (sql, params = []) => {
    await rawAdmin("select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true)");
    return rawAdmin(sql, params);
  };
  const sup = await t.user("super", { role: "super_admin" });
  const adm = await t.user("admin", { role: "admin" });
  const asha = await t.user("asha", {});
  const ravi = await t.user("ravi", {});
  const raw = await t.user("raw", { status: "unverified" });

  const bucket = (await t.admin("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'profile-files'")).rows[0];
  t.check("the bucket exists and is private", !!bucket && bucket.public === false);
  t.check("it is limited to 8 MB, PDFs and photos", Number(bucket.file_size_limit) === 8388608 && bucket.allowed_mime_types.length === 4);

  const put = (u, owner) => t.as(u, "insert into storage.objects (bucket_id, name) values ('profile-files', $1)", [`${owner}/resume-x.pdf`]);
  t.check("a student can upload into their own folder", !(await put(asha, asha)).error);
  t.check("...not into someone else's", !!(await put(ravi, asha)).error);
  t.check("an unverified user cannot upload", !!(await put(raw, raw)).error);
  const seen = async (u) => (await t.as(u, "select name from storage.objects where bucket_id = 'profile-files'")).rows.length;
  t.check("the owner sees their file", (await seen(asha)) === 1);
  for (const [who, id] of [["another student", ravi], ["an admin", adm], ["a super-admin", sup]]) t.check(`${who} cannot see it`, (await seen(id)) === 0);
  t.check("another user cannot delete it", ((await t.as(ravi, "delete from storage.objects where bucket_id = 'profile-files'")).rowCount || 0) === 0);
  t.check("the owner can delete it", (await t.as(asha, "delete from storage.objects where bucket_id = 'profile-files'")).rowCount === 1);

  const draft = JSON.stringify({ fields: { headline: { value: "x", flag: "check" } } });
  const keep = (u, owner) => t.as(u, "insert into public.people_readings (user_id, draft) values ($1, $2) on conflict (user_id) do update set draft = excluded.draft", [owner, draft]);
  t.check("the owner can keep a draft", !(await keep(asha, asha)).error);
  t.check("and save it again", !(await keep(asha, asha)).error);
  t.check("nobody can write another person's draft", !!(await keep(ravi, asha)).error);
  t.check("an unverified user cannot keep a draft", !!(await keep(raw, raw)).error);
  for (const [who, id] of [["another student", ravi], ["a super-admin", sup]]) t.check(`${who} cannot read the draft`, (await t.as(id, "select * from public.people_readings")).rows.length === 0);
  t.check("a draft does not create or show a profile", (await t.admin("select count(*)::int n from public.people_profiles where user_id = $1", [asha])).rows[0].n === 0);
  t.check("a huge draft is refused", !!(await t.as(asha, "update public.people_readings set draft = $1 where user_id = $2", [JSON.stringify({ x: "a".repeat(70000) }), asha])).error);
  t.check("the owner can delete the draft", (await t.as(asha, "delete from public.people_readings where user_id = $1", [asha])).rowCount === 1);

  const claim = async (u) => t.as(u, "select public.use_profile_reading() ok");
  const results = [];
  for (let i = 0; i < 10; i++) results.push((await claim(asha)).rows[0].ok);
  t.check("eight readings an hour are allowed", results.slice(0, 8).every(Boolean));
  t.check("the ninth and tenth are refused", results[8] === false && results[9] === false);
  t.check("another person has their own limit", (await claim(ravi)).rows[0].ok === true);
  const reset = await t.as(asha, "update public.people_reading_quota set used = 0");
  t.check("nobody can reset their own count", !!reset.error || reset.rowCount === 0);
  const wipe = await t.as(asha, "delete from public.people_reading_quota");
  t.check("...or delete it", !!wipe.error || wipe.rowCount === 0);
  t.check("the count is still there", (await t.admin("select used from public.people_reading_quota where user_id = $1", [asha])).rows[0].used >= 9);
  await t.admin("update public.people_reading_quota set window_start = now() - interval '2 hours' where user_id = $1", [asha]);
  t.check("the limit resets after an hour", (await claim(asha)).rows[0].ok === true);
  t.check("an unverified user cannot start a reading", !!(await claim(raw)).error);
  t.check("anonymous visitors cannot call the limit function", (await t.admin("select has_function_privilege('anon', 'public.use_profile_reading()', 'execute') a")).rows[0].a === false);
});
