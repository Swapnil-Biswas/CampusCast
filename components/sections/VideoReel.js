"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import HeroVideo from "../HeroVideo";

// "Campus in motion": the video starts as a small card and grows to fill the screen while you scroll.
export default function VideoReel() {
  const root = useRef(null);
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const tl = gsap.timeline({ defaults: { ease: "none" }, scrollTrigger: { trigger: root.current, start: "top top", end: "+=140%", pin: true, scrub: 0.6, anticipatePin: 1 } });
      tl.fromTo(".vr-frame", { width: "46vw", height: "46vh", borderRadius: 140 }, { width: "100vw", height: "100svh", borderRadius: 0, duration: 1 }, 0)
        .fromTo(".vr-title span", { yPercent: 0 }, { yPercent: -120, duration: 0.5 }, 0)
        .fromTo(".vr-cap", { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: "power2.out" }, 0.7)
        .to({}, { duration: 0.35 });
    });
    return () => mm.revert();
  }, []);
  return (
    <section className="vr" ref={root} id="reel">
      <h2 className="vr-title"><span>Campus<br />in motion</span></h2>
      <div className="vr-frame"><HeroVideo src="/campus-video.mp4" poster="/campus-video-poster.jpg" /></div>
      <p className="vr-cap">Real corridors. Real notice boards. <b>One feed for all of it.</b></p>
    </section>
  );
}
