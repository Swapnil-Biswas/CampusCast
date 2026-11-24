"use client";
import { useEffect, useState } from "react";
import { countdown, fmtDate, timeAgo } from "../../lib/dash/meta";

// Shows a fixed date on the server and a live relative time once the page is in the browser (avoids a hydration mismatch).
export default function RelTime({ date, mode = "ago", className }) {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const text = now === null ? fmtDate(date) : mode === "until" ? countdown(date, now) : timeAgo(date, now);
  return <time className={className} dateTime={new Date(date).toISOString()} title={fmtDate(date)} suppressHydrationWarning>{text}</time>;
}
