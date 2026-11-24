"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Timer } from "lucide-react";
import { splitDuration } from "../../lib/exams/student";

const two = (n) => String(n).padStart(2, "0");
const when = (ms) => new Date(ms).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// A live countdown (days : hours : minutes : seconds) to one exam. startsAt / endsAt are epoch milliseconds,
// worked out on the server from the notice's own India-time dates. The clock starts after the page loads, so the
// server and browser never disagree about the first paint.
export default function ExamCountdown({ startsAt, endsAt, subject, code, hasTime }) {
  const router = useRouter();
  const [now, setNow] = useState(null);
  const refreshed = useRef(false);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // When this exam ends, ask the server for the next one once.
  useEffect(() => {
    if (now !== null && now >= endsAt && !refreshed.current) { refreshed.current = true; router.refresh(); }
  }, [now, endsAt, router]);

  const title = [subject, code].filter(Boolean).join(" · ") || "Next exam";
  const started = now !== null && now >= startsAt;
  const { d, h, m, s } = splitDuration(startsAt - (now ?? startsAt));
  const parts = [[d, "days"], [h, "hours"], [m, "minutes"], [s, "seconds"]];

  return (
    <div className={`exam-cd${started ? " live" : ""}`} role="timer" aria-label={`Countdown to ${title}`}>
      <div className="exam-cd-head">
        <Timer size={16} />
        <span><b>{started ? "In progress" : "Next exam"}</b> · {title}</span>
        <small>{hasTime ? when(startsAt) : `${when(startsAt).split(",").slice(0, 2).join(",")} (time not stated)`}</small>
      </div>
      {started ? (
        <p className="exam-cd-live">Happening now. Good luck!</p>
      ) : (
        <div className="exam-cd-clock" aria-live="off">
          {parts.map(([value, label], i) => (
            <div key={label} className="exam-cd-box">
              <b>{now === null ? "--" : label === "days" ? value : two(value)}</b>
              <span>{label}</span>
              {i < 3 && <i aria-hidden="true">:</i>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
