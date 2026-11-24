import { requireVerified } from "../../../../../lib/dash/ctx";

const esc = (v) => { let s = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// Attendee list for the organiser or an admin (the database refuses anyone else).
export async function GET(_req, { params }) {
  const { id } = await params;
  const { supabase } = await requireVerified();
  const { data, error } = await supabase.rpc("workshop_attendees", { p_id: id });
  if (error) return new Response("Not allowed", { status: 403 });
  const head = ["Status", "Registered at", "Name", "Email", "USN", "Branch", "Year"];
  const rows = data.map((r) => [r.status, r.registered_at, r.full_name, r.email, r.usn, r.branch, r.year]);
  const csv = "﻿" + [head, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="workshop-attendees-${id.slice(0, 8)}.csv"`, "cache-control": "no-store" } });
}
