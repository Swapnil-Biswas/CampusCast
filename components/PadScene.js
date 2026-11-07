"use client";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { padNotes } from "../lib/padNotes";

const W = 3.4, H = 3.4;          // note size
const SEG_X = 20, SEG_Y = 60;    // mesh density for the bend
const INK = "#1f1810";
const N = padNotes.length;
const PEELS = N - 1;             // the last note stays on the pad
const ALPHA = 0.32;              // peel direction: starts at the bottom-right corner
const DX = Math.sin(ALPHA), DY = -Math.cos(ALPHA);
const S_LEN = W * Math.sin(ALPHA) + H * Math.cos(ALPHA);
const S_MIN = -(W / 2) * Math.sin(ALPHA);

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const outCubic = (t) => 1 - Math.pow(1 - t, 3);

/* ---------- note face painted on a canvas ---------- */
function wrap(ctx, text, maxW) {
  const words = text.split(" "); const lines = []; let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
function makeTexture(note, fam) {
  const S = 1024, c = document.createElement("canvas"); c.width = c.height = S;
  const g = c.getContext("2d");
  g.fillStyle = note.color; g.fillRect(0, 0, S, S);
  // soft paper shading toward the bottom (looks like a real note)
  const grd = g.createLinearGradient(0, 0, 0, S);
  grd.addColorStop(0, "rgba(255,255,255,0.10)"); grd.addColorStop(1, "rgba(0,0,0,0.07)");
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  // adhesive strip along the top edge
  g.fillStyle = "rgba(0,0,0,0.09)"; g.fillRect(0, 0, S, 96);
  g.strokeStyle = "rgba(31,24,16,0.4)"; g.setLineDash([14, 12]); g.lineWidth = 4;
  g.beginPath(); g.moveTo(0, 96); g.lineTo(S, 96); g.stroke(); g.setLineDash([]);
  // tag chip
  g.font = `500 40px ${fam.mono}`;
  const tw = g.measureText(note.tag).width + 44;
  g.fillStyle = "#fff7dc"; g.strokeStyle = INK; g.lineWidth = 6;
  g.beginPath(); g.rect(64, 150, tw, 70); g.fill(); g.stroke();
  g.fillStyle = INK; g.textBaseline = "middle"; g.fillText(note.tag, 86, 186);
  // headline
  g.textBaseline = "alphabetic"; g.fillStyle = INK; g.font = `92px ${fam.display}`;
  const lines = wrap(g, note.head.toUpperCase(), S - 150).slice(0, 5);
  lines.forEach((l, k) => g.fillText(l, 64, 340 + k * 104));
  // footer
  g.font = `500 34px ${fam.mono}`; g.fillText(note.foot, 64, S - 70);
  // outline
  g.strokeStyle = INK; g.lineWidth = 26; g.strokeRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.needsUpdate = true;
  return tex;
}

/* ---------- one note: corner-first curl, then the strip lets go and it lifts away ---------- */
function Note({ i, tex, prog }) {
  const group = useRef(); const front = useRef(); const back = useRef(); const shade = useRef();
  const { geo, shadow, orig } = useMemo(() => {
    const g = new THREE.PlaneGeometry(W, H, SEG_X, SEG_Y);
    g.translate(0, -H / 2, 0);                         // hinge (top edge) sits at y = 0
    return { geo: g, shadow: g.clone(), orig: g.attributes.position.array.slice() };
  }, []);
  const jit = useMemo(() => ({ rz: Math.sin(i * 12.9898) * 0.025, x: Math.sin(i * 78.233) * 0.03 }), [i]);
  const bent = useRef(false);

  useFrame(() => {
    const g = group.current; if (!g) return;
    const pr = prog.cur * PEELS;                        // progress measured in notes
    const p = clamp(pr - i);                            // this note: 0..1
    const rel = Math.max(0, i - pr);                    // notes still in front of this one
    g.visible = p < 1;

    // the rest of the pad tidies up as the top note comes away
    g.position.set(jit.x + 0.022 * rel, H / 2 - 0.026 * rel, (N - 1 - i) * 0.04);
    g.rotation.set(0, 0, jit.rz);
    g.scale.setScalar(1 - 0.01 * rel);

    let c = S_LEN + 1, r = 1, fade = 1, shadowOp = 0;
    const peeling = i < PEELS && p > 0;
    if (peeling) {
      const A = clamp(p / 0.5), B = clamp((p - 0.5) / 0.5);
      const eA = inOut(A), eB = inOut(B);
      c = S_LEN * (1 - 0.7 * eA + 0.3 * outCubic(B));  // curl line sweeps up the note, relaxes as it lets go
      r = 0.95 - 0.3 * eA;                              // tighter curl as it lifts
      g.rotation.x = -0.1 * eA - 0.7 * eB;
      g.rotation.z = jit.rz + 0.6 * eB;
      g.position.x += 2.7 * eB; g.position.y += 3.1 * eB; g.position.z += 1.4 * eB;
      g.scale.setScalar(1 + 0.1 * eB);
      fade = 1 - clamp((B - 0.4) / 0.42);
      shadowOp = 0.3 * clamp(A * 2.5) * (1 - clamp(B * 2));
    }

    if (peeling || bent.current) {
      const pos = geo.attributes.position, sp = shadow.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        const ox = orig[k * 3], oy = orig[k * 3 + 1];
        let x = ox, y = oy, z = 0;
        if (peeling) {
          const u = ox * DX + oy * DY - S_MIN;           // distance along the peel direction
          if (u > c) {
            const th = (u - c) / r;
            const u2 = c + r * Math.sin(th);
            z = r * (1 - Math.cos(th));
            x = ox + (u2 - u) * DX; y = oy + (u2 - u) * DY;
          }
        }
        pos.setXYZ(k, x, y, z);
        sp.setXYZ(k, x + z * 0.5, y - z * 0.5, -0.015);  // the lifted part throws a shadow on the note below
      }
      pos.needsUpdate = true; sp.needsUpdate = true; geo.computeVertexNormals();
      bent.current = peeling;
    }
    if (front.current) front.current.opacity = fade;
    if (back.current) back.current.opacity = fade;
    if (shade.current) shade.current.opacity = shadowOp;
  });

  return (
    <group ref={group}>
      <mesh geometry={shadow} renderOrder={(N - i) * 3}>
        <meshBasicMaterial ref={shade} color={INK} transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh geometry={geo} renderOrder={(N - i) * 3 + 1}>
        <meshLambertMaterial ref={front} map={tex} side={THREE.FrontSide} transparent />
      </mesh>
      <mesh geometry={geo} renderOrder={(N - i) * 3 + 1}>
        <meshLambertMaterial ref={back} color={new THREE.Color(padNotes[i].color).multiplyScalar(0.9)} side={THREE.BackSide} transparent />
      </mesh>
    </group>
  );
}

