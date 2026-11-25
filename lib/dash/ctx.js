import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient, getUser } from "../supabase/server";
import { getProfile } from "../profile";

// Everything a dashboard page needs about the request, fetched once per request.
export const getCtx = cache(async function getCtx() {
  const supabase = await createClient();
  const user = await getUser();
  const profile = user && supabase ? (await getProfile(supabase, user.id)).profile : null;
  return { supabase, user, profile };
});

// Only signed-in, ID-verified students get in. Everyone else is sent to finish verification.
export async function requireVerified() {
  const ctx = await getCtx();
  if (!ctx.supabase || !ctx.user) redirect("/signin");
  if (ctx.profile?.status !== "verified") redirect("/verify");
  return { ...ctx, isAdmin: ["admin", "super_admin"].includes(ctx.profile.role), isSuper: ctx.profile.role === "super_admin" };
}

export async function requireAdmin() {
  const ctx = await requireVerified();
  if (!ctx.isAdmin) redirect("/dashboard");
  return ctx;
}

// Heads of department / cluster heads (and central admins): people who approve exam notices.
export async function requireApprover() {
  const ctx = await requireAdmin();
  if (ctx.isSuper) return { ...ctx, approverDepts: null };
  const { approverDepartments } = await import("../exams/access");
  const depts = await approverDepartments(ctx.supabase, ctx.user.id, false);
  if (!depts.length) redirect("/dashboard");
  return { ...ctx, approverDepts: depts.map((d) => d.name) };
}

export async function requireSuper() {
  const ctx = await requireVerified();
  if (!ctx.isSuper) redirect("/dashboard");
  return ctx;
}

// Admins, or students who lead a club (they may publish to that club only).
export async function getPublisher() {
  const ctx = await requireVerified();
  const { data } = await ctx.supabase.from("club_admins").select("club_id, clubs(id, name)").eq("user_id", ctx.user.id);
  const ledClubs = (data || []).map((r) => r.clubs).filter(Boolean);
  return { ...ctx, ledClubs, canPublish: ctx.isAdmin || ledClubs.length > 0 };
}
