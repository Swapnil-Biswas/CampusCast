"use client";
import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { clay, PALETTE as P } from "./materials";
import { floorTexture, corkTexture, boardTexture, feedTexture, slatTexture, slideTexture, artTexture } from "./textures";

export const ROOM = { x0: -7, x1: 7, zFront: -6.2, zBack: 12.5, h: 6.4 };
const WALNUT = "#8a5a3b", PLASTER = "#e8dfcf", SAGE = "#7e9b86", CHARCOAL = "#2b2d31";

const rbCache = new Map();
export function rbox(w, h, d, r = 0.05) {
  const k = [w, h, d, r].join();
  if (!rbCache.has(k)) rbCache.set(k, new RoundedBoxGeometry(w, h, d, 3, r));
  return rbCache.get(k);
}
function Box({ p = [0, 0, 0], s, c, r = 0.04, shadow = true, rot, rough, ...rest }) {
  return <mesh position={p} rotation={rot} geometry={rbox(s[0], s[1], s[2], r)} material={clay(c, rough ? { roughness: rough } : {})} castShadow={shadow} receiveShadow {...rest} />;
}

/* a pinned flyer on the cork board */
function Paper({ p, rot, c, s = 0.5 }) {
  return (
    <group position={p} rotation={rot}>
      <mesh material={clay(c, { roughness: 0.95 })} castShadow><boxGeometry args={[s, s * 1.2, 0.012]} /></mesh>
      <mesh position={[0, s * 0.5, 0.01]} material={clay("#e8603c")}><sphereGeometry args={[0.03, 10, 8]} /></mesh>
    </group>
  );
}

function Clock() {
  const sec = useRef(), min = useRef();
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    if (sec.current) sec.current.rotation.z = -Math.floor(t) * (Math.PI / 30) - Math.min(1, (t % 1) * 6) * (Math.PI / 30) * 0.0;
    if (min.current) min.current.rotation.z = -t * (Math.PI / 1800) + 0.4;
  });
  return (
    <group position={[0, 0, 0.056]}>
      <group ref={min}><mesh position={[0, 0.13, 0]} material={clay("#1b1a17")}><boxGeometry args={[0.016, 0.26, 0.008]} /></mesh></group>
      <group ref={sec}><mesh position={[0, 0.15, 0.006]} material={clay("#e8603c")}><boxGeometry args={[0.008, 0.3, 0.006]} /></mesh></group>
    </group>
  );
}

