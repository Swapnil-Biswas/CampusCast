"use client";
import { useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { shortBranch } from "../../lib/dash/meta";
import { setExamAccess } from "../../app/dashboard/admin/exams/actions";

// One staff member: which departments they upload exam notices for, and which they approve (head of department /
// cluster head). A central admin edits this; the database refuses anyone else.
export default function ExamAccessRow({ person, departments }) {
  const [upload, setUpload] = useState(person.admin_depts || []);
  const [approve, setApprove] = useState(person.approver_depts || []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [dirty, setDirty] = useState(false);

  const flip = (list, set, name) => { set(list.includes(name) ? list.filter((x) => x !== name) : [...list, name]); setDirty(true); setMsg(null); };
  const save = async () => {
    setBusy(true); setMsg(null);
    const r = await setExamAccess({ userId: person.id, uploadDepts: upload, approveDepts: approve });
    setBusy(false);
    if (r.error) setMsg({ err: true, text: r.error }); else { setMsg({ text: "Saved" }); setDirty(false); }
  };

  const group = (label, hint, list, set, name) => (
    <fieldset className="acc-group" disabled={busy}>
      <legend>{label}</legend>
      <small>{hint}</small>
      <div className="chips">
        {departments.map((d) => (
          <button type="button" key={d.name} className={`chip${list.includes(d.name) ? " on" : ""}`} aria-pressed={list.includes(d.name)} aria-label={`${label}: ${d.name}`} onClick={() => flip(list, set, d.name)}>{shortBranch(d.name)}</button>
        ))}
      </div>
    </fieldset>
  );

  return (
    <tr>
      <td><b>{person.full_name || "(no name)"}</b><small>{person.email}</small></td>
      <td>
        {group("Uploads for", "Information staff: upload, review, edit and submit.", upload, setUpload)}
        {group("Approves for", "Head of department: one. Cluster head: several. They approve and publish.", approve, setApprove)}
      </td>
      <td className="row-actions">
        <button type="button" className="btn-s" disabled={busy || !dirty} onClick={save}>{busy ? <LoaderCircle size={14} className="spin" /> : <Save size={14} />} Save</button>
        {msg && <small role={msg.err ? "alert" : "status"} style={msg.err ? { color: "var(--clay)" } : undefined}>{msg.text}</small>}
      </td>
    </tr>
  );
}
