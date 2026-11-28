import { createClient, getUser } from "../../../../lib/supabase/server";
import { adminClient } from "../../../../lib/supabase/admin";
import { getProfile } from "../../../../lib/profile";
import { aiConfig } from "../../../../lib/exams/config";
import { readPaper } from "../../../../lib/papers/read";

export const dynamic = "force-dynamic";
export const maxDuration = 300;   // reading a long scan can take a minute or more

const PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/i;
const json = (body, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

// POST { path, filename }: reads one of the signed-in student's own uploads and answers with the details it found.
export async function POST(req) {
  const supabase = await createClient();
  const user = await getUser();
  if (!supabase || !user) return json({ error: "Please sign in." }, 401);
  const { profile } = await getProfile(supabase, user.id);
  if (profile?.status !== "verified") return json({ error: "Your profile is not verified yet." }, 403);

  const body = await req.json().catch(() => null);
  const path = String(body?.path || "");
  if (!PATH.test(path) || !path.startsWith(`${user.id}/`)) return json({ error: "Invalid request." }, 400);

  const { providers } = aiConfig();
  if (!providers.length) return json({ error: "AI reading isn't set up on this server. Fill in the details yourself." }, 503);

  const { data: allowed, error: limitError } = await supabase.rpc("claim_note_read");
  if (limitError) return json({ error: "The notes database update is missing (supabase/dashboard-11-notes-papers.sql). Fill in the details yourself for now." }, 503);
  if (!allowed) return json({ error: "You have used today's AI readings. Fill in the details yourself." }, 429);

  try {
    const out = await readPaper({ supabase, admin: adminClient(), userId: user.id, path, filename: String(body?.filename || "paper.pdf"), providers });
    if (!out.ok) return json({ error: out.message }, 422);
    return json(out);
  } catch (e) {
    console.error("[paper reading]", e?.message || e);   // never includes keys or file contents
    return json({ error: "Something went wrong while reading the file. Fill in the details yourself." }, 500);
  }
}
