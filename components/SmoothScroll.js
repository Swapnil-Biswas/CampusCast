"use client";
import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";

// GSAP smooth scroll: mouse-wheel and in-page links glide to their target instead of jumping.
// It drives the real window scroll, so ScrollTrigger pins, sticky panels and keyboard / touch scrolling keep working.
export default function SmoothScroll() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);
    const mm = gsap.matchMedia();

    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const maxY = () => document.documentElement.scrollHeight - window.innerHeight;
      let target = window.scrollY;
      let tween = null;

      const glide = (y, duration, ease) => {
        target = Math.max(0, Math.min(maxY(), y));
        if (tween) tween.kill();
        tween = gsap.to(window, {
          scrollTo: { y: target, autoKill: false },
          duration, ease, overwrite: true,
          onComplete: () => { tween = null; },
        });
      };

      const onWheel = (e) => {
        if (e.ctrlKey || e.defaultPrevented || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return; // pinch-zoom, sideways scroll
        e.preventDefault();
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
        if (!tween) target = window.scrollY;
        glide(target + e.deltaY * unit, 1.0, "power3.out");
      };

      // after keyboard / touch / scrollbar scrolling, keep our target in sync with where the page really is
      const onScroll = () => { if (!tween) target = window.scrollY; };

      const onClick = (e) => {
        const a = e.target.closest && e.target.closest('a[href^="#"]');
        if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
        const id = a.getAttribute("href").slice(1);
        const el = id ? document.getElementById(id) : null;
        if (!el && id) return;
        e.preventDefault();
        const nav = document.getElementById("nav");
        const y = el ? el.getBoundingClientRect().top + window.scrollY - (nav ? nav.offsetHeight : 0) : 0;
        glide(y, 1.4, "power3.inOut");
        history.replaceState(null, "", id ? "#" + id : window.location.pathname);
      };

      window.addEventListener("wheel", onWheel, { passive: false });
      window.addEventListener("scroll", onScroll, { passive: true });
      document.addEventListener("click", onClick);
      return () => {
        window.removeEventListener("wheel", onWheel);
        window.removeEventListener("scroll", onScroll);
        document.removeEventListener("click", onClick);
        if (tween) tween.kill();
      };
    });

    return () => mm.revert();
  }, []);

  return null;
}
