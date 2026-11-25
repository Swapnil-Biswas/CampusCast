import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getPublisher } from "../../../../../lib/dash/ctx";
import { postingClubs } from "../../../../../lib/hackathons/access";
import { isUuid } from "../../../../../lib/hackathons/validate";
import HackathonEditor from "../../../../../components/dashboard/HackathonEditor";

export const metadata = { title: "Edit hackathon" };

export default async function EditHackathon({ params }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await getPublisher();
  if (!ctx.canPublish) redirect("/dashboard/hackathons");
  const { supabase, isAdmin } = ctx;

  const [{ data: h }, { data: docs }] = await Promise.all([
    supabase.from("hackathons").select("*").eq("id", id).maybeSingle(),
    supabase.from("hackathon_documents").select("id, original_filename, storage_path, mime_type, created_at, extractions:hackathon_extractions(id, status, error, field_meta, created_at)").eq("hackathon_id", id).order("created_at"),
  ]);
  if (!h) notFound();
  const clubs = await postingClubs(supabase, ctx);
  if (!isAdmin && !clubs.some((c) => c.id === h.club_id)) redirect("/dashboard/hackathons");   // someone else's club

  const doc = docs?.[0] || null;
  let url = null;
  if (doc) {
    const { data: signed } = await supabase.storage.from("hackathon-files").createSignedUrl(doc.storage_path, 3600);
    url = signed?.signedUrl || null;
  }
  const latest = doc ? [...(doc.extractions || [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null : null;
  const ex = h.details?.extraction;

  return (
    <>
      <Link href="/dashboard/hackathons/manage" className="back-link"><ArrowLeft size={16} /> All my hackathons</Link>
      <HackathonEditor
        key={ex?.appliedAt || "manual"}
        applyError={latest?.field_meta?._applyError || ""}
        h={h}
        meta={latest?.field_meta || {}}
        warnings={ex?.warnings || []}
        autofilled={Boolean(ex?.autofilled)}
        poster={doc && { url, filename: doc.original_filename, mime: doc.mime_type }}
        clubs={clubs}
        isAdmin={isAdmin}
        reading={latest && { status: latest.status, error: latest.error }}
        qrLinks={ex?.autofilled ? (ex.qrLinks || []) : []}
      />
    </>
  );
}
