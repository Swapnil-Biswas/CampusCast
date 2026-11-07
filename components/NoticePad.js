"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { padNotes } from "../lib/padNotes";

const PadScene = dynamic(() => import("./PadScene"), { ssr: false });
const PEELS = padNotes.length - 1;

export default function NoticePad() {
  const sec = useRef(null);
  const prog = useRef({ cur: 0, target: 0, kick: null });
  const [idx, setIdx] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduced(rm);
    if (rm) return;
    gsap.registerPlugin(ScrollTrigger);
    const st = ScrollTrigger.create({
      trigger: sec.current,
      start: "top top",
      end: () => "+=" + Math.round(window.innerHeight * 1.0 * PEELS),
      pin: true,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        prog.current.target = self.progress;
        if (prog.current.kick) prog.current.kick();
        setIdx(Math.min(PEELS, Math.floor(self.progress * PEELS + 0.5)));
      },
    });
    return () => st.kill();
  }, []);

  const n = padNotes[idx];

  if (reduced) {
    return (
      <section className="section" id="pad">
        <div className="container">
          <div className="sec-head">
            <span className="eyebrow">The notice pad</span>
            <h2>Peel the <em>noise</em> away.</h2>
          </div>
          <div className="chaos-grid rot pins">
            {padNotes.map((x) => (
              <article className="chaos-card" key={x.tag} style={{ "--n": x.color }}>
                <span className="num">{x.tag}</span>
                <h3>{x.title}</h3>
                <p>{x.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="pad" id="pad" ref={sec}>
      <div className="container pad-grid">
        <div className="pad-copy">
          <span className="eyebrow">The notice pad · scroll to peel</span>
          <h2 className="pad-h">Peel the <em>noise</em> away.</h2>
          <div className="pad-cap" key={idx}>
            <h3>{n.title}</h3>
            <p>{n.body}</p>
          </div>
          <div className="pad-dots" aria-hidden="true">
            {padNotes.map((x, k) => (
              <i key={k} className={k === idx ? "on" : k < idx ? "done" : ""} style={{ "--n": x.color }} />
            ))}
          </div>
        </div>
        <div className="pad-canvas" aria-label="A pad of sticky notes that peel off as you scroll" role="img">
          <PadScene prog={prog.current} />
        </div>
      </div>
    </section>
  );
}
