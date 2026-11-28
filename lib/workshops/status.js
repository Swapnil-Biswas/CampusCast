// Where a workshop is right now, and what to count down to. Pure (the time is passed in), so it can be tested.
// Rows saved before dashboard-12 have no status: they count as published.

const H = 3600e3;
const ms = (v) => { const t = v ? new Date(v).getTime() : NaN; return Number.isNaN(t) ? null : t; };
const phase = (key, label, color, target = null) => ({ key, label, color, target });

export function workshopPhase(w, nowMs = Date.now()) {
  if (w.status === "cancelled") return phase("cancelled", "Cancelled", "#e8603c");
  if (w.status === "draft") return phase("draft", "Draft", "#d9c8a8");
  const starts = ms(w.starts_at), ends = ms(w.ends_at), closes = ms(w.reg_closes_at);
  if (starts !== null && nowMs >= starts) {
    return nowMs < (ends ?? starts + 3 * H)      // with no end time, it is treated as lasting three hours
      ? phase("live", "Happening now", "#2f7a4a", ends ? { at: ends, label: "Ends in" } : null)
      : phase("ended", "Ended", "#d9c8a8");
  }
  if (closes !== null && nowMs >= closes) return phase("closed", "Registration closed", "#d9c8a8", starts !== null ? { at: starts, label: "Starts in" } : null);
  const until = closes ?? starts;
  const soon = until !== null && until - nowMs < 48 * H;
  return phase(soon ? "closing" : "open", soon ? "Closing soon" : "Registration open", soon ? "#f3b63f" : "#7fb48a",
    until !== null ? { at: until, label: closes !== null ? "Registration closes in" : "Starts in" } : null);
}
