import Link from "next/link";
import { redirect } from "next/navigation";
import { getPublisher } from "../../../../lib/dash/ctx";
import { postingClubs } from "../../../../lib/hackathons/access";
import { aiConfig } from "../../../../lib/exams/config";
import HackathonUploader from "../../../../components/dashboard/HackathonUploader";

export const metadata = { title: "Post a hackathon" };

const STATUS = { draft: ["Draft", "#d9c8a8"], published: ["Published", "#7fb48a"], cancelled: ["Cancelled", "#e8603c"] };
const when = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—");

export default async function ManageHackathons() {
  const ctx = await getPublisher();
  if (!ctx.canPublish) redirect("/dashboard/hackathons");
  const { supabase, user, isAdmin } = ctx;
  const clubs = await postingClubs(supabase, ctx);

  // The hackathons this person can manage: all of them for an admin, their own clubs' for a club admin.
  let q = supabase.from("hackathons")
    .select("id, title, status, club_id, organizer_name, starts_at, deadline, created_at, club:clubs(name), docs:hackathon_documents(id, extractions:hackathon_extractions(id, status, error, created_at))")
    .order("created_at", { ascending: false }).limit(60);
  if (!isAdmin) q = q.in("club_id", clubs.length ? clubs.map((c) => c.id) : ["00000000-0000-0000-0000-000000000000"]);
  const { data, error } = await q;

  const rows = (data || []).map((h) => {
    const ex = (h.docs || []).flatMap((d) => d.extractions || []).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null;
    return { ...h, reading: ex };
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Post a hackathon</h1>
          <p>Upload the poster or brochure (a photo from WhatsApp works). CampusCast reads it and fills in the details. You check it and publish: nobody else has to approve.</p>
        </div>
        <Link className="btn-s" href="/dashboard/hackathons">View as a student</Link>
      </div>

      {clubs.length === 0 && !isAdmin ? (
        <div className="empty"><h2>No club assigned to you yet</h2><p>A central admin needs to make you an admin of your club before you can post hackathons.</p></div>
      ) : (
        <HackathonUploader userId={user.id} clubs={clubs} isAdmin={isAdmin} aiReady={aiConfig().providers.length > 0} />
      )}

      <h2 className="sub-h">{isAdmin ? "All hackathons" : "Your clubs' hackathons"}</h2>
      {error && <p className="form-msg err">{error.message}</p>}
      {!rows.length ? <div className="empty"><h2>Nothing posted yet</h2><p>Upload a poster above and it will appear here.</p></div> : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Hackathon</th><th>Organiser</th><th>Starts</th><th>Reading</th><th>Status</th><th /></tr></thead>
            <tbody>{rows.map((h) => {
              const [label, color] = STATUS[h.status] || STATUS.draft;
              const x = h.reading;
              return (
                <tr key={h.id}>
                  <td><b>{h.title}</b><small>Registration closes {when(h.deadline)}</small></td>
                  <td>{h.club?.name || h.organizer_name || "—"}</td>
                  <td>{when(h.starts_at)}</td>
                  <td>{!x ? "—" : x.status === "completed" ? <span className="pill soft" style={{ "--c": "#7fb48a" }}>Read</span> : x.status === "failed" ? <span className="pill soft" style={{ "--c": "#e8603c" }} title={x.error || ""}>Failed</span> : <span className="inline-msg">Reading…</span>}</td>
                  <td><span className="pill soft" style={{ "--c": color }}>{label}</span></td>
                  <td className="row-actions"><Link className="btn-s" href={`/dashboard/hackathons/manage/${h.id}`}>{h.status === "draft" ? "Review" : "Edit"}</Link></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
