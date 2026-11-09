"use client";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { ROOM } from "./Room";
import { corkTexture, boardTexture, feedTexture, slideTexture, artTexture } from "./textures";
import { pbrMat, fabricMat, ALU, STEEL, BRASS } from "./pbr";

/* The full-quality lecture room for capable GPUs: scanned materials and properly modelled objects. */
const rb = (w, h, d, r = 0.02) => new RoundedBoxGeometry(w, h, d, 3, r);
const std = (color, roughness = 0.6, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

// many boxes, one draw call. item: [x, y, z, w, h, d]. uvFn lets each box sample a different strip of the texture.
function boxes(items, uvFn) {
  return mergeGeometries(items.map((b, i) => {
    const g = new THREE.BoxGeometry(b[3], b[4], b[5]);
    if (uvFn) { const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) { const [u, v] = uvFn(uv.getX(k), uv.getY(k), i); uv.setXY(k, u, v); } }
    g.translate(b[0], b[1], b[2]);
    return g;
  }));
}
const Mesh = ({ g, m, cast = true, recv = true, ...p }) => <mesh geometry={g} material={m} castShadow={cast} receiveShadow={recv} {...p} />;

/* ---- a real leafy plant: curved, folded leaves on a stem, in a ceramic planter ---- */
function leafTexture() {
  const c = document.createElement("canvas"); c.width = 128; c.height = 256;
  const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 128, 0);
  gr.addColorStop(0, "#2f6b3f"); gr.addColorStop(0.5, "#4b9159"); gr.addColorStop(1, "#2c6239");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 256);
  g.strokeStyle = "rgba(190,226,160,0.75)"; g.lineWidth = 3.5; g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 256); g.stroke();
  g.lineWidth = 1.4; g.strokeStyle = "rgba(190,226,160,0.42)";
  for (let y = 16; y < 250; y += 22) { g.beginPath(); g.moveTo(64, y); g.quadraticCurveTo(26, y + 12, 0, y + 34); g.moveTo(64, y); g.quadraticCurveTo(102, y + 12, 128, y + 34); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function buildLeaf(len, wid, droop) {
  const nu = 4, nv = 9, pos = [], uv = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const v = j / nv, u = (i / nu) * 2 - 1, w = Math.sin(Math.PI * Math.pow(v, 0.75)) * wid;
    pos.push(u * w, len * v * (1 - v * droop * 0.25), Math.abs(u) * w * 0.32 - v * v * len * droop);
    uv.push(i / nu, v);
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + nu + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
function Plant({ p, s = 1, seed = 1 }) {
  const sway = useRef();
  const { leaves, stem, mat } = useMemo(() => {
    let x = seed * 9973 + 11; const r = () => ((x = (x * 16807) % 2147483647) / 2147483647);
    const pts = [new THREE.Vector3(0, 0.6, 0), new THREE.Vector3(0.05, 1.2, 0.03), new THREE.Vector3(-0.03, 1.9, -0.04), new THREE.Vector3(0.04, 2.45, 0.02)];
    const curve = new THREE.CatmullRomCurve3(pts);
    const stem = new THREE.TubeGeometry(curve, 24, 0.028, 8, false);
    const parts = [], m = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion(), T = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1);
    const N = 44;
    for (let i = 0; i < N; i++) {
      const t = 0.3 + (i / N) * 0.7, base = curve.getPoint(t);
      const big = 1.25 - t * 0.6, len = (0.5 + r() * 0.2) * big, g = buildLeaf(len, len * (0.3 + r() * 0.08), 0.42 + r() * 0.4);
      e.set(1.25 + r() * 0.55 - t * 0.75, i * 2.39996 + r() * 0.5, 0, "YXZ"); q.setFromEuler(e);
      m.compose(T.copy(base), q, S); g.applyMatrix4(m); g.computeVertexNormals();
      const c = 0.82 + r() * 0.36, col = new Float32Array(g.attributes.position.count * 3).fill(c);
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      parts.push(g);
    }
    return { leaves: mergeGeometries(parts), stem, mat: new THREE.MeshStandardMaterial({ map: leafTexture(), vertexColors: true, roughness: 0.48, side: THREE.DoubleSide }) };
  }, [seed]);
  useFrame((st) => { const t = st.clock.elapsedTime; if (sway.current) { sway.current.rotation.z = Math.sin(t * 0.7 + seed) * 0.018; sway.current.rotation.x = Math.sin(t * 0.55 + seed * 2) * 0.014; } });
  const planter = useMemo(() => new THREE.LatheGeometry([[0, 0], [0.2, 0], [0.26, 0.06], [0.31, 0.56], [0.33, 0.62], [0.3, 0.63], [0.27, 0.57], [0, 0.57]].map(([a, b]) => new THREE.Vector2(a, b)), 40), []);
  return (
    <group position={p} scale={s}>
      <Mesh g={planter} m={useMemo(() => std("#d9d2c6", 0.32), [])} />
      <mesh position={[0, 0.58, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={useMemo(() => std("#32261c", 1), [])}><circleGeometry args={[0.28, 28]} /></mesh>
      <group ref={sway} position={[0, 0.6, 0]}>
        <group position={[0, -0.6, 0]}>
          <Mesh g={stem} m={useMemo(() => std("#5a4231", 0.8), [])} />
          <Mesh g={leaves} m={mat} />
        </group>
      </group>
    </group>
  );
}

/* ---- a wall clock: printed dial, metal case, glass, hands showing the visitor's real time ---- */
function Clock() {
  const h = useRef(), m = useRef(), s = useRef();
  const dial = useMemo(() => {
    const c = document.createElement("canvas"); c.width = c.height = 512;
    const g = c.getContext("2d"); g.fillStyle = "#f7f4ec"; g.fillRect(0, 0, 512, 512); g.translate(256, 256);
    for (let i = 0; i < 60; i++) { g.save(); g.rotate((i * Math.PI) / 30); g.fillStyle = "#1b1a17"; if (i % 5 === 0) g.fillRect(-5, -240, 10, 42); else g.fillRect(-1.5, -240, 3, 18); g.restore(); }
    g.fillStyle = "#1b1a17"; g.font = "600 44px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    for (let i = 1; i <= 12; i++) { const a = (i * Math.PI) / 6; g.fillText(String(i), Math.sin(a) * 160, -Math.cos(a) * 160); }
    g.font = "500 20px sans-serif"; g.fillStyle = "#6b6a66"; g.fillText("CAMPUS TIME", 0, 78);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  }, []);
  const mats = useMemo(() => ({ rim: STEEL(), hand: std("#1b1a17", 0.5), red: std("#d6452c", 0.45), glass: new THREE.MeshPhysicalMaterial({ color: "#ffffff", transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0, clearcoat: 1 }) }), []);
  useFrame(() => {
    const d = new Date(), S = d.getSeconds(), M = d.getMinutes() + S / 60, H = (d.getHours() % 12) + M / 60;
    if (s.current) s.current.rotation.z = -S * (Math.PI / 30);
    if (m.current) m.current.rotation.z = -M * (Math.PI / 30);
    if (h.current) h.current.rotation.z = -H * (Math.PI / 6);
  });
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.02]} material={mats.rim} castShadow><cylinderGeometry args={[0.4, 0.4, 0.08, 56]} /></mesh>
      <mesh position={[0, 0, 0.062]} material={mats.rim}><torusGeometry args={[0.385, 0.022, 12, 56]} /></mesh>
      <mesh position={[0, 0, 0.0605]}><circleGeometry args={[0.37, 56]} /><meshStandardMaterial map={dial} roughness={0.5} /></mesh>
      <group ref={h} position={[0, 0, 0.066]}><mesh position={[0, 0.085, 0]} material={mats.hand}><boxGeometry args={[0.026, 0.2, 0.005]} /></mesh></group>
      <group ref={m} position={[0, 0, 0.07]}><mesh position={[0, 0.125, 0]} material={mats.hand}><boxGeometry args={[0.017, 0.29, 0.005]} /></mesh></group>
      <group ref={s} position={[0, 0, 0.074]}><mesh position={[0, 0.11, 0]} material={mats.red}><boxGeometry args={[0.006, 0.33, 0.003]} /></mesh></group>
      <mesh position={[0, 0, 0.074]} rotation={[Math.PI / 2, 0, 0]} material={mats.red}><cylinderGeometry args={[0.014, 0.014, 0.012, 16]} /></mesh>
      <mesh position={[0, 0, 0.082]} material={mats.glass}><circleGeometry args={[0.37, 48]} /></mesh>
    </group>
  );
}

