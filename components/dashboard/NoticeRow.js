"use client";
import { useState, useTransition } from "react";
import { Archive, BarChart3, Pin, PinOff, RotateCcw, Trash2 } from "lucide-react";
import { CATEGORIES, URGENCY, audienceLabel, fmtDate } from "../../lib/dash/meta";
import { deleteNotice, setNoticeStatus, togglePin } from "../../app/dashboard/admin/actions";
import { browserClient } from "../../lib/supabase/client";

const Bar = ({ label, n, r }) => (
  <div className="barrow"><span>{label}</span><div className="bar"><i style={{ width: n ? `${Math.round((r / n) * 100)}%` : 0 }} /></div><b>{r}/{n}</b></div>
);

// One notice in the admin list: status controls plus reach (who read it, who has not).
export default function NoticeRow({ n }) {
  const [row, setRow] = useState(n);
  const [stats, setStats] = useState(null);
  const [showUnread, setShowUnread] = useState(false);
  const [msg, setMsg] = useState("");
  const [gone, setGone] = useState(false);
  const [pending, start] = useTransition();
  const u = URGENCY[row.urgency];

  const run = (fn, apply) => start(async () => { const r = await fn(); if (r?.error) setMsg(r.error); else { setMsg(""); apply?.(); } });
  const loadStats = async () => {
    if (stats) return setStats(null);
    const { data, error } = await browserClient().rpc("announcement_stats", { p_id: row.id });
    if (error) setMsg(error.message); else setStats(data);
  };
  if (gone) return null;

  return (
    <article className="notice" style={{ "--u": u.color }}>
      <div className="notice-top">
        <span className="pill" style={{ background: u.color, color: u.text }}>{u.label}</span>
        <span className="pill soft" style={{ "--c": (CATEGORIES[row.category] || CATEGORIES.general).color }}>{(CATEGORIES[row.category] || CATEGORIES.general).label}</span>
        <span className="pill soft" style={{ "--c": row.status === "live" ? "#7fb48a" : row.status === "scheduled" ? "#f3b63f" : "#bbb" }}>{row.status}</span>
        {row.pinned && <span className="pin"><Pin size={14} /> Pinned</span>}
        <span className="when">{fmtDate(row.publish_at)}</span>
      </div>
      <h3 className="notice-title">{row.title}</h3>
      <p className="audience">For {audienceLabel(row, row.clubs?.name)}{row.profiles?.full_name ? ` · by ${row.profiles.full_name}` : ""}</p>

      <div className="notice-actions">
        <button className="btn-s" onClick={loadStats}><BarChart3 size={16} /> {stats ? "Hide reach" : "Reach"}</button>
        <button className="btn-s" disabled={pending} onClick={() => run(() => togglePin(row.id, !row.pinned), () => setRow({ ...row, pinned: !row.pinned }))}>
          {row.pinned ? <><PinOff size={16} /> Unpin</> : <><Pin size={16} /> Pin</>}</button>
        {row.status === "archived"
          ? <button className="btn-s" disabled={pending} onClick={() => run(() => setNoticeStatus(row.id, "live"), () => setRow({ ...row, status: "live" }))}><RotateCcw size={16} /> Republish</button>
          : <button className="btn-s" disabled={pending} onClick={() => run(() => setNoticeStatus(row.id, "archived"), () => setRow({ ...row, status: "archived" }))}><Archive size={16} /> Archive</button>}
        <button className="btn-s ghost" disabled={pending} onClick={() => { if (confirm("Delete this notice for everyone? This cannot be undone.")) run(() => deleteNotice(row.id), () => setGone(true)); }}><Trash2 size={16} /> Delete</button>
        {msg && <span className="inline-msg" role="alert">{msg}</span>}
      </div>

      {stats && (
        <div className="stats-box">
          <p><b>{stats.reads}</b> of <b>{stats.audience}</b> read ({stats.audience ? Math.round((stats.reads / stats.audience) * 100) : 0}%)
            {row.urgency === 0 && <> · <b>{stats.acks}</b> acknowledged</>}</p>
          {stats.by_branch.map((b) => <Bar key={b.label} label={b.label} n={b.audience} r={b.reads} />)}
          {stats.by_year.map((b) => <Bar key={b.label} label={b.label} n={b.audience} r={b.reads} />)}
          {stats.unread.length > 0 && (
            <>
              <button className="link-btn" onClick={() => setShowUnread((s) => !s)}>{showUnread ? "Hide" : "Show"} {stats.unread.length} who have not read it</button>
              {showUnread && <ul className="plain">{stats.unread.map((s, i) => <li key={i}>{s.name || "(no name)"} · {s.usn || "-"} · Year {s.year}</li>)}</ul>}
            </>
          )}
        </div>
      )}
    </article>
  );
}
