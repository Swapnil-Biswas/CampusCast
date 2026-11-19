"use client";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const plane = new THREE.PlaneGeometry(0.5, 0.5);

// Notices: spawn from the cork board, swirl through the air (the noise), then stream into the chalkboard (CampusCast).
export default function Notices({ story, textures, count = 64 }) {
  const N = count;
  const refs = useRef([]);
  const cfg = useMemo(() => {
    let s = 11; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: N }, (_, i) => ({
      i, tex: i % textures.length, rad: 0.5 + r() * 1.9, ph: r() * 6.28, sp: 0.35 + r() * 0.5, hy: 0.8 + r() * 3.0, hz: 2.8 + (r() - 0.5) * 3.2, cx: 4.5 + (r() - 0.5) * 1.2,
      tgt: [(r() - 0.5) * 5.6, 1.6 + r() * 1.6, -5.78], spin: (r() - 0.5) * 3, size: 0.42 + r() * 0.4,
      from: [6.7, 1.6 + r() * 1.5, 1.4 + r() * 3.2], d: 0.52 + (i / N) * 0.1,
    }));
  }, [textures.length, N]);
  const mats = useMemo(() => textures.map((t) => new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide, toneMapped: false })), [textures]);
  const A = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    const t = state.clock.elapsedTime, p = story.cur;
    cfg.forEach((c, i) => {
      const m = refs.current[i]; if (!m) return;
      const spawn = sm(0.34 + (i / N) * 0.06, 0.42 + (i / N) * 0.06, p), go = sm(c.d, c.d + 0.07, p);
      if (spawn <= 0 || go >= 1) { m.visible = false; return; }
      m.visible = true;
      const a = c.ph + t * c.sp;
      const ox = c.cx + Math.cos(a) * c.rad, oy = c.hy + Math.sin(a * 1.3) * 0.45, oz = c.hz + Math.sin(a) * c.rad * 0.8;
      // spawn: from the cork board into the swirl
      A.set(c.from[0] + (ox - c.from[0]) * spawn, c.from[1] + (oy - c.from[1]) * spawn, c.from[2] + (oz - c.from[2]) * spawn);
      // stream: bezier into the chalkboard
      if (go > 0) {
        const e = go, a1 = (1 - e) * (1 - e), b1 = 2 * (1 - e) * e, c1 = e * e;
        const cx = (A.x + c.tgt[0]) / 2, cy = Math.max(A.y, c.tgt[1]) + 1.2, cz = (A.z + c.tgt[2]) / 2;
        A.set(a1 * A.x + b1 * cx + c1 * c.tgt[0], a1 * A.y + b1 * cy + c1 * c.tgt[1], a1 * A.z + b1 * cz + c1 * c.tgt[2]);
      }
      m.position.copy(A);
      m.rotation.set(Math.sin(t * c.spin + c.ph) * 0.9, t * c.spin * 0.8, Math.cos(t * c.spin) * 0.6);
      m.scale.setScalar(c.size * spawn * (1 - go * 0.6));
    });
  });

  return (
    <group>
      {cfg.map((c, i) => <mesh key={i} ref={(el) => (refs.current[i] = el)} geometry={plane} material={mats[c.tex]} visible={false} />)}
    </group>
  );
}
