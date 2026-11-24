import { requireAdmin } from "../../../../lib/dash/ctx";
import { ClubCard, NewClub } from "../../../../components/dashboard/ClubAdmin";

export const metadata = { title: "Clubs" };

export default async function Clubs() {
  const { supabase, isSuper } = await requireAdmin();
  const [{ data: clubs }, { data: leads }] = await Promise.all([
    supabase.from("clubs").select("id,name,description,color").order("name"),
    supabase.from("club_admins").select("club_id,user_id"),
  ]);
  const ids = [...new Set((leads || []).map((l) => l.user_id))];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id,full_name,email").in("id", ids) : { data: [] };
  const nameOf = new Map((people || []).map((p) => [p.id, p.full_name || p.email]));
  const counts = await Promise.all((clubs || []).map((c) => supabase.rpc("club_follower_count", { p_club: c.id }).then((r) => r.data ?? 0)));
  return (
    <>
      <div className="page-head"><div><h1>Clubs</h1><p>Club leads can publish to their own club's followers. They can never send Now or Today.</p></div></div>
      <NewClub />
      <div className="feed">
        {(clubs || []).map((c, i) => (
          <ClubCard key={c.id} club={{ ...c, followers: counts[i] }} isSuper={isSuper}
            leads={(leads || []).filter((l) => l.club_id === c.id).map((l) => ({ user_id: l.user_id, name: nameOf.get(l.user_id) || "Unknown" }))} />
        ))}
      </div>
    </>
  );
}
