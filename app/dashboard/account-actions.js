"use server";
import { revalidatePath } from "next/cache";
import { requireVerified } from "../../lib/dash/ctx";

const fail = (e) => ({ error: e?.message || String(e) });
const list = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 12);

export async function saveProfile({ bio, skills, interests, section }) {
  const { supabase } = await requireVerified();
  const { error } = await supabase.rpc("update_my_profile", { p_bio: String(bio || "").slice(0, 400), p_skills: list(skills), p_interests: list(interests), p_section: String(section || "").slice(0, 10) });
  if (error) return fail(error);
  revalidatePath("/dashboard/profile");
  return { ok: true };
}

export async function savePrefs(v) {
  const { supabase, user } = await requireVerified();
  const hr = (x) => (x === "" || x == null ? null : Math.min(23, Math.max(0, Number(x))));
  const qs = hr(v.quiet_start), qe = hr(v.quiet_end);
  const { error } = await supabase.from("notification_prefs").upsert({
    user_id: user.id, in_app: true, email: !!v.email, push: !!v.push, digest: !!v.digest, urgent_overrides_quiet: !!v.urgent_overrides_quiet,
    quiet_start: qs != null && qe != null ? qs : null, quiet_end: qs != null && qe != null ? qe : null,
  }, { onConflict: "user_id" });
  if (error) return fail(error);
  revalidatePath("/dashboard/notifications");
  return { ok: true };
}

// The browser hands over its push address; it is stored against this student only.
export async function savePushSubscription(sub) {
  const { supabase, user } = await requireVerified();
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return { error: "That browser did not give a valid push address." };
  const { error } = await supabase.from("push_subscriptions").upsert(
    { user_id: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth }, { onConflict: "endpoint" });
  if (error) return fail(error);
  revalidatePath("/dashboard/notifications");
  return { ok: true };
}

export async function removePushSubscription(endpoint) {
  const { supabase, user } = await requireVerified();
  const { error } = await supabase.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
  if (error) return fail(error);
  revalidatePath("/dashboard/notifications");
  return { ok: true };
}

export async function sendTestAlert() {
  const { supabase } = await requireVerified();
  const { error } = await supabase.rpc("send_test_alert");
  return error ? fail(error) : { ok: true };
}
