"use client";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import Room from "./scene/Room";
import RoomRich from "./scene/RoomRich";
import { loadPBR } from "./scene/pbr";
import { Classroom, useBubbleTextures } from "./scene/People";
import Notices from "./scene/Notices";
import { CameraRig } from "./scene/rig";
import { noteTextures } from "./scene/textures";

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* How hard can this machine's GPU work? We ask for the high-performance GPU, then size the quality to it. */
function detectTier() {
  const q = new URLSearchParams(location.search).get("q");
  if (q === "high" || q === "mid" || q === "low") return q;
  const nav = navigator;
  if (window.matchMedia("(max-width: 820px), (pointer: coarse)").matches || (nav.deviceMemory && nav.deviceMemory <= 4) || (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4)) return "low";
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2", { powerPreference: "high-performance" });
    const e = gl && gl.getExtension("WEBGL_debug_renderer_info");
    const r = ((e && gl.getParameter(e.UNMASKED_RENDERER_WEBGL)) || "").toLowerCase();
    if (/nvidia|geforce|rtx|gtx|quadro|radeon (rx|pro)|apple (m\d|gpu)|arc a/.test(r)) return "high";
  } catch (err) { /* fall through */ }
  return "mid";
}
const TIER = {
  high: { dpr: [1, 2], shadow: 4096, ao: true },
  mid: { dpr: [1, 1.5], shadow: 2048, ao: false },
  low: { dpr: [1, 1.25], shadow: 0, ao: false, lite: true },
};

/* image-based lighting: soft reflections and fill on every surface (cheap, a big realism jump) */
function Env() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const tex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = tex; scene.environmentIntensity = 0.5;
    return () => { scene.environment = null; tex.dispose(); pm.dispose(); };
  }, [gl, scene]);
  return null;
}

/* screen-space ambient occlusion: contact shadows in every crease (high-end GPUs only) */
function Post() {
  const { gl, scene, camera, size } = useThree();
  const composer = useMemo(() => {
    const rt = new THREE.WebGLRenderTarget(size.width, size.height, { type: THREE.HalfFloatType, samples: 4 });
    const c = new EffectComposer(gl, rt);
    c.addPass(new RenderPass(scene, camera));
    const ao = new GTAOPass(scene, camera, size.width, size.height);
    ao.output = GTAOPass.OUTPUT.Default;
    ao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.6, thickness: 1.0, scale: 1.0, samples: 14, distanceFallOff: 1, screenSpaceRadius: false });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 12 });
    c.addPass(ao);
    c.addPass(new OutputPass());
    return c;
  }, [gl, scene, camera]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { composer.setPixelRatio(gl.getPixelRatio()); composer.setSize(size.width, size.height); }, [composer, gl, size]);
  useFrame(() => composer.render(), 1);
  return null;
}

/* Watches the real frame rate and steps quality down if this device cannot keep up. */
function Governor({ story, setAo }) {
  const { gl, setDpr } = useThree();
  const st = useRef({ n: 0, sum: 0, level: 0, frame: 0 });
  useFrame((_, dt) => {
    const s = st.current;
    if (gl.shadowMap.enabled && s.level >= 2) { s.frame++; gl.shadowMap.autoUpdate = false; if (s.frame % 8 === 0) gl.shadowMap.needsUpdate = true; }
    if (dt > 0.25 || document.hidden) return;       // tab was in the background: says nothing about the GPU
    s.n++; s.sum += dt;
    if (s.n < 90) return;
    const fps = s.n / s.sum; s.n = 0; s.sum = 0;
    if (fps >= 28 || s.level >= 4) return;
    s.level++;
    if (s.level === 1) { setAo(false); setDpr(1); }
    if (s.level === 3) story.animEvery = 2;
    if (s.level === 4) { story.animEvery = 3; setDpr(0.8); }
  });
  return null;
}

function World({ story, fonts, tier, onReady }) {
  const [ao, setAo] = useState(true);
  const feedRef = useRef();
  const bub = useBubbleTextures();
  const notes = useMemo(() => noteTextures(fonts.display, fonts.mono), [fonts]);
  const t = TIER[tier];
  useEffect(() => { if (t.lite) story.animEvery = 3; }, [t.lite, story]);
  useFrame(() => { if (feedRef.current) feedRef.current.opacity = sm(0.56, 0.64, story.cur); });
  return (
    <>
      <color attach="background" args={["#efe5cf"]} />
      <fog attach="fog" args={["#efe5cf", 45, 130]} />
      {!t.lite && <Env />}
      <hemisphereLight args={["#fff4e2", "#d2b189", t.lite ? 2.1 : 0.9]} />
      <directionalLight position={[-9, 15, 8]} intensity={2.6} color="#fff1da" castShadow={t.shadow > 0} shadow-mapSize={[t.shadow || 512, t.shadow || 512]} shadow-camera-left={-15} shadow-camera-right={15}
        shadow-camera-top={15} shadow-camera-bottom={-15} shadow-camera-near={1} shadow-camera-far={60} shadow-intensity={0.62} shadow-bias={-0.0003} shadow-normalBias={0.035} shadow-radius={3} />
      {t.lite ? <Room fonts={fonts} feedRef={feedRef} lite /> : <RoomRich fonts={fonts} feedRef={feedRef} />}
      <Classroom story={story} tex={bub} onLoaded={onReady} lite={t.lite} />
      <Notices story={story} textures={notes} count={t.lite ? 26 : 64} />
      <CameraRig story={story} />
      {t.ao && ao && <Post />}
      <Governor story={story} setAo={setAo} />
    </>
  );
}

export default function ClassroomCanvas({ story, running = true, onReady }) {
  const [fonts, setFonts] = useState(null);
  const [tier, setTier] = useState("mid");
  useEffect(() => {
    let live = true;
    const tr = detectTier();
    setTier(tr);
    const cs = getComputedStyle(document.documentElement);
    const f = { display: cs.getPropertyValue("--font-display").trim() || "Arial Black", mono: cs.getPropertyValue("--font-mono").trim() || "monospace" };
    Promise.all([document.fonts.load(`700 150px ${f.display}`), document.fonts.load(`800 40px ${f.display}`), document.fonts.load(`500 24px ${f.mono}`)]).catch(() => {}).then(() => document.fonts.ready).then(() => (tr === "low" ? null : loadPBR())).then(() => { if (live) setFonts(f); });
    return () => { live = false; };
  }, []);
  if (!fonts) return null;
  const t = TIER[tier];
  return (
    <Canvas key={tier} shadows={t.shadow > 0} dpr={t.dpr} frameloop={running ? "always" : "never"}
      camera={{ fov: 36, near: 0.1, far: 160, position: [0, 2.5, 11.6] }}
      gl={{ antialias: true, powerPreference: "high-performance", toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1.0 }}
      onCreated={(st) => { window.__r3f = st; }}>
      <World story={story} fonts={fonts} tier={tier} onReady={onReady} />
    </Canvas>
  );
}
