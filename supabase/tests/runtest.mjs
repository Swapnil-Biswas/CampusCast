// Runs a security test against an in-memory Postgres (PGlite), so it needs no database password and never touches
// the live Supabase project.
//
//   node supabase/tests/runtest.mjs supabase/tests/stage9.mjs
//
// It builds a tiny stand-in for Supabase (the auth and storage schemas, the anon / authenticated roles, auth.uid()),
// applies the project's own SQL files in order, then runs the test file with the same harness the live tests use.
// Needs the dev dependency @electric-sql/pglite (npm install). To use a copy installed elsewhere, set PGLITE_DIR.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const testFile = process.argv[2];
if (!testFile) { console.error("Usage: node supabase/tests/runtest.mjs supabase/tests/stage9.mjs [more sql files to apply first]"); process.exit(2); }

let PGlite, pg_trgm;
try {
  const base = process.env.PGLITE_DIR ? path.resolve(process.env.PGLITE_DIR) : root;
  const req = createRequire(path.join(base, "package.json"));
  ({ PGlite } = await import(pathToFileURL(req.resolve("@electric-sql/pglite")).href));
  try { ({ pg_trgm } = await import(pathToFileURL(req.resolve("@electric-sql/pglite/contrib/pg_trgm")).href)); } catch { /* optional */ }
} catch (e) {
  console.error("Could not load @electric-sql/pglite. Run `npm install`, or set PGLITE_DIR to a folder that has it.\n" + e.message);
  process.exit(2);
}

const db = new PGlite({ extensions: pg_trgm ? { pg_trgm } : {} });

// ---- a minimal Supabase ----
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth; create schema storage; create schema extensions;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, aud text, role text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'anon') $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
  create publication supabase_realtime;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  grant select on auth.users to authenticated;
`);

const files = ["setup.sql", "dashboard-1-engine.sql", "dashboard-2-admin.sql", "dashboard-3-official.sql", "dashboard-4-community.sql", "dashboard-6-exams.sql", "dashboard-9-connect-people.sql", ...process.argv.slice(3)];
for (const f of files) {
  const p = path.join(root, "supabase", f);
  try { await db.exec(fs.readFileSync(p, "utf8")); }
  catch (e) { console.error(`Could not apply ${f}: ${e.message}`); process.exit(1); }
}
await db.exec("grant all on all tables in schema public to authenticated; grant all on all sequences in schema public to authenticated; grant select, insert, update, delete on storage.objects to authenticated; grant select on storage.buckets to authenticated;");

// ---- hand the harness a pg-style client ----
globalThis.__campusTestClient = async () => ({
  async query(sql, params) {
    // like pg: without parameters a whole SQL file (many statements) may be sent at once
    const r = params?.length ? await db.query(sql, params) : (await db.exec(sql)).at(-1) || { rows: [] };
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length, command: "" };
  },
  async end() {},
});

await import(pathToFileURL(path.resolve(root, testFile)).href);
