import { timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";
import * as webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl } from "../../../../lib/supabase/config";
import { digestEmail, noticeEmail } from "../../../../lib/mail";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

// Called every minute by pg_cron (through pg_net) with the shared job secret. Sends whatever is due in the outbox.
export async function POST(req) {
  const secret = process.env.JOB_SECRET;
  if (!secret || !same(req.headers.get("x-job-secret") || "", secret)) return Response.json({ error: "Not allowed." }, { status: 401 });
  if (!supabaseUrl || !supabaseKey) return Response.json({ error: "Database not configured." }, { status: 503 });

  const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: jobs, error } = await db.rpc("dispatch_claim", { p_secret: secret, p_limit: 25 });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!jobs?.length) return Response.json({ sent: 0 });

  const smtp = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
    ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: Number(process.env.SMTP_PORT) === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } })
    : null;
  const vapid = process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (vapid) webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:college@bmsit.in", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://campus-cast-bay.vercel.app";
  const finish = (id, ok, err, skip = false) => db.rpc("dispatch_finish", { p_secret: secret, p_id: id, p_ok: ok, p_error: err || null, p_skip: skip });

  const stats = { sent: 0, failed: 0, skipped: 0 };
  for (const j of jobs) {
    try {
      if (j.channel === "email") {
        if (!smtp) { await finish(j.id, false, "Email is not configured.", true); stats.skipped++; continue; }
        const link = site + (j.url || "/dashboard");
        const mail = j.kind === "digest" ? digestEmail(j, site) : noticeEmail(j, link);
        await smtp.sendMail({ from: process.env.MAIL_FROM || `CampusCast <${process.env.SMTP_USER}>`, to: j.email, subject: j.subject, text: mail.text, html: mail.html });
      } else {
        if (!vapid) { await finish(j.id, false, "Push is not configured.", true); stats.skipped++; continue; }
        if (!j.subs?.length) { await finish(j.id, false, "No device subscribed.", true); stats.skipped++; continue; }
        const payload = JSON.stringify({ title: j.subject, body: j.body || "", url: j.url || "/dashboard", urgency: j.urgency });
        let delivered = 0;
        await Promise.all(j.subs.map(async (s) => {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: j.urgency <= 1 ? "high" : "normal" });
            delivered++;
          } catch (e) {
            if (e.statusCode === 404 || e.statusCode === 410) await db.rpc("dispatch_drop_subscription", { p_secret: secret, p_endpoint: s.endpoint });
          }
        }));
        if (!delivered) throw new Error("No device accepted the push.");
      }
      await finish(j.id, true);
      stats.sent++;
    } catch (e) {
      await finish(j.id, false, e.message);
      stats.failed++;
    }
  }
  return Response.json(stats);
}
