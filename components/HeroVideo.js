"use client";
import { useEffect, useRef } from "react";

// Silent looping video. React does not write the `muted` attribute into server HTML, which makes some browsers
// block autoplay, so we set it ourselves and start playback explicitly (and again whenever the tab becomes visible).
export default function HeroVideo({ src, poster }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    v.defaultMuted = true;
    const play = () => { const p = v.play(); if (p && p.catch) p.catch(() => {}); };
    play();
    v.addEventListener("loadeddata", play);
    const vis = () => { if (!document.hidden) play(); };
    document.addEventListener("visibilitychange", vis);
    // only decode while it is on screen
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) play(); else v.pause(); });
    io.observe(v);
    return () => { io.disconnect(); v.removeEventListener("loadeddata", play); document.removeEventListener("visibilitychange", vis); };
  }, []);
  return (
    <video
      ref={ref}
      src={src}
      poster={poster || undefined}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      disablePictureInPicture
      disableRemotePlayback
      controlsList="nodownload noplaybackrate noremoteplayback"
      tabIndex={-1}
      aria-label="CampusCast preview video"
    />
  );
}
