import { requireAdmin } from "../../../../lib/dash/ctx";
import VerifyCard from "../../../../components/dashboard/VerifyCard";

export const metadata = { title: "ID verification" };

export default async function Verification() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,full_name,usn,branch,year,batch,id_card_front,id_card_back,status,review_note,submitted_at")
    .eq("status", "pending").order("submitted_at", { ascending: true }).limit(100);
  return (
    <>
      <div className="page-head"><div><h1>ID verification</h1><p>{data?.length || 0} waiting. Oldest first. Photos are private and open in a link that expires in two minutes.</p></div></div>
      {error && <p className="form-msg err">{error.message}</p>}
      {!data?.length ? (
        <div className="empty"><h2>Queue is clear</h2><p>New sign-ups appear here once they upload their student ID.</p></div>
      ) : <div className="feed">{data.map((p) => <VerifyCard key={p.id} p={p} />)}</div>}
    </>
  );
}
