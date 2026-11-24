"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { AlarmClock, Download, Paperclip } from "lucide-react";
import { addReminder, signedUrl } from "../../app/dashboard/actions";

// "Remind me" menu for anything with a date: offsets are measured back from `at`.
export function Remind({ kind, refId, title, url, at, offsets = [["1 day before", 864e5], ["1 hour before", 36e5], ["At the time", 0]] }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const target = new Date(at).getTime();
  const options = offsets.map(([l, ms]) => [l, target - ms]).filter(([, t]) => t > Date.now() + 60000);
  if (!options.length) return null;
  const pick = (t) => { setOpen(false); start(async () => {
    const r = await addReminder({ kind, refId, title, url, remindAt: new Date(t).toISOString() });
    setMsg(r?.error || `Reminder set for ${new Date(r.at).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`);
  }); };
  return (
    <span className="menu-wrap">
      <button className="btn-s" onClick={() => setOpen((o) => !o)} aria-expanded={open} disabled={pending}><AlarmClock size={16} /> Remind me</button>
      {open && <div className="menu" role="menu">{options.map(([l, t]) => <button key={l} role="menuitem" onClick={() => pick(t)}>{l}</button>)}</div>}
      {msg && <span className="inline-msg" role="status"> {msg}</span>}
    </span>
  );
}

export function OpenFile({ bucket = "announcement-files", file, label }) {
  const [msg, setMsg] = useState("");
  if (!file?.path) return null;
  const go = async () => { const r = await signedUrl(bucket, file.path); if (r.url) window.open(r.url, "_blank", "noopener"); else setMsg(r.error); };
  return <span><button className="btn-s" onClick={go}><Paperclip size={16} /> {label || file.name}</button>{msg && <span className="inline-msg"> {msg}</span>}</span>;
}

export const CsvLink = ({ href, label = "Export attendees (CSV)" }) => <a className="btn-s" href={href}><Download size={16} /> {label}</a>;

export function Tabs({ tabs, current, base }) {
  return <div className="filters">{tabs.map(([v, l]) => <Link key={v} className={"chip" + (current === v ? " on" : "")} href={v === tabs[0][0] ? base : `${base}?tab=${v}`}>{l}</Link>)}</div>;
}
