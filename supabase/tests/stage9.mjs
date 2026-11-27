// Stage 9: Connect people profiles (students and faculty).
//   Live project:  PGPASSWORD=... node supabase/tests/stage9.mjs      (everything is rolled back)
//   No password:   node supabase/tests/runtest.mjs supabase/tests/stage9.mjs
import { run } from "../../scripts/rls-harness.mjs";

const LI = (h) => `https://www.linkedin.com/in/${h}`;

await run("Stage 9: Connect people profiles", async (t) => {
  // After a signed-in step the session claims linger inside the transaction; clear them before every admin statement.
  const rawAdmin = t.admin.bind(t);
  t.admin = async (sql, params = []) => {
    await rawAdmin("select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true)");
    return rawAdmin(sql, params);
  };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const sup = await t.user("super", { role: "super_admin" });
  const adm = await t.user("admin", { role: "admin" });
  const asha = await t.user("asha", {});                                                   // student, CSE
  const ravi = await t.user("ravi", { branch: "Mechanical Engineering", year: 3 });        // student, Mech
  const nina = await t.user("nina", {});                                                   // student, never opts in
  const prof = await t.user("prof", { branch: "Computer Science & Engineering" });
  const raw = await t.user("raw", { status: "unverified" });
  await t.as(sup, "select public.set_person_type($1, 'faculty')", [prof]);

  const save = (u, over = {}) => {
    const v = { visible: false, headline: null, about: null, skills: [], interests: [], linkedin: null, show_email: false, ...over };
    return t.as(u, `insert into public.people_profiles (user_id, visible, headline, about, skills, interests, linkedin_url, show_email)
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      on conflict (user_id) do update set visible = excluded.visible, headline = excluded.headline, about = excluded.about, skills = excluded.skills,
        interests = excluded.interests, linkedin_url = excluded.linkedin_url, show_email = excluded.show_email`,
      [u, v.visible, v.headline, v.about, v.skills, v.interests, v.linkedin, v.show_email]);
  };
  const dir = (u, ...a) => t.as(u, "select * from public.people_directory($1, $2, $3, $4)", [a[0] ?? null, a[1] ?? null, a[2] ?? null, a[3] ?? null]);
  const dirIds = async (u, ...a) => (await dir(u, ...a)).rows?.map((r) => r.id) || [];
  const names = async (u, ...a) => (await dir(u, ...a)).rows.map((r) => r.full_name).sort();
  const person = async (viewer, id) => (await t.as(viewer, "select * from public.person_profile($1)", [id])).rows;

  // ---------- student or faculty ----------
  t.check("everyone starts as a student", (await t.admin("select count(*)::int n from public.profiles where id = any($1) and person_type = 'student'", [[asha, ravi, nina, raw]])).rows[0].n === 4);
  t.check("a super-admin marked the professor as faculty", (await t.admin("select person_type from public.profiles where id = $1", [prof])).rows[0].person_type === "faculty");
  t.check("that change is in the audit log", (await t.admin("select count(*)::int n from public.audit_log where action = 'person.type_changed' and target_id = $1", [prof])).rows[0].n === 1);
  t.check("a student cannot make themselves faculty (function)", !!(await t.as(asha, "select public.set_person_type($1, 'faculty')", [asha])).error);
  const direct = await t.as(asha, "update public.profiles set person_type = 'faculty' where id = $1", [asha]);
  t.check("a student cannot make themselves faculty (direct update)", !!direct.error || direct.rowCount === 0);
  t.check("...and is still a student", (await t.admin("select person_type from public.profiles where id = $1", [asha])).rows[0].person_type === "student");
  t.check("a plain admin cannot set the type either", !!(await t.as(adm, "select public.set_person_type($1, 'faculty')", [asha])).error);
  t.check("only student and faculty are valid types", !!(await t.as(sup, "select public.set_person_type($1, 'dean')", [asha])).error);
  let badType = false;
  try { await t.c.query("savepoint pt"); await t.c.query("update public.profiles set person_type = 'dean' where id = $1", [asha]); } catch { badType = true; await t.c.query("rollback to savepoint pt"); }
  t.check("the table itself refuses any other type", badType);

  // ---------- opt-in visibility ----------
  t.check("a student can create their own profile", !(await save(asha, { headline: "CSE year 2", skills: ["react", "python"], linkedin: LI("asha-rao"), about: "Likes web." })).error);
  t.check("it is hidden by default", (await t.admin("select visible from public.people_profiles where user_id = $1", [asha])).rows[0].visible === false);
  t.check("the owner can read it", (await t.as(asha, "select user_id from public.people_profiles where user_id = $1", [asha])).rows.length === 1);
  t.check("another student cannot read the table row", (await t.as(ravi, "select user_id from public.people_profiles where user_id = $1", [asha])).rows.length === 0);
  t.check("another student cannot see it in the directory", !(await dirIds(ravi)).includes(asha));
  t.check("another student cannot open it", (await person(ravi, asha)).length === 0);
  t.check("the owner can preview their own hidden profile", (await person(asha, asha)).length === 1);
  t.check("an admin gets no extra view of a hidden profile", (await person(adm, asha)).length === 0 && !(await dirIds(adm)).includes(asha));
  t.check("a person who never created a profile is not listed", !(await dirIds(ravi)).includes(nina));

  await save(asha, { visible: true, headline: "CSE year 2", skills: ["react", "python"], interests: ["web"], linkedin: LI("asha-rao"), about: "Likes web." });
  t.check("turned on, other students see it in the directory", (await dirIds(ravi)).includes(asha));
  const shown = (await person(ravi, asha))[0];
  t.check("and can open it", !!shown && shown.full_name === "Test asha" && shown.headline === "CSE year 2");
  t.check("it shows department, year and type", shown.branch === "Computer Science & Engineering" && shown.year === 2 && shown.person_type === "student");
  t.check("the LinkedIn link is returned", shown.linkedin_url === LI("asha-rao"));
  t.check("the college email is NOT returned unless chosen", shown.email === null);
  t.check("the USN and ID card are never in the answer", !Object.keys(shown).some((c) => /usn|id_card|phone|review/.test(c)));
  t.check("the directory never carries an email or USN either", !Object.keys((await dir(ravi)).rows[0]).some((c) => /email|usn|phone/.test(c)));
  await save(asha, { visible: true, headline: "CSE year 2", skills: ["react", "python"], linkedin: LI("asha-rao"), show_email: true });
  t.check("with 'show my college email' on, it is returned", String((await person(ravi, asha))[0].email).endsWith("@bmsit.in"));
  await save(asha, { visible: false });
  t.check("turning visibility off hides it again at once", !(await dirIds(ravi)).includes(asha) && (await person(ravi, asha)).length === 0);
  await save(asha, { visible: true, headline: "CSE year 2", skills: ["react", "python"], interests: ["web"], linkedin: LI("asha-rao") });

  // ---------- only signed-in verified college users ----------
  t.check("an unverified user sees an empty directory", (await dirIds(raw)).length === 0);
  t.check("an unverified user cannot open a profile", (await person(raw, asha)).length === 0);
  t.check("an unverified user cannot create a profile", !!(await save(raw)).error);
  const priv = (await t.admin(`select has_function_privilege('anon', 'public.people_directory(text,text,text,text,int,int)', 'execute') a,
    has_function_privilege('anon', 'public.person_profile(uuid)', 'execute') b, has_function_privilege('anon', 'public.set_person_type(uuid,text)', 'execute') c`)).rows[0];
  t.check("anonymous visitors cannot call any of the new functions", !priv.a && !priv.b && !priv.c);
  t.check("no policy lets anonymous visitors touch the table", (await t.admin("select count(*)::int n from pg_policies where tablename = 'people_profiles' and 'anon' = any(roles)")).rows[0].n === 0);
  await t.admin("update public.profiles set status = 'rejected' where id = $1", [asha]);
  t.check("someone whose verification was withdrawn disappears", !(await dirIds(ravi)).includes(asha) && (await person(ravi, asha)).length === 0);
  await t.admin("update public.profiles set status = 'verified' where id = $1", [asha]);

  // ---------- nobody writes someone else's profile ----------
  t.check("a student cannot create a profile for someone else", !!(await t.as(ravi, "insert into public.people_profiles (user_id, visible) values ($1, true)", [nina])).error);
  const edit = await t.as(ravi, "update public.people_profiles set headline = 'hacked' where user_id = $1", [asha]);
  t.check("a student cannot edit someone else's profile", !!edit.error || edit.rowCount === 0);
  t.check("...nor delete it", ((await t.as(ravi, "delete from public.people_profiles where user_id = $1", [asha])).rowCount || 0) === 0);
  t.check("the profile is untouched", (await t.admin("select headline from public.people_profiles where user_id = $1", [asha])).rows[0].headline === "CSE year 2");
  const steal = await t.as(asha, "update public.people_profiles set user_id = $1 where user_id = $2", [ravi, asha]);
  t.check("a user cannot hand their row to someone else", !!steal.error || steal.rowCount === 0);

  // ---------- link and size rules in the database ----------
  const bad = async (field, value) => !!(await t.as(asha, `update public.people_profiles set ${field} = $1 where user_id = $2`, [value, asha])).error;
  t.check("LinkedIn must be a normalised linkedin.com/in link", await bad("linkedin_url", "https://evil.example/in/asha-rao"));
  t.check("LinkedIn cannot be http", await bad("linkedin_url", "http://www.linkedin.com/in/asha-rao"));
  t.check("LinkedIn cannot be a script", await bad("linkedin_url", "javascript:alert(1)"));
  t.check("LinkedIn cannot hide a look-alike host", await bad("linkedin_url", "https://www.linkedin.com.evil.example/in/asha-rao"));
  t.check("LinkedIn cannot carry credentials", await bad("linkedin_url", "https://www.linkedin.com@evil.example/in/asha-rao"));
  t.check("GitHub must be github.com/<name>", await bad("github_url", "https://github.com/a/b"));
  t.check("a website cannot be http", await bad("website_url", "http://example.org"));
  t.check("a website cannot be javascript:", await bad("website_url", "javascript:alert(1)"));
  t.check("a website cannot be a single-word host", await bad("website_url", "https://intranet/x"));
  t.check("a good website is accepted", !(await t.as(asha, "update public.people_profiles set website_url = 'https://asha.example.org/me' where user_id = $1", [asha])).error);
  t.check("about is limited in length", await bad("about", "x".repeat(1300)));
  t.check("no more than 20 skills", await bad("skills", Array.from({ length: 21 }, (_, i) => `s${i}`)));
  t.check("achievements must be a list of objects", await bad("achievements", JSON.stringify(["just text"])));
  t.check("achievements are limited to 15", await bad("achievements", JSON.stringify(Array.from({ length: 16 }, (_, i) => ({ title: `a${i}` })))));
  t.check("an achievement link must be https", await bad("achievements", JSON.stringify([{ title: "x", url: "javascript:alert(1)" }])));
  t.check("good achievements are accepted", !(await t.as(asha, "update public.people_profiles set achievements = $1 where user_id = $2", [JSON.stringify([{ title: "Smart India Hackathon finalist", year: 2024 }]), asha])).error);

  // ---------- faculty ----------
  await t.as(asha, "update public.people_profiles set designation = 'Professor', research_areas = array['ai'], career = 'x' where user_id = $1", [asha]);
  const kept = (await t.admin("select designation, research_areas, career from public.people_profiles where user_id = $1", [asha])).rows[0];
  t.check("a student cannot keep faculty-only fields (the database empties them)", kept.designation === null && kept.research_areas.length === 0 && kept.career === null);
  const pubs = JSON.stringify([{ title: "Deep nets for X", venue: "IEEE Access", year: 2023, url: "https://doi.org/10.1109/x.1" }]);
  const fac = await t.as(prof, `insert into public.people_profiles (user_id, visible, headline, designation, research_areas, publications, work, career, linkedin_url)
      values ($1, true, 'Machine learning', 'Associate Professor', array['machine learning','nlp'], $2, $3, 'Moving into applied AI.', $4)`,
    [prof, pubs, JSON.stringify([{ title: "DST funded project", detail: "2022 to 2024", url: "https://example.org/p" }]), LI("prof-sharma")]);
  t.check("faculty can save research, papers, work and career", !fac.error, fac.error);
  const fp = (await person(asha, prof))[0];
  t.check("students see the faculty profile", !!fp && fp.person_type === "faculty" && fp.designation === "Associate Professor");
  t.check("with papers, work and career", fp.publications[0].venue === "IEEE Access" && fp.work[0].title === "DST funded project" && fp.career === "Moving into applied AI.");
  t.check("a paper link must be https", !!(await t.as(prof, "update public.people_profiles set publications = $1 where user_id = $2", [JSON.stringify([{ title: "t", url: "http://insecure.example/p" }]), prof])).error);
  t.check("no more than 30 papers", !!(await t.as(prof, "update public.people_profiles set publications = $1 where user_id = $2", [JSON.stringify(Array.from({ length: 31 }, (_, i) => ({ title: `p${i}` }))), prof])).error);
  await t.as(sup, "select public.set_person_type($1, 'student')", [prof]);
  await t.as(prof, "update public.people_profiles set headline = 'Machine learning' where user_id = $1", [prof]);
  t.check("if someone stops being faculty their faculty fields are emptied on the next save", (await t.admin("select designation from public.people_profiles where user_id = $1", [prof])).rows[0].designation === null);
  await t.as(sup, "select public.set_person_type($1, 'faculty')", [prof]);
  await t.as(prof, "update public.people_profiles set designation = 'Associate Professor', research_areas = array['machine learning','nlp'] where user_id = $1", [prof]);

  // ---------- search and filters ----------
  await save(ravi, { visible: true, headline: "Mechanical, loves CAD", skills: ["cad", "python"], interests: ["robotics"], linkedin: LI("ravi-k") });
  await save(nina, { visible: false, headline: "hidden", skills: ["react"] });
  t.check("the directory lists visible people only", same(await names(sup), ["Test asha", "Test prof", "Test ravi"]));
  t.check("filter: faculty only", same(await names(sup, "faculty"), ["Test prof"]));
  t.check("filter: students only", same(await names(sup, "student"), ["Test asha", "Test ravi"]));
  t.check("filter: department", same(await names(sup, null, null, "Mechanical Engineering"), ["Test ravi"]));
  t.check("filter: skill (exact)", same(await t.as(sup, "select full_name from public.people_directory(null, null, null, 'python') order by 1").then((r) => r.rows.map((x) => x.full_name)), ["Test asha", "Test ravi"]));
  t.check("a skill filter matches research areas too", same(await t.as(sup, "select full_name from public.people_directory(null, null, null, 'nlp')").then((r) => r.rows.map((x) => x.full_name)), ["Test prof"]));
  t.check("search by name", same(await names(sup, null, "ravi"), ["Test ravi"]));
  t.check("search by headline words", same(await names(sup, null, "machine learning"), ["Test prof"]));
  t.check("search is case-insensitive", same(await names(sup, null, "CAD"), ["Test ravi"]));
  t.check("a % in the search is not a wildcard", (await names(sup, null, "%")).length === 0);
  t.check("a _ in the search is not a wildcard", (await names(sup, null, "r_vi")).length === 0);
  t.check("the total count is returned for paging", Number((await dir(sup)).rows[0].total) === 3);
  t.check("my own entry is flagged", (await dir(asha)).rows.find((r) => r.id === asha).is_me === true);
  t.check("the page size is capped at 60", (await t.as(sup, "select count(*)::int n from public.people_directory(null, null, null, null, 9999, 0)")).rows[0].n <= 60);
  t.check("paging works", (await t.as(sup, "select count(*)::int n from public.people_directory(null, null, null, null, 2, 2)")).rows[0].n === 1);

  // ---------- blocks ----------
  await t.admin("insert into public.blocks (blocker, blocked) values ($1, $2)", [ravi, asha]);
  t.check("a blocked pair cannot see each other in the directory", !(await dirIds(ravi)).includes(asha) && !(await dirIds(asha)).includes(ravi));
  t.check("...nor open each other's profile", (await person(ravi, asha)).length === 0 && (await person(asha, ravi)).length === 0);
  t.check("...nor read each other's rows", (await t.as(asha, "select user_id from public.people_profiles where user_id = $1", [ravi])).rows.length === 0);
  t.check("everyone else still sees both", (await dirIds(sup)).includes(asha) && (await dirIds(sup)).includes(ravi));

  // ---------- clean-up ----------
  await t.admin("delete from auth.users where id = $1", [ravi]);
  t.check("deleting a user removes their profile", (await t.admin("select count(*)::int n from public.people_profiles where user_id = $1", [ravi])).rows[0].n === 0);
});
