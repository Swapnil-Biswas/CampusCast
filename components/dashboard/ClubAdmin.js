"use client";
import { useActionState, useState, useTransition } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { addClubLead, deleteClub, removeClubLead, saveClub } from "../../app/dashboard/admin/actions";

export function NewClub() {
  const [state, action, pending] = useActionState(saveClub, null);
  return (
    <form action={action} className="form" style={{ marginBottom: 20 }}>
      <div className="field"><label htmlFor="cn">New club</label><input id="cn" name="name" type="text" required placeholder="e.g. Astronomy Club" /></div>
      <div className="field"><label htmlFor="cd">Description</label><input id="cd" name="description" type="text" /></div>
      <div className="field"><label htmlFor="cc">Colour</label><input id="cc" name="color" type="color" defaultValue="#e8603c" /></div>
      {state?.error && <p className="form-msg err" role="alert">{state.error}</p>}
      {state?.ok && <p className="form-msg" role="status">Club added.</p>}
      <div><button className="btn" disabled={pending}><Plus size={18} /> Add club</button></div>
    </form>
  );
}

export function ClubCard({ club, leads, isSuper }) {
  const [list, setList] = useState(leads);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [gone, setGone] = useState(false);
  const [pending, start] = useTransition();
  if (gone) return null;

  const add = () => start(async () => {
    const r = await addClubLead(club.id, email);
    if (r?.error) return setMsg(r.error);
    setMsg("Lead added."); setList([...list, { user_id: r.user_id, name: r.name }]); setEmail("");
  });
  const remove = (l) => start(async () => { const r = await removeClubLead(club.id, l.user_id); if (r?.error) setMsg(r.error); else setList(list.filter((x) => x !== l)); });

  return (
    <article className="notice" style={{ "--u": club.color }}>
      <h3 className="notice-title">{club.name}</h3>
      <p className="audience">{club.description || "No description"} · {club.followers} follower{club.followers === 1 ? "" : "s"}</p>
      <p><b>Leads:</b> {list.length === 0 && <span className="audience">none yet</span>}</p>
      <ul className="files">{list.map((l) => (
        <li key={l.user_id}><span className="file">{l.name}{isSuper && <button className="icon-btn" style={{ width: 24, height: 24 }} aria-label={`Remove ${l.name}`} disabled={pending} onClick={() => remove(l)}><X size={14} /></button>}</span></li>
      ))}</ul>
      {isSuper && (
        <div className="notice-actions">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Student email to make a lead" aria-label={`Add lead to ${club.name}`} style={{ padding: "6px 10px", border: "1.5px solid var(--line)", borderRadius: 10 }} />
          <button className="btn-s" disabled={pending || !email} onClick={add}><Plus size={16} /> Add lead</button>
        </div>
      )}
      <div className="notice-actions">
        <button className="btn-s ghost" disabled={pending} onClick={() => { if (confirm(`Delete ${club.name}? Followers and leads are removed too.`)) start(async () => { const r = await deleteClub(club.id); if (r?.error) setMsg(r.error); else setGone(true); }); }}><Trash2 size={16} /> Delete club</button>
        {msg && <span className="inline-msg" role="status">{msg}</span>}
      </div>
    </article>
  );
}
