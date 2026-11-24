"use client";
import { useEffect, useState } from "react";
import { BellRing, Mail, Send, X } from "lucide-react";
import { markAllNotificationsRead, removeReminder } from "../../app/dashboard/actions";
import { unblockUser } from "../../app/dashboard/community-actions";
import { removePushSubscription, savePrefs, saveProfile, savePushSubscription, sendTestAlert } from "../../app/dashboard/account-actions";
import { useAct } from "./Common";

export function RemoveReminder({ id }) {
  const { pending, act } = useAct();
  return <button className="icon-btn" style={{ width: 24, height: 24 }} aria-label="Remove reminder" disabled={pending} onClick={() => act(() => removeReminder(id))}><X size={14} /></button>;
}

export function Unblock({ id }) {
  const { msg, pending, act } = useAct();
  return <span><button className="btn-s" disabled={pending} onClick={() => act(() => unblockUser(id))}>Unblock</button>{msg && <span className="inline-msg"> {msg}</span>}</span>;
}

export function ProfileForm({ p }) {
  const { msg, setMsg, pending, act } = useAct();
  const [v, setV] = useState({ bio: p.bio || "", section: p.section || "", skills: (p.skills || []).join(", "), interests: (p.interests || []).join(", ") });
  const set = (k, x) => { setV((o) => ({ ...o, [k]: x })); setMsg(""); };
  const [saved, setSaved] = useState(false);
  return (
    <form className="form" style={{ maxWidth: 560 }} onSubmit={(e) => { e.preventDefault(); setSaved(false); act(() => saveProfile(v), () => setSaved(true)); }}>
      <div className="field"><label htmlFor="pb">About you <small>(shown to people you connect with)</small></label><textarea id="pb" maxLength={400} value={v.bio} onChange={(e) => set("bio", e.target.value)} style={{ minHeight: 80 }} /></div>
      <div className="field"><label htmlFor="ps">Section</label><input id="ps" type="text" maxLength={10} value={v.section} onChange={(e) => set("section", e.target.value)} placeholder="A" style={{ maxWidth: 120 }} /></div>
      <div className="field"><label htmlFor="pk">Skills <small>(comma separated, used by Connect)</small></label><input id="pk" type="text" value={v.skills} onChange={(e) => set("skills", e.target.value)} placeholder="react, python, figma" /></div>
      <div className="field"><label htmlFor="pi">Interests <small>(comma separated)</small></label><input id="pi" type="text" value={v.interests} onChange={(e) => set("interests", e.target.value)} placeholder="hackathons, robotics, music" /></div>
      {msg && <p className="form-msg err" role="alert">{msg}</p>}
      {saved && !msg && <p className="form-msg ok" role="status">Saved.</p>}
      <div className="notice-actions"><button className="btn" disabled={pending}>Save profile</button></div>
    </form>
  );
}

const b64 = (s) => { const pad = "=".repeat((4 - (s.length % 4)) % 4); const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };

