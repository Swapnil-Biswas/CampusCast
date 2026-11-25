"use client";
import { useState, useTransition } from "react";
import { ROLE_LABEL, shortBranch } from "../../lib/dash/meta";
import { setRole } from "../../app/dashboard/admin/actions";
import { setPersonType } from "../../app/dashboard/connect/people-actions";

export default function RoleRow({ p, self }) {
  const [role, setR] = useState(p.role);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const change = (v) => {
    if (v === role) return;
    if (!confirm(`Make ${p.full_name || p.email} ${ROLE_LABEL[v]}?`)) return;
    start(async () => { const r = await setRole(p.id, v); if (r?.error) setMsg(r.error); else { setR(v); setMsg("Saved"); } });
  };
  const [type, setT] = useState(p.person_type);
  const changeType = (v) => {
    if (v === type) return;
    if (!confirm(`Show ${p.full_name || p.email} in Connect as ${v === "faculty" ? "faculty" : "a student"}?`)) return;
    start(async () => { const x = await setPersonType(p.id, v); if (x?.error) setMsg(x.error); else { setT(v); setMsg("Saved"); } });
  };
  return (
    <tr>
      <td><b>{p.full_name || "(no name)"}</b><small>{p.email}</small></td>
      <td>{shortBranch(p.branch)} · Y{p.year}</td>
      <td>{p.status}</td>
      <td>
        <select value={role} disabled={pending || p.status !== "verified"} aria-label={`Role for ${p.email}`} onChange={(e) => change(e.target.value)}>
          {Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {self && <small> (you)</small>}
        {msg && <small role="status"> {msg}</small>}
      </td>
      <td>
        {type ? (
          <select value={type} disabled={pending || p.status !== "verified"} aria-label={`Connect type for ${p.email}`} onChange={(e) => changeType(e.target.value)}>
            <option value="student">Student</option><option value="faculty">Faculty</option>
          </select>
        ) : <small>Run dashboard-9</small>}
      </td>
    </tr>
  );
}