function Pad({ prog, textures }) {
  const { invalidate } = useThree();
  const tilt = useRef();
  useFrame((_, dt) => {
    const d = prog.target - prog.cur;
    if (Math.abs(d) > 0.0002) { prog.cur += d * (1 - Math.exp(-Math.min(dt, 0.05) * 9)); invalidate(); } else prog.cur = prog.target;
    if (tilt.current) {
      tilt.current.rotation.set(-0.16 + 0.06 * prog.cur, 0.28 - 0.16 * prog.cur, 0);   // camera drifts a little as you go
    }
  });
  useEffect(() => { prog.kick = invalidate; invalidate(); }, [invalidate, prog]);
  return (
    <group ref={tilt} rotation={[-0.16, 0.28, 0]} position={[0, 0.15, 0]}>
      {/* hard shadow, same language as the cards on the page */}
      <mesh position={[0.26, -0.26, -0.3]}>
        <planeGeometry args={[W, H]} />
        <meshBasicMaterial color={INK} />
      </mesh>
      {textures.map((t, i) => <Note key={i} i={i} tex={t} prog={prog} />)}
    </group>
  );
}

export default function PadScene({ prog }) {
  const [textures, setTextures] = useState(null);
  useEffect(() => {
    let live = true;
    const cs = getComputedStyle(document.documentElement);
    const fam = { display: cs.getPropertyValue("--font-display").trim() || "Arial Black", mono: cs.getPropertyValue("--font-mono").trim() || "monospace" };
    Promise.all([document.fonts.load(`92px ${fam.display}`), document.fonts.load(`500 40px ${fam.mono}`)])
      .catch(() => {})
      .then(() => document.fonts.ready)
      .then(() => { if (live) setTextures(padNotes.map((n) => makeTexture(n, fam))); });
    return () => { live = false; };
  }, []);
  if (!textures) return null;
  return (
    <Canvas flat dpr={[1, 2]} frameloop="demand" camera={{ position: [0, 0, 9.5], fov: 32 }} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={2.1} />
      <directionalLight position={[-3, 5, 6]} intensity={1.6} />
      <Pad prog={prog} textures={textures} />
    </Canvas>
  );
}