/* the view through the windows */
function viewTexture(seed) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 460;
  const g = c.getContext("2d"), s = g.createLinearGradient(0, 0, 0, 460);
  s.addColorStop(0, "#c6e2f2"); s.addColorStop(0.7, "#eef6f6"); s.addColorStop(1, "#faf4e4");
  g.fillStyle = s; g.fillRect(0, 0, 512, 460);
  g.filter = "blur(16px)";
  let x = seed * 8887 + 3; const r = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  g.fillStyle = "#e7dfd1"; g.fillRect(40 + r() * 200, 210, 220, 180);
  for (let i = 0; i < 26; i++) { g.fillStyle = ["#a9c79f", "#b9d3ae", "#9cbd98", "#c8dcba"][i % 4]; g.beginPath(); g.ellipse(r() * 512, 350 + r() * 110, 44 + r() * 58, 40 + r() * 54, 0, 0, 7); g.fill(); }
  g.filter = "none";
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function sunTexture() {
  const c = document.createElement("canvas"); c.width = 256; c.height = 256;
  const g = c.getContext("2d"); g.filter = "blur(5px)"; g.fillStyle = "#fff";
  [[20, 20, 100, 100], [136, 20, 100, 100], [20, 136, 100, 100], [136, 136, 100, 100]].forEach((b) => g.fillRect(...b));
  return new THREE.CanvasTexture(c);
}

