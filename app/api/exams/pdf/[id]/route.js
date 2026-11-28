import { createClient, getUser } from "../../../../../lib/supabase/server";
import { getProfile } from "../../../../../lib/profile";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const deny = (status, error) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

// GET /api/exams/pdf/<document id>[?download=1]
// Sends a signed-in, verified user to a short-lived link to the original PDF. Row-level security decides whether
// they may see the document at all: a student only gets files of published notices for their department and semester.
export async function GET(req, { params }) {
  const { id } = await params;
  if (!UUID.test(String(id))) return deny(400, "Invalid request.");
  const supabase = await createClient();
  const user = await getUser();
  if (!supabase || !user) return deny(401, "Please sign in.");
  const { profile } = await getProfile(supabase, user.id);
  if (profile?.status !== "verified") return deny(403, "Your profile is not verified yet.");

  const { data: doc } = await supabase.from("exam_documents").select("storage_path, original_filename, deleted_at").eq("id", id).maybeSingle();
  if (!doc) return deny(404, "Not found.");
  if (doc.deleted_at) return deny(410, "The original file was removed some days after the exams ended.");

  const download = new URL(req.url).searchParams.get("download") === "1";
  const name = doc.original_filename.replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "exam-notice";
  const { data, error } = await supabase.storage.from("exam-pdfs").createSignedUrl(doc.storage_path, 120, download ? { download: name } : undefined);
  if (error || !data?.signedUrl) return deny(404, "The file could not be opened.");
  return new Response(null, { status: 302, headers: { location: data.signedUrl, "cache-control": "no-store" } });
}
