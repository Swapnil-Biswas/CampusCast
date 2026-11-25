import { createClient, getUser } from "../../../../../lib/supabase/server";
import { getProfile } from "../../../../../lib/profile";
import { buildHackathonIcs } from "../../../../../lib/hackathons/status";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const deny = (status, error) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

// GET /dashboard/hackathons/<id>/ics: a calendar file with the hackathon, its registration deadline and its programme.
export async function GET(req, { params }) {
  const { id } = await params;
  if (!UUID.test(String(id))) return deny(400, "Invalid request.");
  const supabase = await createClient();
  const user = await getUser();
  if (!supabase || !user) return deny(401, "Please sign in.");
  const { profile } = await getProfile(supabase, user.id);
  if (profile?.status !== "verified") return deny(403, "Your profile is not verified yet.");

  const { data: h } = await supabase.from("hackathons").select("id, title, status, location, venue_address, organizer_name, prize, website_url, link, starts_at, ends_at, deadline, schedule, club:clubs(name)").eq("id", id).maybeSingle();
  if (!h || h.status === "draft") return deny(404, "Not found.");
  const ics = buildHackathonIcs({ ...h, organizer: h.club?.name }, { host: new URL(req.url).hostname });
  const name = h.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "hackathon";
  return new Response(ics, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="${name}.ics"`, "cache-control": "no-store" } });
}