// Email, browser push, daily digest, quiet hours, and a button to prove it all works.
export function NotifSettings({ prefs, vapidKey, emailReady, devices }) {
  const { msg, setMsg, pending, act } = useAct();
  const [v, setV] = useState({ email: prefs.email, push: prefs.push, digest: prefs.digest, urgent_overrides_quiet: prefs.urgent_overrides_quiet, quiet_start: prefs.quiet_start ?? "", quiet_end: prefs.quiet_end ?? "" });
  const [push, setPush] = useState({ state: "checking", here: false });
  const [note, setNote] = useState("");
  const set = (k, x) => { setV((o) => ({ ...o, [k]: x })); setNote(""); };

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setPush({ state: "unsupported", here: false });
      if (!vapidKey) return setPush({ state: "off-server", here: false });
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      setPush({ state: Notification.permission === "denied" ? "blocked" : "ready", here: !!sub });
    })().catch(() => setPush({ state: "unsupported", here: false }));
  }, [vapidKey]);

  const enableHere = async () => {
    setMsg("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setPush({ state: "blocked", here: false });
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(vapidKey) }));
      const r = await savePushSubscription(sub.toJSON());
      if (r.error) return setMsg(r.error);
      setPush({ state: "ready", here: true }); set("push", true);
      await savePrefs({ ...v, push: true });
      setNote("Alerts on this device are on.");
    } catch (e) { setMsg(e.message || "Could not turn on alerts here."); }
  };
  const disableHere = async () => {
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) { await removePushSubscription(sub.endpoint); await sub.unsubscribe(); }
    setPush((p) => ({ ...p, here: false })); setNote("Alerts on this device are off.");
  };

  return (
    <div style={{ maxWidth: 620 }}>
      <form className="form" style={{ maxWidth: "none" }} onSubmit={(e) => { e.preventDefault(); act(() => savePrefs(v), () => setNote("Settings saved.")); }}>
        <fieldset className="checks" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700, marginBottom: 6 }}>How should urgent notices reach you?</legend>
          <label><span style={{ display: "inline-flex", gap: 8 }}><input type="checkbox" checked disabled /> In the app, live (always on)</span></label>
          <label><span style={{ display: "inline-flex", gap: 8 }}><input type="checkbox" checked={v.email} onChange={(e) => set("email", e.target.checked)} /> <Mail size={16} /> Email for Now and Today notices and reminders{!emailReady && <small> (email sending is being set up)</small>}</span></label>
          <label><span style={{ display: "inline-flex", gap: 8 }}><input type="checkbox" checked={v.push} onChange={(e) => set("push", e.target.checked)} /> <BellRing size={16} /> Browser or phone push alerts</span></label>
          <label><span style={{ display: "inline-flex", gap: 8 }}><input type="checkbox" checked={v.digest} onChange={(e) => set("digest", e.target.checked)} /> Daily digest at 7 am of everything that was not urgent</span></label>
        </fieldset>

        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="qs">Quiet hours <small>(India time; email and push wait until they end)</small></label>
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <select id="qs" aria-label="Quiet hours start" value={v.quiet_start} onChange={(e) => set("quiet_start", e.target.value)}><option value="">Off</option>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select>
            <span>to</span>
            <select aria-label="Quiet hours end" value={v.quiet_end} onChange={(e) => set("quiet_end", e.target.value)}><option value="">Off</option>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select>
          </span>
          <label className="checks" style={{ marginTop: 8 }}><span style={{ display: "inline-flex", gap: 8 }}><input type="checkbox" checked={v.urgent_overrides_quiet} onChange={(e) => set("urgent_overrides_quiet", e.target.checked)} /> Still alert me about Now and Today notices</span></label>
        </div>
        {msg && <p className="form-msg err" role="alert">{msg}</p>}
        {note && !msg && <p className="form-msg ok" role="status">{note}</p>}
        <div className="notice-actions"><button className="btn" disabled={pending}>Save settings</button>
          <button type="button" className="btn-s" disabled={pending} onClick={() => act(() => sendTestAlert(), () => setNote("Test alert sent. It reaches the bell now; email and push follow within a minute."))}><Send size={16} /> Send me a test alert</button></div>
      </form>

      <section style={{ marginTop: 22 }} aria-label="This device">
        <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>This device</h2>
        {push.state === "checking" && <p className="audience">Checking…</p>}
        {push.state === "unsupported" && <p className="audience">This browser cannot show push alerts. On iPhone, add CampusCast to your Home Screen first, or use Chrome on Android or desktop.</p>}
        {push.state === "off-server" && <p className="audience">Push alerts are being set up and will be available soon.</p>}
        {push.state === "blocked" && <p className="audience">Notifications are blocked for this site. Allow them in your browser's site settings, then come back here.</p>}
        {push.state === "ready" && (push.here
          ? <p className="notice-actions" style={{ margin: 0 }}><span className="acked">Push alerts are on for this device.</span><button className="btn-s" onClick={disableHere}>Turn off here</button></p>
          : <button className="btn-s clay" onClick={enableHere}><BellRing size={16} /> Turn on alerts on this device</button>)}
        <p className="audience">{devices} device{devices === 1 ? "" : "s"} registered in total.</p>
      </section>
    </div>
  );
}

export function MarkAllRead({ disabled }) {
  const { pending, act } = useAct();
  return <button className="btn-s" disabled={disabled || pending} onClick={() => act(() => markAllNotificationsRead())}>Mark all as read</button>;
}
