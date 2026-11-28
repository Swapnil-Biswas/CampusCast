"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Timer } from "lucide-react";
import { splitDuration } from "../../lib/exams/student";

const two = (n) => String(n).padStart(2, "0");

// A live countdown (days : hours : minutes : seconds) to one moment. `target` is epoch milliseconds, worked out on the
// server. The clock starts after the page loads, so the server and browser never disagree about the first paint.
// When it reaches zero the page asks the server for the new state once (for example "registration open" -> "live").
export default function Countdown({ target, label, title, detail, tone = "open", compact = false }) {
  const router = useRouter();
  const [now, setNow] = useState(null);
  const refreshed = useRef(false);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (now !== null && now >= target && !refreshed.current) { refreshed.current = true; router.refresh(); }
  }, [now, target, router]);

  const { d, h, m, s } = splitDuration(target - (now ?? target));
  const parts = [[d, "days"], [h, "hours"], [m, "minutes"], [s, "seconds"]];

  return (
    <div className={`exam-cd hk-cd ${tone}${compact ? " compact" : ""}`} role="timer" aria-label={`${label}${title ? ` ${title}` : ""}`}>
      <div className="exam-cd-head">
        <Timer size={16} />
        <span><b>{label}</b>{title ? ` · ${title}` : ""}</span>
        {detail && <small>{detail}</small>}
      </div>
      <div className="exam-cd-clock" aria-live="off">
        {parts.map(([value, name]) => (
          <div key={name} className="exam-cd-box">
            <b>{now === null ? "--" : name === "days" ? value : two(value)}</b>
            <span>{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
