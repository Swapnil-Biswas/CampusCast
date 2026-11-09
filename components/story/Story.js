"use client";
import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowRight } from "lucide-react";
import { CHAPTERS } from "../../lib/chapters";

const ClassroomCanvas = dynamic(() => import("./ClassroomCanvas"), { ssr: false });
// If WebGL dies for any reason, fall back to the plain version instead of a broken page.
class Guard extends Component {
  state = { bad: false };
  static getDerivedStateFromError() { return { bad: true }; }
  componentDidCatch() { this.props.onBad && this.props.onBad(); }
  render() { return this.state.bad ? null : this.props.children; }
}
const Ln = ({ children, d = 0 }) => <span className="rv"><span style={{ "--d": `${d}s` }}>{children}</span></span>;

export default function Story() {
  const story = useRef({ p: 0, cur: 0, intro: 1 }).current;
  const root = useRef(null);
  const [active, setActive] = useState(0);
  const [running, setRunning] = useState(true);
  const [ready, setReady] = useState(false);
  const [filters, setFilters] = useState(0);
  const [flat, setFlat] = useState(false);   // reduced motion or no WebGL: a plain, readable version

  useEffect(() => {
    window.__story = story;
    let gl = false;
    try { gl = !!document.createElement("canvas").getContext("webgl2"); } catch (e) { gl = false; }
    const c = navigator.connection;
    const slow = c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ""));
    const tiny = navigator.deviceMemory && navigator.deviceMemory <= 2;
    let soft = false;
    try { const x = document.createElement("canvas").getContext("webgl2"), e = x && x.getExtension("WEBGL_debug_renderer_info"); soft = /swiftshader|llvmpipe|software/i.test((e && x.getParameter(e.UNMASKED_RENDERER_WEBGL)) || ""); } catch (e) { soft = false; }
    if (!gl || soft || slow || tiny || window.matchMedia("(prefers-reduced-motion: reduce)").matches) setFlat(true);
  }, [story]);

  // never leave visitors staring at the loader
  useEffect(() => { const t = setTimeout(() => setReady(true), 25000); return () => clearTimeout(t); }, []);

  // the opening dolly once the room is built
  useEffect(() => {
    if (!ready) return;
    gsap.to(story, { intro: 0, duration: 3.2, ease: "power3.out" });
  }, [ready, story]);

  useEffect(() => {
    if (flat) return;
    gsap.registerPlugin(ScrollTrigger);
    const st = ScrollTrigger.create({
      trigger: root.current, start: "top top", end: "bottom bottom",
      onUpdate: (self) => {
        const p = self.progress;
        story.p = p;
        setActive(CHAPTERS.findIndex((c) => p >= c.span[0] && p <= c.span[1]));
        // filter chips light up one by one while the feed is on screen
        setFilters(p < 0.6 ? 0 : p < 0.64 ? 1 : p < 0.68 ? 2 : p < 0.72 ? 3 : 4);
      },
      onToggle: (self) => setRunning(self.isActive),
    });
    return () => st.kill();
  }, [story, flat]);

  const on = (i) => (active === i ? "ch on" : "ch");

  return (
    <section className={"story" + (flat ? " flat" : "")} id="top" ref={root}>
      <div className="story-stage">
        {!flat && <div className="story-canvas"><Guard onBad={() => setFlat(true)}><ClassroomCanvas story={story} running={running} onReady={() => setReady(true)} /></Guard></div>}
        <div className={"story-scrim" + (active === 3 ? " off" : "")} />

        {/* 0 hero */}
        <div className={on(0)} data-ch="hero">
          <p className="kick fd" style={{ "--d": "0.1s" }}>CampusCast · Smart campus announcements</p>
          <h1 className="hd"><Ln d={0.15}>Never miss</Ln><Ln d={0.28}><em>what matters.</em></Ln></h1>
          <p className="sub fd" style={{ "--d": "0.5s" }}>One feed for every notice, exam change, hackathon and workshop, filtered by your department, year, club and how urgent it really is.</p>
          <div className="ctas fd" style={{ "--d": "0.65s" }}>
            <a href="#join" className="btn btn-clay"><span className="on-wide">Join with your college email</span><span className="on-phone">Join early</span> <ArrowRight size={18} /></a>
            <a href="#try" className="btn btn-line">Try the filters</a>
          </div>
        </div>

        {/* 1 listening */}
        <div className={on(1)} data-ch="listen">
          <p className="kick fd">01 · Every campus runs on notices</p>
          <h2 className="hd s"><Ln d={0.05}>Thirty students.</Ln><Ln d={0.17}>One teacher.</Ln><Ln d={0.29}><em>One thing</em> to say.</Ln></h2>
          <p className="sub fd" style={{ "--d": "0.45s" }}>Exam changes, hackathon deadlines, workshop seats. They all have to reach the right person, at the right time.</p>
        </div>

        {/* 2 buried */}
        <div className={on(2)} data-ch="buried">
          <p className="kick fd">02 · The problem</p>
          <h2 className="hd s"><Ln d={0.05}>40 groups.</Ln><Ln d={0.17}>300 messages.</Ln><Ln d={0.29}><em>One</em> exam change.</Ln></h2>
          <p className="sub fd" style={{ "--d": "0.45s" }}>Notices hide in WhatsApp groups, notice boards and email threads. The one that matters gets buried, and half the class never sees it.</p>
        </div>

        {/* 3 feed */}
        <div className={on(3) + " feedcard"} data-ch="feed">
          <p className="kick fd light">03 · Meet CampusCast</p>
          <h2 className="hd s light"><Ln d={0.05}>Every notice.</Ln><Ln d={0.17}><em>One feed.</em></Ln></h2>
          <p className="sub fd light" style={{ "--d": "0.4s" }}>Faculty publish once. CampusCast ranks it by urgency and sends it only to who it is for.</p>
          <div className="chips fd" style={{ "--d": "0.5s" }}>
            {["Department · CSE", "Year · 2", "Clubs · Coding", "Urgent first"].map((c, i) => <span key={c} className={filters > i ? "chip on" : "chip"}>{c}</span>)}
          </div>
        </div>

        {/* 4 right students */}
        <div className={on(4)} data-ch="right">
          <p className="kick fd">04 · The right notice, the right student</p>
          <h2 className="hd s"><Ln d={0.05}>Everyone gets</Ln><Ln d={0.17}><em>what&apos;s theirs.</em></Ln></h2>
          <p className="sub fd" style={{ "--d": "0.4s" }}>Phones light up for CSE Year 2. The first-years never see the final-year placement drive. Nobody is left looking at the wrong chat.</p>
        </div>

        {/* HUD */}
        <div className="hud" aria-hidden="true">
          {CHAPTERS.map((c, i) => <span key={c.id} className={active === i ? "dot on" : "dot"}><b>{c.label}</b><i /></span>)}
        </div>
        <div className={"cue" + (active === 0 ? " on" : "")} aria-hidden="true"><span>Scroll</span><i /></div>

        {/* loader curtain */}
        <div className={"loader" + (ready ? " done" : "")} aria-hidden={ready}><b>Campus<i>Cast</i></b><small>Taking attendance…</small></div>
      </div>
    </section>
  );
}
