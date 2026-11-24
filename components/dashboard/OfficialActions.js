"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Heart, Users } from "lucide-react";
import { cancelWorkshop, registerWorkshop, setClubFollow, setHackathonInterest, setRsvp } from "../../app/dashboard/official-actions";

function useRun() {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const run = (fn) => start(async () => { const r = await fn(); if (r?.error) setMsg(r.error); else { setMsg(""); router.refresh(); } });
  return { msg, pending, run };
}

export function WorkshopButton({ id, mine, full, closed }) {
  const { msg, pending, run } = useRun();
  return (
    <span className="notice-actions" style={{ margin: 0 }}>
      {!mine && <button className="btn-s clay" disabled={pending || closed} onClick={() => run(() => registerWorkshop(id))}>
        {closed ? "Registration closed" : full ? "Join the waitlist" : "Register"}</button>}
      {mine === "registered" && <><span className="acked"><Check size={16} /> You are registered</span><button className="btn-s ghost" disabled={pending} onClick={() => run(() => cancelWorkshop(id))}>Cancel</button></>}
      {mine === "waitlist" && <><span className="inline-msg"><b>On the waitlist.</b> You move up automatically if a seat opens.</span><button className="btn-s ghost" disabled={pending} onClick={() => run(() => cancelWorkshop(id))}>Leave waitlist</button></>}
      {msg && <span className="inline-msg" role="alert">{msg}</span>}
    </span>
  );
}

export function InterestButton({ id, on, count, hackathon }) {
  const { msg, pending, run } = useRun();
  return (
    <span className="notice-actions" style={{ margin: 0 }}>
      <button className="btn-s" aria-pressed={on} disabled={pending} onClick={() => run(() => setHackathonInterest(id, !on))}><Heart size={16} fill={on ? "currentColor" : "none"} /> {on ? "Interested" : "I'm interested"} · {count}</button>
      {hackathon && <Link className="btn-s" href={`/dashboard/connect?hackathon=${id}`}><Users size={16} /> Find teammates</Link>}
      {msg && <span className="inline-msg" role="alert">{msg}</span>}
    </span>
  );
}

export function RsvpButtons({ id, mine, counts }) {
  const { msg, pending, run } = useRun();
  const pick = (s) => run(() => setRsvp(id, mine === s ? null : s));
  return (
    <span className="notice-actions" style={{ margin: 0 }}>
      <button className="btn-s" aria-pressed={mine === "interested"} disabled={pending} onClick={() => pick("interested")} style={mine === "interested" ? { background: "var(--ink)", color: "var(--cream)" } : null}>Interested · {counts.interested}</button>
      <button className="btn-s" aria-pressed={mine === "going"} disabled={pending} onClick={() => pick("going")} style={mine === "going" ? { background: "var(--clay)", color: "#fff" } : null}>Going · {counts.going}</button>
      {msg && <span className="inline-msg" role="alert">{msg}</span>}
    </span>
  );
}

export function FollowChip({ club, on }) {
  const { msg, pending, run } = useRun();
  return (
    <button className={"chip" + (on ? " on" : "")} aria-pressed={on} disabled={pending} title={msg || undefined} onClick={() => run(() => setClubFollow(club.id, !on))}>
      <i style={{ width: 10, height: 10, borderRadius: "50%", background: club.color, display: "inline-block" }} /> {club.name} {on ? "· Following" : "+ Follow"}
    </button>
  );
}
