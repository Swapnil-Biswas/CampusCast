"use client";
import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Page-wide motion behaviours: scroll reveals, counters, magnetic buttons, marquee speed-up with scroll velocity.
export default function Motion() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    const cleanups = [];

    // reveals: [data-rv] gets .in when it enters the viewport (CSS does the animation)
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: window.innerWidth < 900 ? 0.04 : 0.18, rootMargin: "0px 0px -6% 0px" });
    document.querySelectorAll("[data-rv]").forEach((el) => io.observe(el));
    cleanups.push(() => io.disconnect());

    // counters
    document.querySelectorAll("[data-count]").forEach((el) => {
      const end = parseFloat(el.dataset.count), pre = el.dataset.pre || "", suf = el.dataset.suf || "";
      const o = { v: 0 };
      ScrollTrigger.create({ trigger: el, start: "top 85%", once: true, onEnter: () => gsap.to(o, { v: end, duration: 1.8, ease: "power3.out", onUpdate: () => { el.textContent = pre + Math.round(o.v) + suf; } }) });
    });

    mm.add("(prefers-reduced-motion: no-preference) and (pointer: fine)", () => {
      // magnetic buttons
      document.querySelectorAll("[data-magnetic]").forEach((el) => {
        const mx = gsap.quickTo(el, "x", { duration: 0.4, ease: "power3.out" }), my = gsap.quickTo(el, "y", { duration: 0.4, ease: "power3.out" });
        const move = (e) => { const r = el.getBoundingClientRect(); mx((e.clientX - r.left - r.width / 2) * 0.28); my((e.clientY - r.top - r.height / 2) * 0.35); };
        const leave = () => { mx(0); my(0); };
        el.addEventListener("mousemove", move); el.addEventListener("mouseleave", leave);
        cleanups.push(() => { el.removeEventListener("mousemove", move); el.removeEventListener("mouseleave", leave); });
      });
    });

    // marquees drift faster while you scroll
    const tracks = [...document.querySelectorAll("[data-marquee]")];
    const tweens = tracks.map((t) => gsap.to(t, { xPercent: t.dataset.marquee === "right" ? 50 : -50, ease: "none", duration: 40, repeat: -1, ...(t.dataset.marquee === "right" ? { startAt: { xPercent: -50 } } : {}) }));
    let boost = 1;
    const vel = ScrollTrigger.create({ onUpdate: (self) => { boost = Math.min(6, 1 + Math.abs(self.getVelocity()) / 350); } });
    const tick = () => { boost += (1 - boost) * 0.06; tweens.forEach((tw) => tw.timeScale(boost)); };
    gsap.ticker.add(tick);
    cleanups.push(() => { gsap.ticker.remove(tick); vel.kill(); tweens.forEach((t) => t.kill()); });

    // refresh once everything (fonts, canvas pin spacer) has settled
    const r = setTimeout(() => ScrollTrigger.refresh(), 1200);
    return () => { clearTimeout(r); mm.revert(); cleanups.forEach((c) => c()); };
  }, []);
  return null;
}
