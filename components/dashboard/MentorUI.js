"use client";
import { useState } from "react";
import { Check, Star, X } from "lucide-react";
import { completeSession, rateSession, requestMentor, respondMentor, saveMentorProfile, scheduleSession, stopMentoring } from "../../app/dashboard/community-actions";
import { useAct } from "./Common";

export function MentorProfileForm({ mine }) {
  const { msg, pending, act } = useAct();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ domains: (mine?.domains || []).join(", "), bio: mine?.bio || "", availability: mine?.availability || "", active: mine?.active ?? true });
  const set = (k, x) => setV((p) => ({ ...p, [k]: x }));
  if (!open) return <button className={mine ? "btn-s" : "btn"} onClick={() => setOpen(true)}>{mine ? "Edit my mentor profile" : "Become a mentor"}</button>;
  return (
    <form className="form" style={{ padding: 16, background: "var(--soft)", border: "1.5px solid var(--ink)", borderRadius: 14, maxWidth: "none", marginBottom: 16 }}
      onSubmit={(e) => { e.preventDefault(); act(() => saveMentorProfile(v), () => setOpen(false)); }}>
      <div className="field"><label htmlFor="md">Domains you can help with <small>(comma separated)</small></label><input id="md" type="text" required value={v.domains} onChange={(e) => set("domains", e.target.value)} placeholder="web development, dsa, placements" /></div>
      <div className="field"><label htmlFor="mb">About you</label><textarea id="mb" maxLength={600} value={v.bio} onChange={(e) => set("bio", e.target.value)} style={{ minHeight: 80 }} placeholder="Your experience and how you like to mentor" /></div>
      <div className="field"><label htmlFor="ma">Availability</label><input id="ma" type="text" maxLength={200} value={v.availability} onChange={(e) => set("availability", e.target.value)} placeholder="Weekends, evenings after 6 pm" /></div>
      <label className="checks"><span style={{ display: "inline-flex", gap: 6 }}><input type="checkbox" checked={v.active} onChange={(e) => set("active", e.target.checked)} /> Accepting new requests</span></label>
      {msg && <p className="form-msg err" role="alert">{msg}</p>}
      <div className="notice-actions">
        <button className="btn" disabled={pending}>Save</button><button type="button" className="btn-s" onClick={() => setOpen(false)}>Cancel</button>
        {mine && <button type="button" className="btn-s ghost" disabled={pending} onClick={() => { if (confirm("Stop mentoring and remove your profile?")) act(() => stopMentoring(), () => setOpen(false)); }}>Remove profile</button>}
      </div>
    </form>
  );
}

export function AskMentor({ mentorId }) {
  const { msg, pending, act } = useAct();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [topic, setTopic] = useState(""); const [message, setMessage] = useState("");
  if (sent) return <span className="acked">Request sent.</span>;
  if (!open) return <button className="btn-s clay" onClick={() => setOpen(true)}>Request mentoring</button>;
  return (
    <form className="notice-actions" style={{ margin: 0, flex: 1 }} onSubmit={(e) => { e.preventDefault(); act(() => requestMentor(mentorId, topic, message), () => setSent(true)); }}>
      <input type="text" required minLength={3} maxLength={140} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What do you want help with?" aria-label="Topic" style={{ flex: 1, minWidth: 180, padding: "7px 10px", border: "1.5px solid var(--line)", borderRadius: 10, background: "var(--card)", font: "inherit" }} />
      <input type="text" maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Anything else (optional)" aria-label="Message" style={{ flex: 1, minWidth: 180, padding: "7px 10px", border: "1.5px solid var(--line)", borderRadius: 10, background: "var(--card)", font: "inherit" }} />
      <button className="btn-s clay" disabled={pending}>Send</button>
      {msg && <span className="inline-msg" role="alert">{msg}</span>}
    </form>
  );
}

