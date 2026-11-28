import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getPublisher } from "../../../../../lib/dash/ctx";
import { postingClubs } from "../../../../../lib/hackathons/access";
import { isUuid } from "../../../../../lib/hackathons/validate";
import WorkshopEditor from "../../../../../components/dashboard/WorkshopEditor";

export const metadata = { title: "Edit workshop" };

export default async function EditWorkshop({ params }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const ctx = await getPublisher();
  if (!ctx.canPublish) redirect("/dashboard/workshops");
  const { supabase, user, isAdmin } = ctx;

  const [{ data: w }, { data: docs }] = await Promise.all([
    supabase.from("workshops").select("*, club:clubs(id, name)").eq("id", id).maybeSingle(),
    supabase.from("workshop_documents").select("id, original_filename, storage_path, mime_type, created_at, extractions:workshop_extractions(id, status, error, field_meta, created_at)").eq("workshop_id", id).order("created_at"),
  ]);
  if (!w) notFound();
  const clubs = await postingClubs(supabase, ctx);
  if (!isAdmin && w.organizer_id !== user.id && !clubs.some((c) => c.id === w.club_id)) redirect("/dashboard/workshops");   // someone else's club

  const doc = docs?.[0] || null;
  let url = null;
  if (doc) {
    const { data: signed } = await supabase.storage.from("workshop-files").createSignedUrl(doc.storage_path, 3600);
    url = signed?.signedUrl || null;
  }
  const latest = doc ? [...(doc.extractions || [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null : null;
  const ex = w.details?.extraction;

  return (
    <>
      <Link href="/dashboard/workshops/manage" className="back-link"><ArrowLeft size={16} /> All my workshops</Link>
      <WorkshopEditor
        key={ex?.appliedAt || "manual"}
        w={w}
        meta={latest?.field_meta || {}}
        applyError={latest?.field_meta?._applyError || ""}
        warnings={ex?.warnings || []}
        autofilled={Boolean(ex?.autofilled)}
        qrLinks={ex?.qrLinks || []}
        poster={doc && { url, filename: doc.original_filename, mime: doc.mime_type }}
        clubs={clubs}
        isAdmin={isAdmin}
        reading={latest && { status: latest.status, error: latest.error }}
      />
    </>
  );
}
