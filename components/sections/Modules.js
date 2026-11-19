"use client";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { features } from "../../lib/data";
import ModuleArt from "./ModuleArt";

const TINT = ["#e8603c", "#f3b63f", "#8ec5d6", "#7fb48a", "#c58ad1", "#e8603c", "#f3b63f", "#8ec5d6", "#7fb48a"];

// Pinned horizontal gallery: the nine sections slide past as you scroll down.
export default function Modules() {
  const root = useRef(null), track = useRef(null), bar = useRef(null);
  const [cur, setCur] = useState(1);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add("(min-width: 821px) and (prefers-reduced-motion: no-preference)", () => {
      const dist = () => track.current.scrollWidth - window.innerWidth + window.innerWidth * 0.08;
      const tween = gsap.to(track.current, {
        x: () => -dist(), ease: "none",
        scrollTrigger: {
          trigger: root.current, start: "top top", end: () => "+=" + dist(), pin: true, scrub: 0.6, invalidateOnRefresh: true, anticipatePin: 1,
          onUpdate: (self) => { setCur(Math.min(features.length, Math.floor(self.progress * features.length) + 1)); if (bar.current) bar.current.style.transform = `scaleX(${self.progress})`; },
        },
      });
      // each illustration drifts against the track for depth
      gsap.utils.toArray(".mc-art").forEach((b) => gsap.fromTo(b, { x: 50 }, { x: -50, ease: "none", scrollTrigger: { trigger: b, containerAnimation: tween, start: "left right", end: "right left", scrub: true } }));
    });
    return () => mm.revert();
  }, []);

  // soft pointer tilt on each card
  const tilt = (e) => {
    const el = e.currentTarget, r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(-y * 6).toFixed(2)}deg`); el.style.setProperty("--ry", `${(x * 8).toFixed(2)}deg`);
  };
  const untilt = (e) => { e.currentTarget.style.setProperty("--rx", "0deg"); e.currentTarget.style.setProperty("--ry", "0deg"); };

  return (
    <section className="modules" id="modules" ref={root}>
      <div className="modules-head">
        <div>
          <p className="eyebrow">Nine sections, one platform</p>
          <h2 className="h2">Everything campus life runs on, <em>in one place.</em></h2>
        </div>
        <div className="mc-count"><b>{String(cur).padStart(2, "0")}</b><span>/ 09</span></div>
      </div>
      <div className="mc-track" ref={track} onScroll={(e) => {   // phones swipe natively: keep the counter in step
        if (window.innerWidth > 820) return;
        const t = e.currentTarget; setCur(Math.min(features.length, Math.round(t.scrollLeft / (t.scrollWidth / features.length)) + 1));
      }}>
        {features.map((f, i) => (
          <article className="mc" key={f.n} style={{ "--c": TINT[i] }} onPointerMove={tilt} onPointerLeave={untilt}>
            <div className="mc-top">
              <span className="mc-tag">{f.g}</span>
              <span className="mc-n">{f.n}</span>
            </div>
            <div className="mc-art"><ModuleArt name={f.t} /></div>
            <div className="mc-body">
              <h3>{f.t}</h3>
              <p className="mc-h">{f.h}</p>
              <ul>{f.b.map((b) => <li key={b}>{b}</li>)}</ul>
            </div>
          </article>
        ))}
      </div>
      <div className="mc-bar"><i ref={bar} /></div>
    </section>
  );
}
