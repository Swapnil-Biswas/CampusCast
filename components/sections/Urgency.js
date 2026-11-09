"use client";
import { Bell } from "lucide-react";
import { urgency } from "../../lib/data";

const UC = ["#e8603c", "#f3b63f", "#8ec5d6", "#7fb48a"];

// Dark chalkboard section: four rows whose "loudness" bars fill when they scroll into view.
export default function Urgency() {
  return (
    <section className="urg" id="urgency">
      <div className="wrap">
        <div className="sec-head">
          <p className="eyebrow light">The urgency system</p>
          <h2 className="h2 light" data-rv><span className="rvl"><span>Urgency decides how</span></span><span className="rvl"><span><em>loudly</em> we notify.</span></span></h2>
          <p className="lede light">Only admins can mark a notice Now or Today, so when your phone buzzes for one, you can trust it.</p>
        </div>
        <div className="urg-list">
          {urgency.map((u, i) => (
            <div className="ur" key={u.p} data-rv style={{ "--c": UC[i], "--w": `${u.w}%`, "--i": i }}>
              <div className="ur-p">{u.p}</div>
              <div className="ur-name"><b>{u.name}</b><small>{u.ex}</small></div>
              <p className="ur-how">{u.how}</p>
              <div className="ur-bar"><i /><Bell size={20} strokeWidth={2.4} /></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
