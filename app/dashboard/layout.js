import "./dashboard.css";
import Shell from "../../components/dashboard/Shell";
import { requireVerified } from "../../lib/dash/ctx";

export const metadata = { title: { default: "Dashboard · CampusCast", template: "%s · CampusCast" }, robots: { index: false } };

// Everything under /dashboard needs a signed-in, ID-verified student.
export default async function DashboardLayout({ children }) {
  const { supabase, user, profile } = await requireVerified();
  const isAdmin = ["admin", "super_admin"].includes(profile.role);
  const [{ count }, { data: led }, { data: ap }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    supabase.from("club_admins").select("club_id").eq("user_id", user.id).limit(1),
    // Heads of department / cluster heads get the "Exam approvals" menu item. (No error if the column is not there yet.)
    isAdmin ? supabase.from("profiles").select("approver_depts").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return (
    <Shell
      unread={count || 0}
      user={{ id: user.id, name: profile.full_name || user.email, branch: profile.branch, year: profile.year, role: profile.role, leadsClub: (led || []).length > 0, approver: (ap?.approver_depts || []).length > 0 }}
    >
      {children}
    </Shell>
  );
}