function Plant({ p, s = 1 }) {
  const leaves = useRef();
  const ph = useMemo(() => p[0] * 1.7 + p[2], [p]);
  useFrame((st) => { const t = st.clock.elapsedTime; if (leaves.current) { leaves.current.rotation.z = Math.sin(t * 0.7 + ph) * 0.025; leaves.current.rotation.x = Math.sin(t * 0.55 + ph * 1.3) * 0.02; } });
  return (
    <group position={p} scale={s}>
      <mesh position={[0, 0.33, 0]} material={clay("#33363c", { roughness: 0.6 })} castShadow><cylinderGeometry args={[0.3, 0.22, 0.66, 28]} /></mesh>
      <mesh position={[0, 0.66, 0]} material={clay("#3a2c22")}><cylinderGeometry args={[0.28, 0.28, 0.02, 24]} /></mesh>
      <mesh position={[0, 1.15, 0]} material={clay("#6a4e38")} castShadow><cylinderGeometry args={[0.025, 0.04, 1.0, 8]} /></mesh>
      <group ref={leaves} position={[0, 0.9, 0]}>
        <group position={[0, -0.9, 0]}>
          {[[0, 1.85, 0, 0.5], [0.3, 1.5, 0.1, 0.38], [-0.28, 1.45, -0.1, 0.4], [0.1, 2.15, 0.05, 0.32], [-0.2, 1.8, 0.2, 0.34], [0.32, 1.9, -0.15, 0.3]].map(([x, y, z, r], i) => (
            <mesh key={i} position={[x, y, z]} scale={[1, 0.85, 1]} material={clay(i % 2 ? "#5f9a6b" : "#4c8a5c", { roughness: 0.7 })} castShadow><sphereGeometry args={[r, 20, 16]} /></mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

export default function Room({ fonts, feedRef, lite }) {
  const floorT = useMemo(floorTexture, []);
  const corkT = useMemo(corkTexture, []);
  const boardT = useMemo(() => boardTexture(fonts.display), [fonts.display]);
  const feedT = useMemo(() => feedTexture(fonts.display), [fonts.display]);
  const slatT = useMemo(slatTexture, []);
  const slideT = useMemo(() => slideTexture(fonts.display), [fonts.display]);
  const art0 = useMemo(() => artTexture(0), []);
  const art1 = useMemo(() => artTexture(1), []);
  const { x0, x1, zFront, zBack, h } = ROOM;
  const W = x1 - x0, D = zBack - zFront, cz = (zBack + zFront) / 2;

  // random pinned flyers on the cork board (the chaos)
  const papers = useMemo(() => {
    const cols = ["#ffb8c6", "#ffe566", "#a9d4ff", "#b6e89a", "#ffc074", "#d3c2ff", "#fff7dc"];
    let s = 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: lite ? 12 : 30 }, () => ({ y: (r() - 0.5) * 1.7, z: (r() - 0.5) * 4.6, rot: (r() - 0.5) * 0.7, c: cols[Math.floor(r() * cols.length)], s: 0.36 + r() * 0.2 }));
  }, []);

  return (
    <group>
      {/* floor + ground shadow catcher */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, cz]} receiveShadow><planeGeometry args={[W, D]} /><meshStandardMaterial map={floorT} roughness={0.55} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, cz]} receiveShadow><planeGeometry args={[160, 160]} /><meshStandardMaterial color="#efe5cf" roughness={1} /></mesh>

      {/* walls (no ceiling: a dollhouse we can fly out of) */}
      <Box p={[0, h / 2, zFront - 0.15]} s={[W + 0.6, h, 0.3]} c={PLASTER} r={0.02} rough={0.95} />
      <Box p={[x0 - 0.15, h / 2, cz]} s={[0.3, h, D]} c={PLASTER} r={0.02} rough={0.95} />
      <Box p={[x1 + 0.15, h / 2, cz]} s={[0.3, h, D]} c={PLASTER} r={0.02} rough={0.95} />
      <Box p={[0, h / 2, zBack + 0.15]} s={[W + 0.6, h, 0.3]} c={PLASTER} r={0.02} rough={0.95} />
      {/* walnut wainscot all round, with a slim cap rail */}
      <Box p={[0, 0.6, zFront + 0.04]} s={[W, 1.2, 0.08]} c={WALNUT} shadow={false} rough={0.5} />
      <Box p={[x0 + 0.04, 0.6, cz]} s={[0.08, 1.2, D]} c={WALNUT} shadow={false} rough={0.5} />
      <Box p={[x1 - 0.04, 0.6, cz]} s={[0.08, 1.2, D]} c={WALNUT} shadow={false} rough={0.5} />
      <Box p={[0, 0.6, zBack - 0.04]} s={[W, 1.2, 0.08]} c={WALNUT} shadow={false} rough={0.5} />
      <Box p={[0, 1.22, zFront + 0.06]} s={[W, 0.04, 0.12]} c="#d9c8a8" shadow={false} />
      <Box p={[x0 + 0.06, 1.22, cz]} s={[0.12, 0.04, D]} c="#d9c8a8" shadow={false} />
      <Box p={[x1 - 0.06, 1.22, cz]} s={[0.12, 0.04, D]} c="#d9c8a8" shadow={false} />

      {/* ---- front wall: walnut slat acoustic panel, chalkboard, projector screen ---- */}
      <mesh position={[0, 3.2, zFront + 0.03]} receiveShadow><planeGeometry args={[12.4, 4.6]} /><meshStandardMaterial map={slatT} roughness={0.6} /></mesh>
      <group position={[0, 2.25, zFront + 0.14]}>
        <Box p={[0, 0, 0]} s={[7.8, 2.9, 0.16]} c={CHARCOAL} r={0.05} rough={0.5} />
        <mesh position={[0, 0, 0.09]}><planeGeometry args={[7.3, 2.5]} /><meshStandardMaterial map={boardT} roughness={0.95} /></mesh>
        {/* the CampusCast screen fades in over the chalk */}
        <mesh position={[0, 0, 0.095]}><planeGeometry args={[7.3, 2.5]} /><meshBasicMaterial ref={feedRef} map={feedT} transparent opacity={0} toneMapped={false} /></mesh>
        <Box p={[0, -1.52, 0.14]} s={[7.6, 0.08, 0.2]} c={CHARCOAL} rough={0.5} />
        {[-2.8, -2.55, -2.4].map((x, i) => <Box key={i} p={[x, -1.44, 0.2]} s={[0.22, 0.05, 0.05]} c={["#fff", "#ffe566", "#ffb8c6"][i]} r={0.02} />)}
      </group>
      {/* roll-down projector screen above the board + ceiling projector */}
      <group position={[0, 4.75, zFront + 0.2]}>
        <Box p={[0, 0.72, 0]} s={[4.2, 0.1, 0.1]} c={CHARCOAL} r={0.04} rough={0.4} />
        <mesh position={[0, 0, 0.02]} receiveShadow><planeGeometry args={[4.0, 1.5]} /><meshStandardMaterial map={slideT} roughness={0.7} /></mesh>
        <Box p={[0, -0.78, 0.02]} s={[4.0, 0.05, 0.05]} c={CHARCOAL} r={0.02} rough={0.4} />
      </group>
      <group position={[0, 5.9, 2.4]}>
        <mesh position={[0, 0.25, 0]} material={clay(CHARCOAL, { roughness: 0.5 })}><cylinderGeometry args={[0.012, 0.012, 0.5, 6]} /></mesh>
        <Box p={[0, -0.05, 0]} s={[0.46, 0.14, 0.36]} c="#e9e6df" r={0.05} rough={0.4} />
        <mesh position={[0, -0.05, -0.19]} rotation={[Math.PI / 2, 0, 0]} material={clay(CHARCOAL)}><cylinderGeometry args={[0.06, 0.06, 0.04, 20]} /></mesh>
      </group>

      {/* framed prints, a modern clock and a glass door on the front wall */}
      <group position={[-5.3, 2.7, zFront + 0.1]}><Box p={[0, 0, 0]} s={[1.05, 1.4, 0.05]} c="#1b1a17" r={0.02} /><mesh position={[0, 0, 0.03]}><planeGeometry args={[0.92, 1.27]} /><meshStandardMaterial map={art0} /></mesh></group>
      <group position={[-5.3, 4.35, zFront + 0.1]}><Clock /><mesh rotation={[Math.PI / 2, 0, 0]} material={clay("#f6efe0", { roughness: 0.4 })} castShadow><cylinderGeometry args={[0.34, 0.34, 0.06, 40]} /></mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.034]} material={clay(CHARCOAL, { roughness: 0.5 })}><torusGeometry args={[0.33, 0.02, 10, 40]} /></mesh>
      </group>
      <group position={[5.1, 2.7, zFront + 0.1]}><Box p={[0, 0, 0]} s={[1.05, 1.4, 0.05]} c="#1b1a17" r={0.02} /><mesh position={[0, 0, 0.03]}><planeGeometry args={[0.92, 1.27]} /><meshStandardMaterial map={art1} /></mesh></group>
      <group position={[6.1, 1.3, zFront + 0.14]}>
        <Box p={[0, 0, 0]} s={[1.3, 2.6, 0.1]} c={WALNUT} r={0.04} rough={0.5} />
        <mesh position={[0, 0.35, 0.06]}><planeGeometry args={[0.7, 1.4]} /><meshStandardMaterial color="#bfd9df" transparent opacity={0.65} roughness={0.1} /></mesh>
        <mesh position={[-0.46, -0.1, 0.08]} material={clay("#2b2d31")}><cylinderGeometry args={[0.02, 0.02, 0.3, 8]} /></mesh>
      </group>

      {/* ---- left wall: tall windows with blinds, plants on the sill ---- */}
      {[-0.5, 4.2, 8.9].map((z, i) => (
        <group key={i} position={[x0 + 0.08, 2.65, z]}>
          <Box p={[0, 0, 0]} s={[0.14, 2.3, 2.5]} c="#f1ece2" r={0.05} shadow={false} />
          <mesh position={[0.08, 0, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[2.2, 2.0]} /><meshBasicMaterial color="#dcefff" /></mesh>
          <Box p={[0.1, 0, 0]} s={[0.05, 2.0, 0.06]} c="#f1ece2" r={0.02} shadow={false} />
          <Box p={[0.1, 0, 0]} s={[0.05, 0.06, 2.2]} c="#f1ece2" r={0.02} shadow={false} />
          {Array.from({ length: lite ? 0 : 8 }, (_, k) => <Box key={k} p={[0.12, 0.88 - k * 0.1, 0]} s={[0.02, 0.06, 2.15]} c="#e4dccb" r={0.01} shadow={false} />)}
        </group>
      ))}
      <Plant p={[-6.3, 0, 2.1]} s={1.05} />{!lite && <Plant p={[-6.3, 0, 6.8]} s={0.9} />}<Plant p={[-6.3, 0, -5.3]} s={1.15} />
      {/* acoustic felt panels on the right wall, above the pinboard */}
      {[[-3.4, SAGE], [-1.5, "#c9795a"], [0.4, "#d9c8a8"], [2.3, SAGE], [4.2, "#c9795a"], [6.1, "#d9c8a8"]].map(([z, c], i) => (
        <Box key={i} p={[x1 - 0.1, 5.0, z + 0.9]} s={[0.08, 1.2, 1.5]} c={c} r={0.04} rough={1} />
      ))}

      {/* ---- right wall: pinboard with flyers ---- */}
      <group position={[x1 - 0.1, 2.35, 2.8]} rotation={[0, -Math.PI / 2, 0]}>
        <Box p={[0, 0, 0]} s={[5.2, 2.5, 0.14]} c={CHARCOAL} r={0.05} rough={0.5} />
        <mesh position={[0, 0, 0.08]}><planeGeometry args={[4.9, 2.2]} /><meshStandardMaterial map={corkT} roughness={1} /></mesh>
        {papers.map((q, i) => <Paper key={i} p={[q.z * 0.52, q.y, 0.1 + (i % 5) * 0.004]} rot={[0, 0, q.rot]} c={q.c} s={q.s} />)}
      </group>

      {/* ---- lectern with a laptop ---- */}
      <group position={[-3.3, 0, -4.7]}>
        <Box p={[0, 0.55, 0]} s={[0.8, 1.1, 0.55]} c={WALNUT} rough={0.5} />
        <Box p={[0, 1.12, 0.02]} s={[0.88, 0.05, 0.62]} c="#a97a55" rough={0.45} />
        <Box p={[0, 1.16, 0.04]} s={[0.36, 0.014, 0.25]} c="#9ea3ab" r={0.006} rough={0.4} />
        <Box p={[0, 1.27, -0.08]} s={[0.36, 0.23, 0.01]} c="#a9aeb6" r={0.006} rough={0.4} rot={[-0.3, 0, 0]} />
        <mesh position={[0.32, 1.19, 0.1]} material={clay("#f6f2ea", { roughness: 0.5 })} castShadow><cylinderGeometry args={[0.04, 0.034, 0.09, 18]} /></mesh>
      </group>

      {/* linear pendant lights over the room */}
      {[[-3.2, 2.4], [0, 2.4], [3.2, 2.4], [-3.2, 7.8], [0, 7.8], [3.2, 7.8]].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          {[-1, 1].map((s) => <mesh key={s} position={[s * 0.9, 5.7, 0]} material={clay(CHARCOAL)}><cylinderGeometry args={[0.008, 0.008, 1.4, 6]} /></mesh>)}
          <Box p={[0, 4.98, 0]} s={[2.1, 0.07, 0.16]} c={CHARCOAL} r={0.03} rough={0.4} />
          <mesh position={[0, 4.94, 0]} material={new THREE.MeshBasicMaterial({ color: "#fff6e0" })}><boxGeometry args={[1.95, 0.012, 0.11]} /></mesh>
        </group>
      ))}
    </group>
  );
}
