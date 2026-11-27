// Tiny harness for security-rule tests. Everything runs inside one transaction that is rolled back,
// so no test data ever stays in the database.
import { connect } from "./db.mjs";

export async function run(name, body) {
  // supabase/tests/runtest.mjs supplies an in-memory database; otherwise connect to the live project (needs PGPASSWORD).
  const c = globalThis.__campusTestClient ? await globalThis.__campusTestClient() : await connect();
  let pass = 0, fail = 0;
  const log = [];
  await c.query("begin");
  const t = {
    c,
    // create a confirmed test user (the sign-up triggers create the profile) and set its profile fields
    async user(label, fields = {}) {
      const id = (await c.query("select gen_random_uuid() id")).rows[0].id;
      await c.query("insert into auth.users (id, email, aud, role, raw_user_meta_data) values ($1, $2, 'authenticated', 'authenticated', $3)", [id, `zz-test-${label}-${id.slice(0, 6)}@bmsit.in`, JSON.stringify({ full_name: `Test ${label}` })]);
      const f = { status: "verified", role: "student", branch: "Computer Science & Engineering", year: 2, ...fields };
      await c.query("update public.profiles set status=$2, role=$3, branch=$4, year=$5, full_name=$6, usn=$7 where id=$1", [id, f.status, f.role, f.branch, f.year, `Test ${label}`, `ZZ${id.slice(0, 6)}`]);
      return id;
    },
    // run one statement as a signed-in user (row-level security applies); returns {rows, rowCount} or {error}
    async as(uid, sql, params = []) {
      await c.query("savepoint s");
      try {
        await c.query("set local role authenticated");
        await c.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify({ sub: uid, role: "authenticated" }), uid]);
        const r = await c.query(sql, params);
        await c.query("reset role"); await c.query("release savepoint s");
        return { rows: r.rows, rowCount: r.rowCount };
      } catch (e) {
        await c.query("rollback to savepoint s"); await c.query("reset role");
        return { error: e.message, code: e.code };
      }
    },
    async admin(sql, params = []) { return c.query(sql, params); },
    check(label, ok, extra = "") { ok ? pass++ : fail++; log.push(`${ok ? "  ok  " : " FAIL "} ${label}${ok ? "" : "  " + extra}`); },
  };
  try { await body(t); } catch (e) { fail++; log.push(` FAIL  test crashed: ${e.message}`); }
  await c.query("rollback");
  await c.end();
  console.log(`\n${name}\n${log.join("\n")}\n=> ${pass} passed, ${fail} failed (all changes rolled back)`);
  if (fail) process.exitCode = 1;
}
