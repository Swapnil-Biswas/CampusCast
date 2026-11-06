"use client";
import { useMemo, useState } from "react";
import { depts, years, clubs, notices } from "../lib/data";

const uCol = ["var(--p0)", "var(--p1)", "var(--p2)", "var(--p3)"];

export default function FilterDemo() {
  const [dept, setDept] = useState("CSE");
  const [year, setYear] = useState(2);
  const [mine, setMine] = useState(["Coding Club"]);
  const [urgent, setUrgent] = useState(false);

  const toggleClub = (c) => setMine((m) => (m.includes(c) ? m.filter((x) => x !== c) : [...m, c]));

  const rows = useMemo(() => notices.map((n) => {
    const okDept = !n.depts || n.depts.includes(dept);
    const okYear = !n.years || n.years.includes(year);
    const okClub = !n.club || mine.includes(n.club);
    const okU = !urgent || n.u <= 1;
    return { ...n, hit: okDept && okYear && okClub && okU };
  }), [dept, year, mine, urgent]);

  const hits = rows.filter((r) => r.hit).length;
  const sorted = [...rows].sort((a, b) => (b.hit - a.hit) || (a.u - b.u) || (a.id - b.id));

  return (
    <section className="section demo" id="try">
      <div className="container">
        <div className="sec-head" data-reveal>
          <p className="eyebrow">Try it yourself</p>
          <h2 className="display">Ten notices went out today. How many are <em className="accent">yours</em>?</h2>
          <p className="lede">Set up a student profile and watch the noise fall away. This is the same targeting logic the real feed runs on.</p>
        </div>
        <div className="demo-grid">
          <div className="panel" data-reveal>
            <h4>Your profile</h4>
            <p className="hint">Tap to change who you are.</p>
            <div className="group"><span className="eyebrow">Department</span>
              <div className="opts">{depts.map((d) => (
                <button key={d} className={`opt ${dept === d ? "on" : ""}`} onClick={() => setDept(d)}>{d}</button>
              ))}</div></div>
            <div className="group"><span className="eyebrow">Year</span>
              <div className="opts">{years.map((y) => (
                <button key={y} className={`opt ${year === y ? "on" : ""}`} onClick={() => setYear(y)}>Year {y}</button>
              ))}</div></div>
            <div className="group"><span className="eyebrow">Clubs you follow</span>
              <div className="opts">{clubs.map((c) => (
                <button key={c} className={`opt ${mine.includes(c) ? "on" : ""}`} onClick={() => toggleClub(c)}>{c}</button>
              ))}</div></div>
            <div className={`switch ${urgent ? "on" : ""}`} onClick={() => setUrgent((u) => !u)} role="switch" aria-checked={urgent} tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setUrgent((u) => !u)}>
              <span>Urgent only (P0 and P1)</span><span className="tr" />
            </div>
          </div>

          <div data-reveal>
            <div className="feed-top">
              <div className="count"><em>{hits}</em> of {notices.length} are for you</div>
              <p className="count-sub">The rest are dimmed. In a group chat, you would have scrolled through all of them.</p>
            </div>
            {sorted.map((n) => (
              <div key={n.id} className={`notice u${n.u} ${n.hit ? "hit" : "miss"}`}>
                <span className="pp" style={{ color: uCol[n.u] }}>P{n.u}</span>
                <div><b>{n.t}</b><small>{n.ago}{n.club ? ` · ${n.club}` : ""}{n.depts ? ` · ${n.depts.join("/")}` : " · All departments"}{n.years ? ` · Year ${n.years.join(", ")}` : ""}</small></div>
                <span className="cat">{n.cat}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
