import { redirect } from "next/navigation";
import { getPublisher } from "../../../../lib/dash/ctx";
import ComposeForm from "../../../../components/dashboard/ComposeForm";

export const metadata = { title: "Publish a notice" };

export default async function Compose() {
  const { canPublish, isAdmin, ledClubs, supabase, user } = await getPublisher();
  if (!canPublish) redirect("/dashboard");
  const { data: allClubs } = isAdmin ? await supabase.from("clubs").select("id,name").order("name") : { data: ledClubs };
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Publish a notice</h1>
          <p>{isAdmin ? "Pick who should see it, how urgent it is, and when it goes out." : "You can post to the clubs you lead."}</p>
        </div>
      </div>
      <ComposeForm clubs={allClubs || []} isAdmin={isAdmin} userId={user.id} />
    </>
  );
}