// One mentoring request with everything that can happen to it: accept, schedule, mark done, rate.
export function RequestCard({ r, session, asMentor, person }) {
  const { msg, pending, act } = useAct();
  const [at, setAt] = useState(""); const [note, setNote] = useState("");
  const [rating, setRating] = useState(0); const [fb, setFb] = useState("");
  const when = (iso) => new Date(iso).toLocaleString("en-IN", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
  return (
    <article className="notice" style={{ "--u": r.status === "accepted" ? "#7fb48a" : r.status === "declined" ? "#bbb" : "#f3b63f" }}>
      <div className="notice-top"><span className="pill soft" style={{ "--c": r.status === "accepted" ? "#7fb48a" : "#f3b63f" }}>{r.status}</span><span className="when">{asMentor ? "You are the mentor" : "You asked for help"}</span></div>
      <h3 className="notice-title">{r.topic}</h3>
      <p className="audience">{asMentor ? "Mentee" : "Mentor"}: {person?.full_name || "a student"}{person?.year ? ` · Year ${person.year}` : ""}</p>
      {r.message && <p>“{r.message}”</p>}
      {session && <p className="when-line">{session.status === "done" ? "Session done" : session.status === "cancelled" ? "Session cancelled" : "Session"}: {when(session.scheduled_at)}{session.note && <> · {session.note}</>}</p>}
      {session?.rating && <p className="acked"><Star size={16} /> Rated {session.rating}/5{session.feedback ? `: “${session.feedback}”` : ""}</p>}
      <div className="notice-actions">
        {asMentor && r.status === "pending" && <>
          <button className="btn-s clay" disabled={pending} onClick={() => act(() => respondMentor(r.id, true))}><Check size={16} /> Accept</button>
          <button className="btn-s" disabled={pending} onClick={() => act(() => respondMentor(r.id, false))}><X size={16} /> Decline</button></>}
        {asMentor && r.status === "accepted" && !session && (
          <form className="notice-actions" style={{ margin: 0 }} onSubmit={(e) => { e.preventDefault(); act(() => scheduleSession(r.id, new Date(at).toISOString(), note)); }}>
            <input type="datetime-local" required value={at} onChange={(e) => setAt(e.target.value)} aria-label="Session time" style={{ padding: "6px 10px", border: "1.5px solid var(--line)", borderRadius: 10, background: "var(--card)", font: "inherit" }} />
            <input type="text" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Meeting link or place" aria-label="Meeting link or place" style={{ padding: "6px 10px", border: "1.5px solid var(--line)", borderRadius: 10, background: "var(--card)", font: "inherit" }} />
            <button className="btn-s clay" disabled={pending}>Schedule</button>
          </form>)}
        {asMentor && session?.status === "scheduled" && <button className="btn-s clay" disabled={pending} onClick={() => act(() => completeSession(session.id))}><Check size={16} /> Mark session done</button>}
        {!asMentor && session?.status === "done" && !session.rating && (
          <form className="notice-actions" style={{ margin: 0 }} onSubmit={(e) => { e.preventDefault(); act(() => rateSession(session.id, rating, fb)); }}>
            <span role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map((n) => (
              <button type="button" key={n} role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} className="icon-btn" style={{ display: "inline-grid", color: n <= rating ? "var(--clay)" : "inherit" }} onClick={() => setRating(n)}><Star size={20} fill={n <= rating ? "currentColor" : "none"} /></button>))}</span>
            <input type="text" value={fb} maxLength={500} onChange={(e) => setFb(e.target.value)} placeholder="One line of feedback" aria-label="Feedback" style={{ flex: 1, minWidth: 160, padding: "6px 10px", border: "1.5px solid var(--line)", borderRadius: 10, background: "var(--card)", font: "inherit" }} />
            <button className="btn-s clay" disabled={pending || !rating}>Submit rating</button>
          </form>)}
        {msg && <span className="inline-msg" role="alert">{msg}</span>}
      </div>
    </article>
  );
}
