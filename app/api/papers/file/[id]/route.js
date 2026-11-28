import { createClient, getUser } from "../../../../../lib/supabase/server";
import { getProfile } from "../../../../../lib/profile";
import { downloadName } from "../../../../../lib/papers/constants";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const deny = (status, error) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

// GET /api/papers/file/<upload id>[?download=1]
// Sends a signed-in, verified user to a short-lived link to the file. Row-level security decides whether they may see
// the upload at all. Downloads get a tidy name, never the uploader's own file name.
export async function GET(req, { params }) {
  const { id } = await params;
  if (!UUID.test(String(id))) return deny(400, "Invalid request.");
  const supabase = await createClient();
  const user = await getUser();
  if (!supabase || !user) return deny(401, "Please sign in.");
  const { profile } = await getProfile(supabase, user.id);
  if (profile?.status !== "verified") return deny(403, "Your profile is not verified yet.");

  const { data: note } = await supabase.from("notes").select("*").eq("id", id).maybeSingle();
  if (!note?.file?.path) return deny(404, "Not found.");

  const ext = /\.([a-z0-9]{2,5})$/i.exec(note.file.path)?.[1]?.toLowerCase() || "pdf";
  // Word and PowerPoint files cannot be shown in the browser, so they are always downloaded.
  const download = new URL(req.url).searchParams.get("download") === "1" || ext === "docx" || ext === "pptx";
  const { data, error } = await supabase.storage.from("notes").createSignedUrl(note.file.path, 300, download ? { download: downloadName(note, ext) } : undefined);
  if (error || !data?.signedUrl) return deny(404, "The file could not be opened.");
  return new Response(null, { status: 302, headers: { location: data.signedUrl, "cache-control": "private, max-age=120" } });
}
