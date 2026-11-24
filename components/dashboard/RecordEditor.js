"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { RECORDS } from "../../lib/dash/forms";
import { BRANCHES, YEARS } from "../../lib/college";
import { shortBranch } from "../../lib/dash/meta";
import { browserClient } from "../../lib/supabase/client";
import { deleteRecord, saveRecord } from "../../app/dashboard/official-actions";

const toLocal = (iso) => { if (!iso) return ""; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

// Add / edit / delete for any record described in lib/dash/forms.js. Shown only to people allowed to manage it.
export default function RecordEditor({ table, record, clubs = [], userId, isAdmin, big = false }) {
  const cfg = RECORDS[table];
  const router = useRouter();
  const init = () => {
    const v = {};
    for (const f of cfg.fields) v[f.k] = record ? (f.t === "datetime" ? toLocal(record[f.k]) : record[f.k] ?? "") : f.def ?? "";
    v.audience_depts = record?.audience_depts || []; v.audience_years = record?.audience_years || [];
    v.club_id = record?.club_id || (isAdmin ? "" : clubs[0]?.id || "");
    return v;
  };
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(init);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const set = (k, val) => setV((p) => ({ ...p, [k]: val }));
  const toggle = (k, x) => set(k, v[k].includes(x) ? v[k].filter((y) => y !== x) : [...v[k], x]);

  const upload = async (k, file) => {
    if (!file) return;
    if (file.size > 10 * 1048576) return setErr("That file is over 10 MB.");
    setBusy(true); setErr("");
    const path = `${userId}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    const { error } = await browserClient().storage.from(cfg.bucket).upload(path, file, { contentType: file.type });
    setBusy(false);
    if (error) return setErr(error.message);
    set(k, { name: file.name, path, size: file.size, type: file.type });
  };

  const submit = (e) => {
    e.preventDefault(); setErr("");
    start(async () => {
      const r = await saveRecord(table, record?.id || null, v);
      if (r?.error) return setErr(r.error);
      setOpen(false); if (!record) setV(init()); router.refresh();
    });
  };
  const remove = () => { if (confirm(`Delete this ${cfg.label}? This cannot be undone.`)) start(async () => { const r = await deleteRecord(table, record.id); if (r?.error) setErr(r.error); else router.refresh(); }); };

  if (!open) {
    return (
      <span className="notice-actions" style={{ margin: 0 }}>
        {record ? (
          <>
            <button className="btn-s" onClick={() => setOpen(true)}><Pencil size={16} /> Edit</button>
            <button className="btn-s ghost" onClick={remove} disabled={pending}><Trash2 size={16} /> Delete</button>
            {err && <span className="inline-msg" role="alert">{err}</span>}
          </>
        ) : <button className={big ? "btn" : "btn-s clay"} onClick={() => setOpen(true)}><Plus size={16} /> Add {cfg.label}</button>}
      </span>
    );
  }

  return (
    <form className="form editor" onSubmit={submit} style={{ margin: "12px 0", padding: 16, background: "var(--soft)", border: "1.5px solid var(--ink)", borderRadius: 14, maxWidth: "none" }}>
      <div className="notice-top"><b>{record ? `Edit ${cfg.label}` : `New ${cfg.label}`}</b><button type="button" className="icon-btn" style={{ marginLeft: "auto" }} aria-label="Close" onClick={() => setOpen(false)}><X size={18} /></button></div>
      {cfg.fields.filter((f) => !f.only || f.only.includes(v.kind)).map((f) => (
        <div className="field" key={f.k}>
          <label htmlFor={`${table}-${f.k}`}>{f.label}{f.req ? " *" : ""}</label>
          {f.t === "textarea" ? <textarea id={`${table}-${f.k}`} value={v[f.k]} onChange={(e) => set(f.k, e.target.value)} style={{ minHeight: 90 }} />
            : f.t === "select" ? <select id={`${table}-${f.k}`} value={v[f.k]} onChange={(e) => set(f.k, e.target.value)}>{f.options.map(([o, l]) => <option key={o} value={o}>{l}</option>)}</select>
            : f.t === "file" ? (
              <>
                <input id={`${table}-${f.k}`} type="file" accept={table === "events" ? "image/*" : ".pdf,image/*"} onChange={(e) => upload(f.k, e.target.files[0])} disabled={busy} />
                {v[f.k]?.name && <small>Attached: {v[f.k].name} <button type="button" className="link-btn" onClick={() => set(f.k, "")}>remove</button></small>}
              </>
            ) : <input id={`${table}-${f.k}`} type={f.t === "datetime" ? "datetime-local" : f.t === "number" ? "number" : f.t === "url" ? "url" : "text"}
                value={v[f.k]} min={f.min} max={f.max} placeholder={f.ph} onChange={(e) => set(f.k, e.target.value)} required={f.req || (f.k === "exam_at" && v.kind === "exam")} />}
          {f.help && <small>{f.help}</small>}
        </div>
      ))}
      {cfg.audience && (
        <>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend className="lab">Departments <small>(none = everyone)</small></legend>
            <div className="checks">{BRANCHES.map((b) => <label key={b}><input type="checkbox" checked={v.audience_depts.includes(b)} onChange={() => toggle("audience_depts", b)} /> {shortBranch(b)}</label>)}</div></fieldset>
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend className="lab">Years <small>(none = all)</small></legend>
            <div className="checks">{YEARS.map((y) => <label key={y}><input type="checkbox" checked={v.audience_years.includes(y)} onChange={() => toggle("audience_years", y)} /> Year {y}</label>)}</div></fieldset>
        </>
      )}
      {cfg.club && (
        <div className="field"><label htmlFor={`${table}-club`}>Club {isAdmin ? "(optional)" : ""}</label>
          <select id={`${table}-club`} value={v.club_id} onChange={(e) => set("club_id", e.target.value)} required={!isAdmin}>
            {isAdmin && <option value="">No club</option>}{clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      )}
      {err && <p className="form-msg err" role="alert">{err}</p>}
      <div><button className="btn" disabled={pending || busy}>{pending ? "Saving…" : "Save"}</button></div>
    </form>
  );
}
