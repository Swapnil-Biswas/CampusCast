// Reads the signed-in student's profile row (created by supabase/setup.sql).
// Returns { profile, setupMissing }: setupMissing is true when the table doesn't exist yet.
export async function getProfile(supabase, userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, branch, year, batch, usn, status, review_note, id_card_front, id_card_back, submitted_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) return { profile: null, setupMissing: true };
  return { profile: data, setupMissing: false };
}

// Where to send a signed-in user: verified students go home, everyone else finishes verification.
export async function homeFor(supabase, userId) {
  const { profile } = await getProfile(supabase, userId);
  return profile?.status === "verified" ? "/" : "/verify";
}
