// Installs the alert pipeline: applies supabase/dashboard-5-alerts.sql, stores the job secret, schedules the cron jobs.
//   PGPASSWORD=... node scripts/setup-alerts.mjs
// JOB_SECRET and NEXT_PUBLIC_SITE_URL are read from .env.local (JOB_SECRET must be the same value set on Vercel).
import fs from "node:fs";
import { connect } from "./db.mjs";

const env = Object.fromEntries((fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : "").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const secret = process.env.JOB_SECRET || env.JOB_SECRET;
const site = (process.env.NEXT_PUBLIC_SITE_URL || env.NEXT_PUBLIC_SITE_URL || "https://campus-cast-bay.vercel.app").replace(/\/$/, "");
if (!secret) throw new Error("JOB_SECRET is missing from .env.local.");

const c = await connect();
try {
  await c.query(fs.readFileSync("supabase/dashboard-5-alerts.sql", "utf8"));
  await c.query("insert into public.app_private (key, value) values ('job_secret', $1) on conflict (key) do update set value = excluded.value", [secret]);
  await c.query("select public.schedule_jobs($1)", [`${site}/api/jobs/dispatch`]);
  const { rows } = await c.query("select jobname, schedule from cron.job where jobname like 'campuscast-%' order by jobname");
  console.table(rows);
} finally { await c.end(); }
