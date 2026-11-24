import { createClient, getUser } from "../../../../lib/supabase/server";
import { getProfile } from "../../../../lib/profile";
import { loadAgenda, toIcs } from "../../../../lib/dash/calendar";

export const dynamic = "force-dynamic";

// Download my calendar (?all=1 for everything, otherwise only items I signed up for plus exams).
export async function GET(req) {
  const supabase = await createClient();
  const user = await getUser();
  if (!supabase || !user) return new Response("Sign in first.", { status: 401 });
  const { profile } = await getProfile(supabase, user.id);
  if (profile?.status !== "verified") return new Response("Not verified.", { status: 403 });
  const { items } = await loadAgenda(supabase, user, { days: 180 });
  const all = new URL(req.url).searchParams.get("all") === "1";
  const body = toIcs(items.filter((i) => all || i.mine));
  return new Response(body, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'attachment; filename="campuscast.ics"', "cache-control": "no-store" } });
}
