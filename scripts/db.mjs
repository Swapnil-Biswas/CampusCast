// Database helper for development. The password is read from PGPASSWORD and is never stored.
//   PGPASSWORD=... node scripts/db.mjs -f supabase/dashboard-1-engine.sql
//   PGPASSWORD=... node scripts/db.mjs "select count(*) from public.profiles"
import pg from "pg";
import fs from "node:fs";

export const DB = {
  host: process.env.PGHOST || "aws-0-ap-southeast-1.pooler.supabase.com",
  port: 5432,
  user: process.env.PGUSER || "postgres.qtanfeagfswcjzxpltzg",
  database: "postgres",
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
};

export async function connect() {
  if (!process.env.PGPASSWORD) throw new Error("Set PGPASSWORD first.");
  const c = new pg.Client({ ...DB, password: process.env.PGPASSWORD });
  await c.connect();
  return c;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const args = process.argv.slice(2);
  const sql = args[0] === "-f" ? fs.readFileSync(args[1], "utf8") : args.join(" ");
  const c = await connect();
  try {
    const res = await c.query(sql);
    for (const r of Array.isArray(res) ? res : [res]) {
      if (r.rows && r.rows.length) console.table(r.rows); else console.log(r.command, r.rowCount ?? "");
    }
  } catch (e) {
    console.error("ERROR:", e.message, e.position ? `(position ${e.position})` : "");
    process.exitCode = 1;
  } finally { await c.end(); }
}