function Pinned({ p, rot, c, s, m }) {
  return (
    <group position={p} rotation={rot}>
      <mesh castShadow material={m}><boxGeometry args={[s, s * 1.3, 0.006]} /></mesh>
      <mesh position={[0, s * 0.54, 0.012]} material={useMemo(() => std("#d6452c", 0.35), [])}><sphereGeometry args={[0.022, 12, 10]} /></mesh>
    </group>
  );
}

export default function RoomRich({ fonts, feedRef }) {
  const { x0, x1, zFront, zBack, h } = ROOM;
  const W = x1 - x0, D = zBack - zFront, cz = (zBack + zFront) / 2;
  const T = useMemo(() => ({
    board: boardTexture(fonts.display, 2), feed: feedTexture(fonts.display, 2), slide: slideTexture(fonts.display), cork: corkTexture(), art0: artTexture(0), art1: artTexture(1),
    views: [0, 1, 2].map((i) => viewTexture(i + 1)), sun: sunTexture(),
  }), [fonts.display]);
  const M = useMemo(() => {
    const warm = [1.5, 1.42, 1.26];
    return {
      floor: pbrMat("floor", W / 2.7, D / 2.7, { tint: [1.34, 1.24, 1.08], normal: 0.9 }),
      wallFB: pbrMat("plaster", W / 3.2, h / 3.2, { tint: warm, normal: 0.5 }),
      wallS: pbrMat("plaster", D / 3.2, h / 3.2, { tint: warm, normal: 0.5 }),
      walnut: pbrMat("walnut", 1, 1, { tint: [0.82, 0.72, 0.62], normal: 1 }),
      walnutPanelF: pbrMat("walnut", W / 1.5, 1, { tint: [0.7, 0.6, 0.5] }),
      walnutPanelS: pbrMat("walnut", D / 1.5, 1, { tint: [0.7, 0.6, 0.5] }),
      slat: pbrMat("walnut", 1, 2.2, { tint: [0.92, 0.8, 0.68] }),
      oak: pbrMat("oak", 1, 1, { tint: [1.08, 1.02, 0.94] }),
      door: pbrMat("walnut", 1, 2, { tint: [0.86, 0.75, 0.64] }),
      alu: ALU(), steel: STEEL(), brass: BRASS(), dark: std("#17181b", 0.5, 0.2), back: std("#201711", 0.9),
      cream: std("#f1ece2", 0.45), slateEdge: std("#111614", 0.7), paper: ["#fbd4dd", "#ffeb8f", "#c9e2ff", "#cdeeb6", "#ffd8a4", "#e0d4ff", "#fff9e6"].map((c) => std(c, 0.92)),
      felt: { a: fabricMat("#7e9b86"), b: fabricMat("#c9795a"), c: fabricMat("#d9c8a8") },
    };
  }, [W, D, h]);
  const G = useMemo(() => {
    let x = 17; const r = () => ((x = (x * 16807) % 2147483647) / 2147483647);
    const slats = [], battF = [], battS = [];
    for (let px = -6.3; px <= 6.31; px += 0.2) slats.push([px, 3.39, zFront + 0.075, 0.155, 4.26, 0.09]);
    for (let bx = x0 + 1.5; bx < x1; bx += 1.5) battF.push([bx, 0.6, zFront + 0.095, 0.05, 1.16, 0.03]);
    for (let bz = zFront + 1.5; bz < zBack; bz += 1.5) { battS.push([x0 + 0.095, 0.6, bz, 0.03, 1.16, 0.05]); battS.push([x1 - 0.095, 0.6, bz, 0.03, 1.16, 0.05]); }
    return {
      slats: boxes(slats, (u, v, i) => [u * 0.1 + (i * 0.137) % 0.9, v + (i * 0.31) % 1]),
      batt: boxes([...battF, ...battS]),
      skirt: boxes([[0, 0.05, zFront + 0.1, W, 0.1, 0.04], [x0 + 0.1, 0.05, cz, 0.04, 0.1, D], [x1 - 0.1, 0.05, cz, 0.04, 0.1, D], [0, 0.05, zBack - 0.1, W, 0.1, 0.04]]),
      cap: boxes([[0, 1.215, zFront + 0.09, W, 0.04, 0.09], [x0 + 0.09, 1.215, cz, 0.09, 0.04, D], [x1 - 0.09, 1.215, cz, 0.09, 0.04, D], [0, 1.215, zBack - 0.09, W, 0.04, 0.09]]),
      frame: boxes([[0, 1.5, 0, 7.84, 0.1, 0.1], [0, -1.5, 0, 7.84, 0.1, 0.1], [-3.92, 0, 0, 0.1, 3.1, 0.1], [3.92, 0, 0, 0.1, 3.1, 0.1]]),
      papers: (() => Array.from({ length: 34 }, (_, i) => ({ y: (r() - 0.5) * 1.75, z: (r() - 0.5) * 2.45, rot: (r() - 0.5) * 0.5, m: i % 7, s: 0.32 + r() * 0.2 })))(),
    };
  }, [x0, x1, zFront, zBack, W, D, cz]);
  const pendants = [[-3.2, 2.4], [0, 2.4], [3.2, 2.4], [-3.2, 7.8], [0, 7.8], [3.2, 7.8]];
  const glow = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.42, 1.25), toneMapped: false }), []);

  return (
    <group>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, cz]} receiveShadow material={M.floor}><planeGeometry args={[W, D]} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, cz]} receiveShadow><planeGeometry args={[160, 160]} /><meshStandardMaterial color="#efe5cf" roughness={1} /></mesh>
      {/* sunlight from the windows falling across the floor */}
      {[-0.5, 4.2, 8.9].map((z, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0.12]} position={[-3.6, 0.012, z + 0.7]}>
          <planeGeometry args={[4.4, 2.3]} /><meshBasicMaterial map={T.sun} color="#fff0cf" transparent opacity={0.16} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      ))}

      {/* plaster walls */}
      <mesh position={[0, h / 2, zFront - 0.15]} material={M.wallFB} castShadow receiveShadow><boxGeometry args={[W + 0.6, h, 0.3]} /></mesh>
      <mesh position={[x0 - 0.15, h / 2, cz]} material={M.wallS} castShadow receiveShadow><boxGeometry args={[0.3, h, D]} /></mesh>
      <mesh position={[x1 + 0.15, h / 2, cz]} material={M.wallS} castShadow receiveShadow><boxGeometry args={[0.3, h, D]} /></mesh>
      <mesh position={[0, h / 2, zBack + 0.15]} material={M.wallFB} castShadow receiveShadow><boxGeometry args={[W + 0.6, h, 0.3]} /></mesh>

      {/* walnut panelling with battens, an oak cap rail and a dark skirting */}
      <mesh position={[0, 0.6, zFront + 0.04]} material={M.walnutPanelF} receiveShadow><boxGeometry args={[W, 1.2, 0.08]} /></mesh>
      <mesh position={[x0 + 0.04, 0.6, cz]} material={M.walnutPanelS} receiveShadow><boxGeometry args={[0.08, 1.2, D]} /></mesh>
      <mesh position={[x1 - 0.04, 0.6, cz]} material={M.walnutPanelS} receiveShadow><boxGeometry args={[0.08, 1.2, D]} /></mesh>
      <mesh position={[0, 0.6, zBack - 0.04]} material={M.walnutPanelF} receiveShadow><boxGeometry args={[W, 1.2, 0.08]} /></mesh>
      <Mesh g={G.batt} m={M.walnut} /><Mesh g={G.skirt} m={M.dark} cast={false} /><Mesh g={G.cap} m={M.oak} />

      {/* real walnut slats on the front wall */}
      <mesh position={[0, 3.39, zFront + 0.03]} material={M.back}><planeGeometry args={[12.8, 4.26]} /></mesh>
      <Mesh g={G.slats} m={M.slat} />

      {/* slate chalkboard in an aluminium frame */}
      <group position={[0, 2.25, zFront + 0.18]}>
        <mesh position={[0, 0, -0.02]} material={M.slateEdge}><boxGeometry args={[7.74, 2.98, 0.05]} /></mesh>
        <Mesh g={G.frame} m={M.alu} />
        <mesh position={[0, 0, 0.012]} receiveShadow><planeGeometry args={[7.74, 2.9]} /><meshStandardMaterial map={T.board} roughness={0.9} /></mesh>
        <mesh position={[0, 0, 0.016]}><planeGeometry args={[7.74, 2.9]} /><meshBasicMaterial ref={feedRef} map={T.feed} transparent opacity={0} toneMapped={false} /></mesh>
        <mesh position={[0, -1.6, 0.1]} material={M.alu} castShadow receiveShadow><boxGeometry args={[7.6, 0.035, 0.2]} /></mesh>
        {[[-2.8, "#ffffff"], [-2.55, "#ffe88a"], [-2.34, "#ffc2cf"]].map(([x, c], i) => (
          <mesh key={i} position={[x, -1.56, 0.12]} rotation={[0, 0, Math.PI / 2 + i * 0.1]} castShadow material={std(c, 0.95)}><cylinderGeometry args={[0.014, 0.014, 0.12, 12]} /></mesh>
        ))}
        <group position={[-1.6, -1.55, 0.12]}><mesh material={M.oak} castShadow><boxGeometry args={[0.26, 0.05, 0.1]} /></mesh><mesh position={[0, -0.03, 0]} material={M.felt.c}><boxGeometry args={[0.25, 0.015, 0.09]} /></mesh></group>
      </group>

      {/* projector screen and ceiling projector */}
      <group position={[0, 4.75, zFront + 0.24]}>
        <mesh position={[0, 0.8, 0.02]} material={M.cream} castShadow><boxGeometry args={[4.3, 0.13, 0.13]} /></mesh>
        <mesh position={[0, 0, 0.02]} receiveShadow><planeGeometry args={[4.0, 1.5]} /><meshStandardMaterial map={T.slide} roughness={0.75} /></mesh>
        <mesh position={[0, -0.78, 0.02]} material={M.dark}><boxGeometry args={[4.04, 0.04, 0.04]} /></mesh>
      </group>
      <group position={[0, 5.72, 2.2]}>
        <mesh position={[0, 0.36, 0]} material={M.steel}><cylinderGeometry args={[0.018, 0.018, 0.72, 10]} /></mesh>
        <Mesh g={useMemo(() => rb(0.5, 0.15, 0.4, 0.04), [])} m={M.cream} />
        <mesh position={[0, -0.005, -0.21]} rotation={[Math.PI / 2, 0, 0]} material={M.dark}><cylinderGeometry args={[0.07, 0.08, 0.05, 28]} /></mesh>
        <mesh position={[0, -0.005, -0.237]}><circleGeometry args={[0.052, 24]} /><meshStandardMaterial color="#10283a" roughness={0.05} metalness={0.7} /></mesh>
      </group>

      {/* framed prints and the clock */}
      {[[-5.3, T.art0], [4.62, T.art1]].map(([x, t], i) => (
        <group key={i} position={[x, 2.72, zFront + 0.14]}>
          <mesh material={M.dark} castShadow><boxGeometry args={[1.08, 1.44, 0.05]} /></mesh>
          <mesh position={[0, 0, 0.027]} material={M.cream}><planeGeometry args={[1.0, 1.36]} /></mesh>
          <mesh position={[0, 0, 0.03]}><planeGeometry args={[0.8, 1.14]} /><meshStandardMaterial map={t} roughness={0.7} /></mesh>
          <mesh position={[0, 0, 0.034]}><planeGeometry args={[1.0, 1.36]} /><meshPhysicalMaterial color="#ffffff" transparent opacity={0.05} roughness={0.08} /></mesh>
        </group>
      ))}
      <group position={[-5.3, 4.35, zFront + 0.12]}><Clock /></group>

      {/* door: frame, walnut slab, vision glass, lever handle, kick plate, hinges and closer */}
      <group position={[6.05, 0, zFront + 0.1]}>
        <mesh position={[0, 2.68, 0.02]} material={M.dark} castShadow><boxGeometry args={[1.42, 0.1, 0.12]} /></mesh>
        <mesh position={[-0.66, 1.32, 0.02]} material={M.dark}><boxGeometry args={[0.1, 2.64, 0.12]} /></mesh>
        <mesh position={[0.66, 1.32, 0.02]} material={M.dark}><boxGeometry args={[0.1, 2.64, 0.12]} /></mesh>
        <mesh position={[0, 1.32, 0.02]} material={M.door} castShadow receiveShadow><boxGeometry args={[1.22, 2.62, 0.06]} /></mesh>
        <mesh position={[0, 1.78, 0.056]} material={M.alu}><boxGeometry args={[0.5, 1.2, 0.012]} /></mesh>
        <mesh position={[0, 1.78, 0.064]}><planeGeometry args={[0.42, 1.12]} /><meshPhysicalMaterial color="#bcd9e2" roughness={0.04} metalness={0.1} clearcoat={1} /></mesh>
        <mesh position={[0, 0.16, 0.056]} material={M.alu}><boxGeometry args={[1.18, 0.26, 0.006]} /></mesh>
        <group position={[-0.48, 1.08, 0.06]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={M.alu}><cylinderGeometry args={[0.05, 0.05, 0.015, 24]} /></mesh>
          <mesh position={[0, 0, 0.04]} rotation={[Math.PI / 2, 0, 0]} material={M.alu}><cylinderGeometry args={[0.015, 0.015, 0.07, 12]} /></mesh>
          <mesh position={[0.06, 0, 0.078]} material={M.alu} castShadow><boxGeometry args={[0.16, 0.024, 0.02]} /></mesh>
        </group>
        {[0.4, 1.32, 2.2].map((y) => <mesh key={y} position={[0.62, y, 0.06]} material={M.alu}><cylinderGeometry args={[0.012, 0.012, 0.1, 10]} /></mesh>)}
        <mesh position={[0.1, 2.56, 0.08]} material={M.steel} castShadow><boxGeometry args={[0.28, 0.06, 0.05]} /></mesh>
      </group>

      {/* tall windows: slim bronze frames, a view outside, blinds half drawn */}
      {[-0.5, 4.2, 8.9].map((z, i) => (
        <group key={i} position={[x0 + 0.05, 2.75, z]}>
          <mesh material={M.cream} castShadow={false} receiveShadow><boxGeometry args={[0.12, 2.46, 2.6]} /></mesh>
          <mesh position={[0.066, 0, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[2.34, 2.2]} /><meshBasicMaterial map={T.views[i]} toneMapped={false} /></mesh>
          <mesh position={[0.075, 1.12, 0]} material={M.dark}><boxGeometry args={[0.05, 0.05, 2.4]} /></mesh>
          <mesh position={[0.075, -1.12, 0]} material={M.dark}><boxGeometry args={[0.05, 0.05, 2.4]} /></mesh>
          <mesh position={[0.075, 0, -1.18]} material={M.dark}><boxGeometry args={[0.05, 2.28, 0.05]} /></mesh>
          <mesh position={[0.075, 0, 1.18]} material={M.dark}><boxGeometry args={[0.05, 2.28, 0.05]} /></mesh>
          <mesh position={[0.075, 0, 0]} material={M.dark}><boxGeometry args={[0.04, 2.2, 0.04]} /></mesh>
          <mesh position={[0.075, -0.1, 0]} material={M.dark}><boxGeometry args={[0.04, 0.04, 2.3]} /></mesh>
          <mesh position={[0.1, -1.2, 0]} material={M.oak} castShadow><boxGeometry args={[0.18, 0.05, 2.6]} /></mesh>
          {Array.from({ length: 13 }, (_, k) => <mesh key={k} position={[0.11, 1.06 - k * 0.075, 0]} rotation={[0, 0, 0.5]} material={M.cream} receiveShadow><boxGeometry args={[0.07, 0.006, 2.3]} /></mesh>)}
          <mesh position={[0.12, 1.12, 0]} material={M.cream}><boxGeometry args={[0.07, 0.07, 2.36]} /></mesh>
        </group>
      ))}
      <Plant p={[-6.25, 0, 2.05]} s={1.05} seed={1} /><Plant p={[-6.25, 0, 6.75]} s={0.92} seed={2} /><Plant p={[-6.2, 0, -5.25]} s={1.15} seed={3} />

      {/* acoustic felt panels */}
      {[[-3.4, "a"], [-1.5, "b"], [0.4, "c"], [2.3, "a"], [4.2, "b"], [6.1, "c"]].map(([z, k], i) => (
        <mesh key={i} position={[x1 - 0.09, 5.0, z + 0.9]} material={M.felt[k]} castShadow receiveShadow><boxGeometry args={[0.08, 1.2, 1.5]} /></mesh>
      ))}

      {/* pinboard */}
      <group position={[x1 - 0.1, 2.35, 2.8]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh material={M.alu} castShadow><boxGeometry args={[5.12, 2.42, 0.08]} /></mesh>
        <mesh position={[0, 0, 0.042]} receiveShadow><planeGeometry args={[4.96, 2.26]} /><meshStandardMaterial map={T.cork} roughness={1} /></mesh>
        {G.papers.map((q, i) => <Pinned key={i} p={[q.z * 1.82 * 0.98 * 0.52 * 1.05, q.y * 0.98, 0.05 + (i % 5) * 0.003]} rot={[0, 0, q.rot]} m={M.paper[q.m]} s={q.s} />)}
      </group>

      {/* lectern: walnut body, inset front panel, oak top, microphone, laptop, mug */}
      <group position={[-3.3, 0, -4.7]}>
        <mesh position={[0, 0.55, 0]} material={M.walnut} castShadow receiveShadow><boxGeometry args={[0.84, 1.1, 0.58]} /></mesh>
        <mesh position={[0, 0.58, 0.295]} material={M.door}><boxGeometry args={[0.68, 0.84, 0.012]} /></mesh>
        <mesh position={[0, 0.68, 0.304]} material={M.brass}><boxGeometry args={[0.4, 0.09, 0.006]} /></mesh>
        <mesh position={[0, 0.03, 0]} material={M.dark}><boxGeometry args={[0.9, 0.06, 0.64]} /></mesh>
        <mesh position={[0, 1.125, 0.02]} rotation={[-0.08, 0, 0]} material={M.oak} castShadow receiveShadow><boxGeometry args={[0.96, 0.05, 0.7]} /></mesh>
        <group position={[0, 1.155, 0.06]} rotation={[-0.08, 0, 0]}>
          <mesh position={[0, 0.008, 0.1]} material={M.alu} castShadow><boxGeometry args={[0.36, 0.014, 0.25]} /></mesh>
          <mesh position={[0, 0.115, -0.04]} rotation={[-0.3, 0, 0]} material={M.alu} castShadow><boxGeometry args={[0.36, 0.23, 0.01]} /></mesh>
        </group>
        <mesh position={[0.36, 1.2, 0.2]} material={M.cream} castShadow><cylinderGeometry args={[0.04, 0.034, 0.09, 24]} /></mesh>
        <group position={[-0.34, 1.16, 0.26]}>
          <mesh position={[0, 0.01, 0]} material={M.dark}><cylinderGeometry args={[0.05, 0.055, 0.025, 20]} /></mesh>
          <mesh position={[0, 0.16, -0.05]} rotation={[0.35, 0, 0]} material={M.steel}><cylinderGeometry args={[0.007, 0.007, 0.32, 8]} /></mesh>
          <mesh position={[0, 0.31, -0.1]} rotation={[1.1, 0, 0]} material={M.dark}><cylinderGeometry args={[0.018, 0.012, 0.075, 12]} /></mesh>
        </group>
      </group>

      {/* linear pendants: anodised housing, opal diffuser, steel cables */}
      {pendants.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          {[-0.9, 0.9].map((s) => <mesh key={s} position={[s, 5.74, 0]} material={M.steel}><cylinderGeometry args={[0.006, 0.006, 1.46, 6]} /></mesh>)}
          <mesh position={[0, 4.99, 0]} material={M.dark} castShadow><boxGeometry args={[2.12, 0.075, 0.15]} /></mesh>
          <mesh position={[0, 4.95, 0]} material={glow}><boxGeometry args={[2.02, 0.012, 0.115]} /></mesh>
        </group>
      ))}
    </group>
  );
}
