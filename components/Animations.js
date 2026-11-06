"use client";
import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Deliberately minimal: a quiet fade-in as sections scroll into view. Nothing else moves.
export default function Animations() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();

    const nav = document.getElementById("nav");
    const navTrig = ScrollTrigger.create({
      start: 40,
      end: "max",
      onUpdate: (self) => nav && nav.classList.toggle("scrolled", self.scroll() > 40),
    });

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.utils.toArray("[data-reveal]").forEach((el) => {
        gsap.fromTo(el, { autoAlpha: 0 }, {
          autoAlpha: 1, duration: 0.8, ease: "power1.out",
          scrollTrigger: { trigger: el, start: "top 90%", once: true },
        });
      });
      gsap.utils.toArray("[data-stagger]").forEach((wrap) => {
        gsap.fromTo(wrap.children, { autoAlpha: 0 }, {
          autoAlpha: 1, duration: 0.7, ease: "power1.out", stagger: 0.06,
          scrollTrigger: { trigger: wrap, start: "top 88%", once: true },
        });
      });
    });

    return () => {
      navTrig.kill();
      mm.revert();
    };
  }, []);

  return null;
}
