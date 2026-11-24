"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { AlarmClock, Bookmark, BookmarkCheck, CalendarClock, Check, CheckCheck, ChevronDown, Eye, EyeOff, Paperclip, Pin } from "lucide-react";
import { CATEGORIES, URGENCY, audienceLabel } from "../../lib/dash/meta";
import { acknowledge, addReminder, setRead, signedUrl, toggleBookmark } from "../../app/dashboard/actions";
import RelTime from "./RelTime";

// One notice in the feed: urgency, audience, body, attachments, and the actions a student needs
// (read receipt, acknowledge, save, remind me). Opening a notice counts as reading it.
export default function NoticeCard({ n, openId, big = false }) {
  const urg = URGENCY[n.urgency];
  const cat = CATEGORIES[n.category] || CATEGORIES.general;
  const [open, setOpen] = useState(openId === n.id || big);
  const [read, setReadState] = useState(!!n.read_at);
  const [acked, setAcked] = useState(!!n.acked_at);
  const [saved, setSaved] = useState(!!n.saved);
  const [menu, setMenu] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const ref = useRef(null);

  useEffect(() => { if (openId === n.id) ref.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [openId, n.id]);

  const markRead = () => { if (!read) { setReadState(true); start(() => setRead(n.id, true)); } };
  const toggleOpen = () => { setOpen((o) => !o); if (!open) markRead(); };
  const flip = (on) => { setReadState(on); start(() => setRead(n.id, on)); };
  const save = () => { const v = !saved; setSaved(v); start(async () => { const r = await toggleBookmark(n.id, v); if (r?.error) { setSaved(!v); setMsg(r.error); } }); };
  const ack = () => { setAcked(true); setReadState(true); start(async () => { const r = await acknowledge(n.id); if (r?.error) { setAcked(false); setMsg(r.error); } }); };

  const remind = (iso) => {
    setMenu(false);
    start(async () => {
      const r = await addReminder({ kind: "announcement", refId: n.id, title: n.title, url: `/dashboard?open=${n.id}`, remindAt: iso });
      setMsg(r?.error || `Reminder set for ${new Date(r.at).toLocaleString("en-IN", { weekday: "short", hour: "numeric", minute: "2-digit" })}`);
    });
  };
  const options = (() => {
    const now = Date.now(), out = [];
    const ev = n.event_at ? new Date(n.event_at).getTime() : null;
    if (ev) { [["1 day before", ev - 864e5], ["1 hour before", ev - 36e5], ["At the start", ev]].forEach(([l, t]) => t > now + 60000 && out.push([l, t])); }
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0);
    out.push(["In 3 hours", now + 3 * 36e5], ["Tomorrow, 9:00 am", tomorrow.getTime()]);
    return out;
  })();

  const openFile = async (a) => {
    const r = await signedUrl("announcement-files", a.path);
    if (r.url) window.open(r.url, "_blank", "noopener"); else setMsg(r.error);
  };

  const needsAck = n.urgency === 0 && !acked;

  return (
    <article ref={ref} id={`a-${n.id}`} className={`notice${read ? "" : " unread"}${needsAck ? " must" : ""}${big ? " big" : ""}`} style={{ "--u": urg.color }}>
      <div className="notice-top">
        <span className="pill" style={{ background: urg.color, color: urg.text }}>{urg.label}</span>
        <span className="pill soft" style={{ "--c": cat.color }}>{cat.label}</span>
        {n.clubs?.name && <span className="pill soft" style={{ "--c": n.clubs.color }}>{n.clubs.name}</span>}
        {n.pinned && <span className="pin"><Pin size={14} /> Pinned</span>}
        <RelTime className="when" date={n.publish_at} />
      </div>

      <h3 className="notice-title"><button onClick={toggleOpen} aria-expanded={open}>{n.title}</button></h3>
      <p className="audience">For {audienceLabel(n)}</p>

      <div className={"notice-body" + (open ? " open" : "")}>
        <p>{n.body}</p>
      </div>
      {!open && n.body.length > 140 && <button className="link-btn more" onClick={toggleOpen}>Read more <ChevronDown size={14} /></button>}

      {n.event_at && (
        <p className="when-line"><CalendarClock size={16} /> {new Date(n.event_at).toLocaleString("en-IN", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })} · <RelTime date={n.event_at} mode="until" /></p>
      )}

      {open && n.attachments?.length > 0 && (
        <ul className="files">
          {n.attachments.map((a) => <li key={a.path}><button className="file" onClick={() => openFile(a)}><Paperclip size={15} /> {a.name}<small>{a.size ? Math.max(1, Math.round(a.size / 1024)) + " KB" : ""}</small></button></li>)}
        </ul>
      )}

      <div className="notice-actions">
        {n.urgency === 0 && (acked
          ? <span className="acked"><CheckCheck size={16} /> Acknowledged</span>
          : <button className="btn-s clay" onClick={ack} disabled={pending}><Check size={16} /> I have seen this</button>)}
        <button className="btn-s" onClick={save} aria-pressed={saved}>{saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />} {saved ? "Saved" : "Save"}</button>
        <div className="menu-wrap">
          <button className="btn-s" onClick={() => setMenu((m) => !m)} aria-expanded={menu}><AlarmClock size={16} /> Remind me</button>
          {menu && (
            <div className="menu" role="menu">
              {options.map(([l, t]) => <button key={l} role="menuitem" onClick={() => remind(new Date(t).toISOString())}>{l}</button>)}
            </div>
          )}
        </div>
        <button className="btn-s ghost" onClick={() => flip(!read)}>{read ? <><EyeOff size={16} /> Mark unread</> : <><Eye size={16} /> Mark read</>}</button>
        {msg && <span className="inline-msg" role="status">{msg}</span>}
      </div>
    </article>
  );
}
