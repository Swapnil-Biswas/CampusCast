"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { flow } from "../../lib/data";

const COL = ["#e8603c", "#f3b63f", "#8ec5d6"];
const ART = [
  // publish: a pen writing one notice
  <svg viewBox="0 0 200 140" key="a"><rect x="30" y="26" width="110" height="88" rx="10" fill="#fff7dc" stroke="#1b1a17" strokeWidth="5" /><path d="M48 52h74M48 70h56M48 88h66" stroke="#1b1a17" strokeWidth="5" strokeLinecap="round" /><path d="M130 100l40-52 12 9-40 52-18 6z" fill="#f3b63f" stroke="#1b1a17" strokeWidth="5" strokeLinejoin="round" /></svg>,
  // rank & target: funnel
  <svg viewBox="0 0 200 140" key="b"><path d="M20 24h160l-62 62v38l-36-14V86z" fill="#fff7dc" stroke="#1b1a17" strokeWidth="5" strokeLinejoin="round" /><circle cx="52" cy="12" r="8" fill="#e8603c" stroke="#1b1a17" strokeWidth="4" /><circle cx="100" cy="8" r="8" fill="#8ec5d6" stroke="#1b1a17" strokeWidth="4" /><circle cx="148" cy="12" r="8" fill="#7fb48a" stroke="#1b1a17" strokeWidth="4" /></svg>,
  // students see theirs: phone
  <svg viewBox="0 0 200 140" key="c"><rect x="62" y="6" width="76" height="128" rx="14" fill="#fff7dc" stroke="#1b1a17" strokeWidth="5" /><rect x="74" y="26" width="52" height="22" rx="6" fill="#e8603c" stroke="#1b1a17" strokeWidth="3.5" /><rect x="74" y="56" width="52" height="16" rx="6" fill="#f3b63f" stroke="#1b1a17" strokeWidth="3.5" /><rect x="74" y="80" width="52" height="16" rx="6" fill="#8ec5d6" stroke="#1b1a17" strokeWidth="3.5" /><path d="M30 40q-10 24 0 48M16 28q-20 36 0 72M170 40q10 24 0 48M184 28q20 36 0 72" fill="none" stroke="#1b1a17" strokeWidth="4" strokeLinecap="round" /></svg>,
];

// Three steps stack like cards: each one slides over the last, which shrinks back.
export default function How() {
  const root = useRef(null);
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add("(min-width: 901px) and (prefers-reduced-motion: no-preference)", () => {
      const cards = gsap.utils.toArray(".hw-card");
      cards.forEach((c, i) => {
        if (i === cards.length - 1) return;
        gsap.fromTo(c, { scale: 1, yPercent: 0, filter: "brightness(1)" }, { scale: 0.92, yPercent: -3, filter: "brightness(0.82)", ease: "none", scrollTrigger: { trigger: cards[i + 1], start: "top 85%", end: "top 20%", scrub: true } });
      });
      gsap.fromTo(".hw-line i", { scaleY: 0 }, { scaleY: 1, ease: "none", scrollTrigger: { trigger: root.current, start: "top 60%", end: "bottom 80%", scrub: true } });
    });
    return () => mm.revert();
  }, []);
  return (
    <section className="how" id="how" ref={root}>
      <div className="how-in">
        <div className="how-side">
          <p className="eyebrow">How it works</p>
          <h2 className="h2" data-rv><span className="rvl"><span>Publish once.</span></span><span className="rvl"><span>Reach the <em>right</em> students.</span></span></h2>
          <p className="lede">Three steps from a notice on a desk to a buzz in the right pocket.</p>
          <div className="hw-line"><i /></div>
        </div>
        <div className="how-stack">
          {flow.map((f, i) => (
            <article className="hw-card" key={f.n} style={{ "--c": COL[i], top: `calc(14vh + ${i * 26}px)` }}>
              <div className="hw-art">{ART[i]}</div>
              <div>
                <span className="hw-n">{f.n}</span>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
