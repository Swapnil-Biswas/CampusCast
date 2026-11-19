"use client";
import { ShieldCheck } from "lucide-react";
import { engine, trust } from "../../lib/data";

// Under the hood: the shared engine and the trust-and-safety promises.
export default function Platform() {
  const row = [...trust, ...trust];
  return (
    <section className="plat" id="platform">
      <div className="wrap">
        <div className="sec-head">
          <p className="eyebrow">Under the hood</p>
          <h2 className="h2" data-rv><span className="rvl"><span>One smart engine</span></span><span className="rvl"><span><em>behind</em> every section.</span></span></h2>
        </div>
        <div className="eng">
          {engine.map((e, i) => (
            <div className="en" key={e.t} data-rv style={{ "--i": i }}><span>{String(i + 1).padStart(2, "0")}</span><b>{e.t}</b><p>{e.d}</p></div>
          ))}
        </div>
      </div>
      <div className="trust" aria-label="Trust and safety">
        <p className="eyebrow">Trust and safety</p>
        <div className="trust-marq"><div data-marquee="left">{row.map((t, i) => <span key={i}><ShieldCheck size={20} />{t}</span>)}</div></div>
      </div>
    </section>
  );
}
