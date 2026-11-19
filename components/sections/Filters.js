"use client";
import { useMemo, useState } from "react";
import { depts, years, clubs, notices, URGENCY_LABELS } from "../../lib/data";

const UC = ["#e8603c", "#f3b63f", "#8ec5d6", "#7fb48a"];

// The same targeting logic the real feed runs on: set a profile and the rest of the noise dims.
export default function Filters() {
  const [dept, setDept] = useState("CSE");
  const [year, setYear] = useState(2);
  const [mine, setMine] = useState(["Coding Club"]);
  const [urgent, setUrgent] = useState(false);
  const toggleClub = (c) => setMine((m) => (m.includes(c) ? m.filter((x) => x !== c) : [...m, c]));

  const rows = useMemo(() => notices.map((n) => {
    const hit = (!n.depts || n.depts.includes(dept)) && (!n.years || n.years.includes(year)) && (!n.club || mine.includes(n.club)) && (!urgent || n.u <= 1);
    return { ...n, hit };
  }), [dept, year, mine, urgent]);
  const hits = rows.filter((r) => r.hit).length;
  const sorted = [...rows].sort((a, b) => (b.hit - a.hit) || (a.u - b.u) || (a.id - b.id));

  return (
    <section className="try" id="try">
      <div className="wrap">
        <div className="sec-head">
          <p className="eyebrow">Try it yourself</p>
          <h2 className="h2" data-rv><span className="rvl"><span>Ten notices went out today.</span></span><span className="rvl"><span>How many are <em>yours?</em></span></span></h2>
        </div>
        <div className="try-grid">
          <div className="try-panel" data-rv>
            <h4>Your profile</h4>
            <div className="grp"><span>Department</span><div>{depts.map((d) => <button key={d} className={dept === d ? "opt on" : "opt"} onClick={() => setDept(d)}>{d}</button>)}</div></div>
            <div className="grp"><span>Year</span><div>{years.map((y) => <button key={y} className={year === y ? "opt on" : "opt"} onClick={() => setYear(y)}>Year {y}</button>)}</div></div>
            <div className="grp"><span>Clubs you follow</span><div>{clubs.map((c) => <button key={c} className={mine.includes(c) ? "opt on" : "opt"} onClick={() => toggleClub(c)}>{c}</button>)}</div></div>
            <p className="try-live" aria-live="polite"><b>{hits}</b> of {notices.length} notices are for you</p>
            <button className={urgent ? "sw on" : "sw"} onClick={() => setUrgent((u) => !u)} role="switch" aria-checked={urgent}><span>Urgent only (Now and Today)</span><i /></button>
          </div>
          <div className="try-feed" data-rv>
            <div className="try-count"><b>{hits}</b><span>of {notices.length} are for you</span></div>
            <div className="try-list">
              {sorted.map((n) => (
                <div key={n.id} className={n.hit ? "tn hit" : "tn miss"}>
                  <span className="tp" style={{ background: UC[n.u] }}>{URGENCY_LABELS[n.u]}</span>
                  <div><b>{n.t}</b><small>{n.ago}{n.club ? ` · ${n.club}` : ""}{n.depts ? ` · ${n.depts.join("/")}` : " · All departments"}{n.years ? ` · Year ${n.years.join(", ")}` : ""}</small></div>
                  <span className="tc">{n.cat}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
