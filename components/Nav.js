"use client";
import { useEffect, useState } from "react";

// Floating glass nav: slides away while you scroll down through the story, returns when you scroll up.
export default function Nav() {
  const [hide, setHide] = useState(false);
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const on = () => {
      const y = window.scrollY;
      setSolid(y > 60);
      setHide(y > last + 4 && y > 200);
      if (y < last - 4) setHide(false);
      last = y;
    };
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={"nav" + (hide ? " hide" : "") + (solid ? " solid" : "")} id="nav">
      <a href="#top" className="logo">Campus<i>Cast</i></a>
      <nav className="nav-links" aria-label="Primary">
        <a href="#modules">Features</a>
        <a href="#how">How it works</a>
        <a href="#try">Try the filters</a>
        <a href="#urgency">Urgency</a>
      </nav>
      <a href="#join" className="nav-cta">Get early access</a>
    </header>
  );
}
