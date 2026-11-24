"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Plus, Send, X } from "lucide-react";
import { browserClient } from "../../lib/supabase/client";
import { createListing, respondListing, sendMessage, setListingStatus } from "../../app/dashboard/community-actions";
import { ReportBlock, useAct } from "./Common";

import { XCHANGE_CATEGORIES as CATEGORIES, XCHANGE_CONDITIONS as CONDITIONS } from "../../lib/dash/meta";

export function ListingForm({ userId }) {
  const { msg, setMsg, pending, act } = useAct();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [images, setImages] = useState([]);
  const [v, setV] = useState({ title: "", price: "", category: "books", condition: "good", description: "" });
  const set = (k, x) => setV((p) => ({ ...p, [k]: x }));

  const pick = async (e) => {
    const files = [...e.target.files]; e.target.value = "";
    if (images.length + files.length > 4) return setMsg("Up to 4 photos.");
    setBusy(true); setMsg("");
    const out = [];
    for (const f of files) {
      if (f.size > 5 * 1048576) { setMsg(`${f.name} is over 5 MB.`); continue; }
      const path = `${userId}/${Date.now()}-${f.name.replace(/[^\w.-]+/g, "_")}`;
      const { error } = await browserClient().storage.from("listing-images").upload(path, f, { contentType: f.type });
      if (error) setMsg(error.message); else out.push({ path, name: f.name });
    }
    setImages((p) => [...p, ...out]); setBusy(false);
  };
  const drop = async (img) => { setImages((p) => p.filter((x) => x.path !== img.path)); await browserClient().storage.from("listing-images").remove([img.path]); };

  if (!open) return <button className="btn" onClick={() => setOpen(true)}><Plus size={16} /> Sell something</button>;
  return (
    <form className="form" style={{ padding: 16, background: "var(--soft)", border: "1.5px solid var(--ink)", borderRadius: 14, maxWidth: "none", marginBottom: 16 }}
      onSubmit={(e) => { e.preventDefault(); act(() => createListing({ ...v, images }), () => { setOpen(false); setImages([]); setV({ title: "", price: "", category: "books", condition: "good", description: "" }); }); }}>
      <div className="field"><label htmlFor="lt">What are you selling?</label><input id="lt" type="text" required minLength={3} maxLength={100} value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="Data Structures by Cormen, 4th edition" /></div>
      <div className="field"><label htmlFor="lp">Price (₹, 0 for free)</label><input id="lp" type="number" required min={0} max={1000000} value={v.price} onChange={(e) => set("price", e.target.value)} /></div>
      <div className="field"><label htmlFor="lc">Category</label><select id="lc" value={v.category} onChange={(e) => set("category", e.target.value)}>{Object.entries(CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <div className="field"><label htmlFor="ln">Condition</label><select id="ln" value={v.condition} onChange={(e) => set("condition", e.target.value)}>{Object.entries(CONDITIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
      <div className="field"><label htmlFor="ld">Details</label><textarea id="ld" maxLength={1500} value={v.description} onChange={(e) => set("description", e.target.value)} style={{ minHeight: 70 }} /></div>
      <div className="field"><label htmlFor="li">Photos <small>(up to 4, JPG/PNG/WebP, 5 MB each)</small></label><input id="li" type="file" accept="image/*" multiple onChange={pick} disabled={busy} />
        {images.length > 0 && <ul className="files">{images.map((i) => <li key={i.path}><span className="file">{i.name} <button type="button" className="icon-btn" style={{ width: 24, height: 24 }} aria-label={`Remove ${i.name}`} onClick={() => drop(i)}><X size={14} /></button></span></li>)}</ul>}</div>
      <small>Listings stay up for 30 days. Only verified students of your college can see them.</small>
      {msg && <p className="form-msg err" role="alert">{msg}</p>}
      <div className="notice-actions"><button className="btn" disabled={pending || busy}>List it</button><button type="button" className="btn-s" onClick={() => setOpen(false)}>Cancel</button></div>
    </form>
  );
}

export function OwnListingControls({ id, status }) {
  const { msg, pending, act } = useAct();
  return (
    <span className="notice-actions" style={{ margin: 0 }}>
      {status === "active" && <button className="btn-s clay" disabled={pending} onClick={() => act(() => setListingStatus(id, "sold"))}><Check size={16} /> Mark sold</button>}
      {status === "sold" && <button className="btn-s" disabled={pending} onClick={() => act(() => setListingStatus(id, "active"))}>Relist</button>}
      <button className="btn-s ghost" disabled={pending} onClick={() => { if (confirm("Delete this listing?")) act(() => setListingStatus(id, "delete")); }}>Delete</button>
      {msg && <span className="inline-msg" role="alert">{msg}</span>}
    </span>
  );
}

export function Respond({ id }) {
  const { msg, pending, act } = useAct();
  return (
    <span className="notice-actions" style={{ margin: 0 }}>
      <button className="btn-s clay" disabled={pending} onClick={() => act(() => respondListing(id, true))}><Check size={16} /> Accept and open chat</button>
      <button className="btn-s" disabled={pending} onClick={() => act(() => respondListing(id, false))}><X size={16} /> Decline</button>
      {msg && <span className="inline-msg" role="alert">{msg}</span>}
    </span>
  );
}

// Live chat for one accepted request. New messages arrive without refreshing.
export function Chat({ requestId, me, initial }) {
  const [msgs, setMsgs] = useState(initial);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [pending, setPending] = useState(false);
  const end = useRef(null);

  useEffect(() => {
    const sb = browserClient();
    const ch = sb.channel(`chat-${requestId}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `request_id=eq.${requestId}` },
      (p) => setMsgs((m) => (m.some((x) => x.id === p.new.id) ? m : [...m, p.new]))).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [requestId]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [msgs.length]);

  const send = async (e) => {
    e.preventDefault(); if (!text.trim()) return;
    setPending(true); setErr("");
    const r = await sendMessage(requestId, text);
    setPending(false);
    if (r?.error) return setErr(r.error);
    setText("");
  };
  return (
    <div className="chat">
      <div className="chat-log" role="log" aria-live="polite">
        {msgs.length === 0 && <p className="audience">Say hello. Meet in a public place on campus and pay in person.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={"bubble" + (m.sender_id === me ? " me" : "")}>
            <span>{m.body}</span>
            <small>{new Date(m.created_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}{m.sender_id !== me && <> · <ReportBlock kind="message" refId={m.id} ownerId={m.sender_id} /></>}</small>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className="notice-actions" onSubmit={send} style={{ margin: 0 }}>
        <input type="text" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="Type a message" aria-label="Message" style={{ flex: 1, padding: "8px 10px", border: "1.5px solid var(--line)", borderRadius: 10, background: "var(--card)", font: "inherit" }} />
        <button className="btn-s clay" disabled={pending || !text.trim()}><Send size={16} /> Send</button>
      </form>
      {err && <p className="inline-msg" role="alert">{err}</p>}
    </div>
  );
}
