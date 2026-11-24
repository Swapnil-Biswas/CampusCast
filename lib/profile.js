// Reads the signed-in student's profile row (created by supabase/setup.sql).
// Returns { profile, setupMissing }: setupMissing is true when the table doesn't exist yet.
import { cache } from "react";

export const getProfile = cache(async function getProfile(supabase, userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, branch, year, batch, usn, status, role, review_note, id_card_front, id_card_back, submitted_at, interests, skills, bio, section")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("[profile] could not read the profile:", error.code || "", error.message);   // shows in the server terminal only
    // "fetch failed" means the server could not reach Supabase at all (network or DNS), which is not a setup problem.
    if (/fetch failed|network|timeout|ENOTFOUND|ECONNRESET|ETIMEDOUT/i.test(String(error.message))) return { profile: null, setupMissing: false, unreachable: true };
    return { profile: null, setupMissing: true };
  }
  return { profile: data, setupMissing: false };
});

// Where to send a signed-in user: verified students go home, everyone else finishes verification.
export async function homeFor(supabase, userId) {
  const { profile } = await getProfile(supabase, userId);
  return profile?.status === "verified" ? "/dashboard" : "/verify";
}
