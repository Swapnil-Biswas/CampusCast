"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Bell, BellRing, CheckCheck, X } from "lucide-react";
import { browserClient } from "../../lib/supabase/client";
import { URGENCY, timeAgo } from "../../lib/dash/meta";
import { markAllNotificationsRead, markNotificationRead } from "../../app/dashboard/actions";

// The bell: unread count, a list of recent notifications, and live alerts the moment something urgent lands.
export default function NotificationBell({ userId, initialUnread }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [unread, setUnread] = useState(initialUnread);
  const [toast, setToast] = useState(null);
  const [, start] = useTransition();
  const box = useRef(null);

  const load = useCallback(async () => {
    const { data } = await browserClient().from("notifications").select("id, kind, title, body, url, urgency, created_at, read_at").order("created_at", { ascending: false }).limit(20);
    setItems(data || []);
  }, []);

  useEffect(() => {
    const sb = browserClient();
    const ch = sb.channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) => {
        const n = payload.new;
        setUnread((u) => u + 1);
        setItems((cur) => (cur ? [n, ...cur].slice(0, 20) : cur));
        setToast(n);
        if (n.urgency > 1) setTimeout(() => setToast((t) => (t && t.id === n.id ? null : t)), 7000);
        if (typeof navigator !== "undefined" && navigator.vibrate && n.urgency <= 1) navigator.vibrate([120, 60, 120]);
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [userId]);

  useEffect(() => { if (open && items === null) load(); }, [open, items, load]);
  useEffect(() => {
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const readOne = (n) => {
    if (n.read_at) return;
    setItems((cur) => cur?.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    setUnread((u) => Math.max(0, u - 1));
    start(() => markNotificationRead(n.id));
  };
  const readAll = () => {
    setItems((cur) => cur?.map((x) => ({ ...x, read_at: x.read_at || new Date().toISOString() })));
    setUnread(0);
    start(() => markAllNotificationsRead());
  };

  return (
    <div className="bell" ref={box}>
      <button className="icon-btn" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {unread ? <BellRing size={20} /> : <Bell size={20} />}
        {unread > 0 && <span className="bell-count">{unread > 99 ? "99+" : unread}</span>}
      </button>

      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <b>Notifications</b>
            <button className="link-btn" onClick={readAll} disabled={!unread}><CheckCheck size={15} /> Mark all read</button>
          </div>
          <div className="bell-list">
            {items === null && <p className="muted pad">Loading…</p>}
            {items?.length === 0 && <p className="muted pad">Nothing yet. New notices for you will appear here instantly.</p>}
            {items?.map((n) => (
              <Link key={n.id} href={n.url || "/dashboard"} className={"bell-item" + (n.read_at ? "" : " unread")} onClick={() => { readOne(n); setOpen(false); }}>
                <i className="urg-dot" style={{ background: URGENCY[n.urgency]?.color }} />
                <span><b>{n.title}</b>{n.body && <small>{n.body}</small>}<em>{URGENCY[n.urgency]?.label} · {timeAgo(n.created_at)}</em></span>
              </Link>
            ))}
          </div>
          <Link href="/dashboard/notifications" className="bell-foot" onClick={() => setOpen(false)}>All notifications and settings</Link>
        </div>
      )}

      {toast && (
        <div className={"toast" + (toast.urgency <= 1 ? " urgent" : "")} role="alert" style={{ "--c": URGENCY[toast.urgency]?.color }}>
          <span className="toast-tag" style={{ background: URGENCY[toast.urgency]?.color, color: URGENCY[toast.urgency]?.text }}>{URGENCY[toast.urgency]?.label}</span>
          <Link href={toast.url || "/dashboard"} onClick={() => { readOne(toast); setToast(null); }}><b>{toast.title}</b><small>{toast.body}</small></Link>
          <button className="icon-btn sm" aria-label="Dismiss" onClick={() => setToast(null)}><X size={16} /></button>
        </div>
      )}
    </div>
  );
}
