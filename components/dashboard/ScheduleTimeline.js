"use client";
import { useEffect, useMemo, useState } from "react";
import { groupSchedule, fmtTime, scheduleStates } from "../../lib/hackathons/status";

const STATE_LABEL = { now: "Happening now", next: "Up next" };

// The hackathon's programme, minute by minute, grouped by day. It follows the clock: what is happening now is
// highlighted, what is over is dimmed, and the next item is marked.
export default function ScheduleTimeline({ items }) {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);
  const groups = useMemo(() => groupSchedule(items), [items]);
  const states = useMemo(() => (now === null ? new Map() : scheduleStates(items, now)), [items, now]);
  if (!groups.length) return null;

  return (
    <div className="hk-tl">
      {groups.map((g) => (
        <section key={g.day || "tba"} aria-label={g.heading}>
          <h3>{g.heading}</h3>
          <ol>
            {g.items.map((e) => {
              const st = states.get(e.index) || "later";
              return (
                <li key={e.index} className={`hk-tl-item ${st}`} aria-current={st === "now" ? "step" : undefined}>
                  <time className="hk-tl-time" dateTime={e.at || undefined}>{e.at ? <>{fmtTime(e.at)}{e.endAt && <small>to {fmtTime(e.endAt)}</small>}</> : "TBA"}</time>
                  <div>
                    <b>{e.title}</b>
                    {e.note && <small>{e.note}</small>}
                  </div>
                  {STATE_LABEL[st] && <span className={`hk-tl-chip ${st}`}>{STATE_LABEL[st]}</span>}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
