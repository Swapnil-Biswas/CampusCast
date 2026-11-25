// Which departments the signed-in admin may upload and manage exam notices for.
// super_admin: every active department. admin: the ones a super admin assigned (profiles.admin_depts).
// The database enforces the same rule (can_manage_exam_depts); this is only for building the screen.
export async function manageableDepartments(supabase, userId, isSuper) {
  const { data: all } = await supabase.from("departments").select("name, code").eq("active", true).order("sort");
  const list = all || [];
  if (isSuper) return list;
  const { data: me } = await supabase.from("profiles").select("admin_depts").eq("id", userId).maybeSingle();
  const mine = new Set(me?.admin_depts || []);
  return list.filter((d) => mine.has(d.name));
}

// Which departments the signed-in admin may APPROVE exam notices for (head of department / cluster head).
// super_admin: every active department. Returns [] when the column does not exist yet (database not updated).
export async function approverDepartments(supabase, userId, isSuper) {
  const { data: all } = await supabase.from("departments").select("name, code").eq("active", true).order("sort");
  const list = all || [];
  if (isSuper) return list;
  const { data: me, error } = await supabase.from("profiles").select("approver_depts").eq("id", userId).maybeSingle();
  if (error) return [];
  const mine = new Set(me?.approver_depts || []);
  return list.filter((d) => mine.has(d.name));
}
