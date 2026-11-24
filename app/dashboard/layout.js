import "./dashboard.css";
import Shell from "../../components/dashboard/Shell";
import { requireVerified } from "../../lib/dash/ctx";

export const metadata = { title: { default: "Dashboard · CampusCast", template: "%s · CampusCast" }, robots: { index: false } };

// Everything under /dashboard needs a signed-in, ID-verified student.
export default async function DashboardLayout({ children }) {
  const { supabase, user, profile } = await requireVerified();
  const [{ count }, { data: led }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    supabase.from("club_admins").select("club_id").eq("user_id", user.id).limit(1),
  ]);
  return (
    <Shell
      unread={count || 0}
      user={{ id: user.id, name: profile.full_name || user.email, branch: profile.branch, year: profile.year, role: profile.role, leadsClub: (led || []).length > 0 }}
    >
      {children}
    </Shell>
  );
}
