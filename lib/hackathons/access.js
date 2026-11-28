// The clubs the signed-in person may post hackathons for. An admin: every club. A club admin: only the clubs they lead.
// (The database enforces the same rule; this only builds the screen's choices.)
export async function postingClubs(supabase, { isAdmin, ledClubs }) {
  if (isAdmin) {
    const { data } = await supabase.from("clubs").select("id, name, color").order("name");
    return data || [];
  }
  return (ledClubs || []).filter(Boolean).map((c) => ({ id: c.id, name: c.name }));
}
