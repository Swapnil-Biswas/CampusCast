"use client";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { bubbleTexture } from "./textures";
import { pbrMat, fabricMat, ALU, STEEL } from "./pbr";

/* ------------------------------------------------------------------------------------------------
   College students and a professor, built from merged primitives so the whole class is only a few
   dozen draw calls. Adult proportions (head ~1/7.5 of body height), jointed arms, modern clothes.
   Local axes for every figure: +y up, forward = -z (they face the board).
------------------------------------------------------------------------------------------------ */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const trap = (a, b, c, d, x) => sm(a, b, x) * (1 - sm(c, d, x));

/* ---------- geometry + material helpers ---------- */
const matCache = new Map();
const mat = (color, rough = 0.85, extra = {}) => {
  const k = color + "|" + rough + "|" + JSON.stringify(extra);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
  return matCache.get(k);
};
const geoCache = new Map();
const G = {
  sph: () => geoCache.get("sph") || (geoCache.set("sph", new THREE.SphereGeometry(1, 28, 20)), geoCache.get("sph")),
  cap: (r, l) => { const k = `cap${r}_${l}`; if (!geoCache.has(k)) geoCache.set(k, new THREE.CapsuleGeometry(r, l, 8, 18)); return geoCache.get(k); },
  box: (w, h, d, r = 0.01) => { const k = `box${w}_${h}_${d}_${r}`; if (!geoCache.has(k)) geoCache.set(k, new RoundedBoxGeometry(w, h, d, 3, r)); return geoCache.get(k); },
  cyl: (rt, rb, h, s = 20) => { const k = `cyl${rt}_${rb}_${h}_${s}`; if (!geoCache.has(k)) geoCache.set(k, new THREE.CylinderGeometry(rt, rb, h, s)); return geoCache.get(k); },
  tor: (r, t, arc = Math.PI * 2) => { const k = `tor${r}_${t}_${arc}`; if (!geoCache.has(k)) geoCache.set(k, new THREE.TorusGeometry(r, t, 10, 36, arc)); return geoCache.get(k); },
};
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function put(list, geo, color, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1], rough) {
  _m.compose(_v.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(s[0], s[1], s[2]));
  let g = geo.clone(); if (g.index) g = g.toNonIndexed();   // rounded boxes are non-indexed, the rest are indexed: make them match
  g.applyMatrix4(_m);
  list.push({ g, c: color, rough });
}
function flush(list, parent, cast = true, receive = false) {
  const by = new Map();
  list.forEach((it) => { const k = it.c + "|" + (it.rough ?? 0.85); if (!by.has(k)) by.set(k, []); by.get(k).push(it.g); });
  by.forEach((gs, k) => {
    const [c, r] = k.split("|");
    const mesh = new THREE.Mesh(mergeGeometries(gs), mat(c, +r));
    mesh.castShadow = cast; mesh.receiveShadow = receive; parent.add(mesh);
  });
  list.length = 0;
}

/* ---------- the cast: Microsoft Rocketbox avatars (MIT licence), converted in /public/people ---------- */
const PACKS = ["#2b2d31", "#2d3a4a", "#5b6b45", "#d9a43a", "#b4553a", "#8a8f99"];
const MODELS = ["Male_Adult_06", "Female_Adult_08", "Male_Adult_09", "Female_Adult_17", "Male_Adult_12", "Female_Adult_12", "Male_Adult_17", "Female_Adult_01", "Male_Adult_10", "Female_Adult_13", "Male_Adult_16", "Male_Adult_18"];
const COLS = [-3.9, -1.3, 1.3, 3.9], ROWS = [1.6, 3.7, 5.8];
export const ROSTER = [];
{
  const relevant = new Set([1, 5, 6, 10]);
  let n = 0;
  ROWS.forEach((z, r) => COLS.forEach((x, c) => {
    const model = MODELS[n];
    ROSTER.push({ i: n, x, z, row: r, col: c, seed: n * 1.37, relevant: relevant.has(n), writer: n % 3 === 0, model, sex: model[0] === "F" ? "f" : "m", pack: n % 3 !== 1, packC: PACKS[n % 6] });
    n++;
  }));
}
const SEAT_Z = 0.4, SEAT_Y = 0.46;
const PROF = "Business_Male_07";

/* fitted once against the sit_table clips (see window.__cast while developing) */
export const FIT = { scale: 1, y: 0, z: 0, faceY: Math.PI };

let castPromise = null;
function loadCast(lite) {
  if (castPromise) return castPromise;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const dir = lite ? "/people/lo" : "/people";
  const names = [...new Set([...ROSTER.map((c) => c.model), PROF])];
  castPromise = Promise.all([
    Promise.all(names.map((n) => loader.loadAsync(`${dir}/${n}.glb`).then((g) => [n, g]))),
    fetch(`${dir}/clips.json`).then((r) => r.json()),
  ]).then(([models, raw]) => {
    const clips = {};
    Object.entries(raw).forEach(([id, c]) => {
      const tracks = c.tracks.map((t) => {
        const name = `${t.n.replace(/ /g, "_")}.${t.p === "rotation" ? "quaternion" : "position"}`;
        let v = t.v;
        if (t.p !== "rotation" && id.includes("walk") && t.n === "Bip01") { v = v.slice(); for (let i = 0; i < v.length; i += 3) { v[i] = v[0]; v[i + 2] = v[2]; } }   // keep him walking on the spot
        return t.p === "rotation" ? new THREE.QuaternionKeyframeTrack(name, t.t, v) : new THREE.VectorKeyframeTrack(name, t.t, v);
      });
      clips[id] = new THREE.AnimationClip(id, c.d, tracks);
    });
    return { models: Object.fromEntries(models), clips };
  });
  return castPromise;
}

const ACTIONS = ["idle_look_around", "idle_scratch_head", "idle_touch_face", "idle_yawn", "gestic_thoughtful"];
const BASE = ["breathe_01", "idle_neutral_01"];

/* helpers that work whatever the bone axes are: they act in world space */
const _pq = new THREE.Quaternion(), _pi = new THREE.Quaternion(), _d = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _I = new THREE.Quaternion();
function rotW(bone, q) {
  bone.parent.getWorldQuaternion(_pq); _pi.copy(_pq).invert();
  bone.quaternion.premultiply(_d.copy(_pi).multiply(q).multiply(_pq)).normalize();
  bone.updateWorldMatrix(false, true);
}
/* The mixer only writes a bone when its animated value changes, so hand-made adjustments would pile up
   frame after frame. Each update starts from the clean animated pose and re-applies them once. */
function restorePose(o) {
  if (!o.tweaked) { o.tweaked = [o.neck, o.head, o.uaR, o.faR, o.faL].filter(Boolean); o.clean = o.tweaked.map((b) => b.quaternion.clone()); }
  o.tweaked.forEach((b, i) => b.quaternion.copy(o.clean[i]));
}
function savePose(o) { o.tweaked.forEach((b, i) => o.clean[i].copy(b.quaternion)); }
function aim(bone, child, dir, w) {
  bone.getWorldPosition(_a); child.getWorldPosition(_b); _b.sub(_a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(_b, dir);
  rotW(bone, _I.identity().slerp(q, w));
}

function mount(gltf, lite) {
  const root = gltf.scene;
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = !lite; o.receiveShadow = !lite; o.frustumCulled = false;
    if (lite) { const m = o.material; o.material = new THREE.MeshLambertMaterial({ map: m.map, alphaTest: m.alphaTest, side: m.side }); }
    else { if (o.material.map) o.material.map.anisotropy = 8; o.material.envMapIntensity = 0.7; }
  });
  const bones = {};
  root.traverse((o) => { if (o.name) bones[o.name] = o; });
  return { root, bones, mixer: new THREE.AnimationMixer(root) };
}
const B = (m, n) => m.bones[`Bip01_${n}`] || m.bones[`Bip01 ${n}`];

/* ---------- desks, chairs, bags: merged into a handful of meshes for the whole class ---------- */
function buildStatic(lite) {
  const g = new THREE.Group(), L = [];
  ROSTER.forEach((c) => {
    const X = c.x, Z = c.z;
    put(L, G.box(1.2, 0.04, 0.64, 0.016), "#b88a5c", [X, 0.67, Z], [0, 0, 0], [1, 1, 1], 0.55);
    [[-0.54, -0.25], [0.54, -0.25], [-0.54, 0.25], [0.54, 0.25]].forEach(([a, b]) => put(L, G.cyl(0.018, 0.018, 0.65, 10), "#2b2d31", [X + a, 0.325, Z + b], [0, 0, 0], [1, 1, 1], 0.45));
    put(L, G.box(1.08, 0.025, 0.025, 0.01), "#2b2d31", [X, 0.2, Z - 0.25], [0, 0, 0], [1, 1, 1], 0.45);
    const sz = Z + SEAT_Z;
    put(L, G.box(0.46, 0.055, 0.44, 0.022), "#3a3f47", [X, SEAT_Y - 0.03, sz], [0, 0, 0], [1, 1, 1], 0.8);
    put(L, G.box(0.44, 0.3, 0.04, 0.02), "#3a3f47", [X, SEAT_Y + 0.24, sz + 0.23], [-0.08, 0, 0], [1, 1, 1], 0.8);
    put(L, G.cyl(0.014, 0.014, 0.27, 8), "#2b2d31", [X, SEAT_Y + 0.04, sz + 0.21], [0, 0, 0], [1, 1, 1], 0.4);
    [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]].forEach(([a, b]) => put(L, G.cyl(0.013, 0.013, 0.43, 8), "#2b2d31", [X + a, 0.215, sz + b], [0, 0, 0], [1, 1, 1], 0.4));
    if (c.pack) {
      put(L, G.box(0.32, 0.4, 0.15, 0.06), c.packC, [X, SEAT_Y + 0.5, sz + 0.34], [0.05, 0, 0], [1, 1, 1], 0.88);
      put(L, G.box(0.22, 0.16, 0.05, 0.03), c.packC, [X, SEAT_Y + 0.42, sz + 0.43], [0.05, 0, 0], [1, 1, 1], 0.88);
    }
    if (c.writer) { put(L, G.box(0.22, 0.012, 0.3, 0.004), "#f2eee4", [X - 0.4, 0.696, Z + 0.02], [0, 0.12, 0], [1, 1, 1], 0.9); put(L, G.cyl(0.004, 0.004, 0.14, 6), "#1b1a17", [X - 0.36, 0.707, Z + 0.04], [0, 0, 1.4], [1, 1, 1], 0.5); }
    else if (c.i % 2) { put(L, G.cyl(0.036, 0.03, 0.09, 18), "#f6f2ea", [X - 0.42, 0.735, Z + 0.1], [0, 0, 0], [1, 1, 1], 0.6); put(L, G.cyl(0.039, 0.039, 0.016, 18), "#e8603c", [X - 0.42, 0.785, Z + 0.1], [0, 0, 0], [1, 1, 1], 0.6); }
    else { put(L, G.cap(0.032, 0.14), "#8ec5d6", [X - 0.44, 0.78, Z + 0.08], [0, 0, 0], [1, 1, 1], 0.4); put(L, G.cyl(0.03, 0.03, 0.03, 14), "#26262b", [X - 0.44, 0.875, Z + 0.08], [0, 0, 0], [1, 1, 1], 0.5); }
  });
  flush(L, g, true, true);
  if (!lite) {                 // scanned oak desks, woven chair pads, brushed steel frames
    const swap = { b88a5c: pbrMat("oak", 1, 0.55, { tint: [1.08, 1.02, 0.94], rot: Math.PI / 2 }), "3a3f47": fabricMat("#3f454e", 5), "2b2d31": STEEL() };
    g.children.forEach((m) => { const k = m.material.color.getHexString(); if (swap[k]) m.material = swap[k]; });
  }
  return g;
}

/* laptop + phone on each desk; their screens are driven by the story */
function buildDevices() {
  const root = new THREE.Group();
  const lap = new THREE.Group(); lap.position.set(0.0, 0.69, 0.02); root.add(lap);
  const LB = []; put(LB, G.box(0.35, 0.012, 0.24, 0.006), "#9ea3ab", [0, 0.006, 0.12], [0, 0, 0], [1, 1, 1], 0.4); flush(LB, lap);
  const lid = new THREE.Group(); lid.position.set(0, 0.012, 0); lid.rotation.x = -0.32; lap.add(lid);
  const LL = []; put(LL, G.box(0.35, 0.235, 0.01, 0.006), "#a9aeb6", [0, 0.1175, 0], [0, 0, 0], [1, 1, 1], 0.38); put(LL, G.sph(), "#e7e9ec", [0, 0.12, -0.007], [0, 0, 0], [0.026, 0.026, 0.004], 0.3); flush(LL, lid);
  const screenMat = new THREE.MeshStandardMaterial({ color: "#14181c", emissive: "#a8d6e4", emissiveIntensity: 0.12, roughness: 0.3 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.205), screenMat); screen.position.set(0, 0.1175, 0.0062); lid.add(screen);
  const phoneMat = new THREE.MeshStandardMaterial({ color: "#232327", emissive: "#8ec5d6", emissiveIntensity: 0, roughness: 0.35 });
  const phone = new THREE.Mesh(G.box(0.07, 0.008, 0.145, 0.004), phoneMat); phone.position.set(0.42, 0.694, 0.1); phone.rotation.y = -0.25; phone.castShadow = true; root.add(phone);
  return { root, screenMat, phoneMat };
}

const UP = new THREE.Vector3(), V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), HP = new THREE.Vector3();
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0);
const Q1 = new THREE.Quaternion(), Q2 = new THREE.Quaternion();

const ALUM = ALU();
function Cast({ story, tex, cast, onLoaded, lite }) {
  const { camera } = useThree();
  const stat = useMemo(() => buildStatic(lite), [lite]);
  const kids = useMemo(() => cast.kids || (cast.kids = ROSTER.map((c) => {
    const m = mount(cast.models[c.model], lite);
    const dev = buildDevices(); dev.root.position.set(c.x, 0, c.z);
    if (!lite) dev.root.traverse((o) => { if (o.isMesh && ["9ea3ab", "a9aeb6"].includes(o.material.color.getHexString())) o.material = ALUM; });
    const holder = new THREE.Group(); holder.position.set(c.x, FIT.y, c.z + SEAT_Z + FIT.z); holder.rotation.y = FIT.faceY; holder.add(m.root);
    const act = {};
    const pre = `${c.sex}_sit_table_`;
    [...BASE, ...ACTIONS, "idle_stretch_arms"].forEach((k) => { const cl = cast.clips[pre + k]; if (cl) act[k] = m.mixer.clipAction(cl); });
    const r = rng(c.seed + 3);
    Object.entries(act).forEach(([k, a]) => { if (BASE.includes(k)) a.setLoop(THREE.LoopPingPong, Infinity); else { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } });
    const first = act[BASE[c.i % 2]] || act.breathe_01; first.play(); first.time = r() * first.getClip().duration;
    const spr = (t) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); s.scale.set(0.001, 0.001, 1); s.renderOrder = 10; return s; };
    return { cfg: c, m, dev, holder, act, cur: first, r, next: 4 + r() * 10, yaw: 0, pitch: 0, wave: 0, q: spr(tex.q), ex: spr(tex.ex), typing: true,
      neck: B(m, "Neck"), head: B(m, "Head"), uaR: B(m, "R_UpperArm") || B(m, "R UpperArm"), faR: B(m, "R_Forearm") || B(m, "R Forearm"), hR: B(m, "R_Hand") || B(m, "R Hand"), faL: B(m, "L_Forearm") || B(m, "L Forearm") };
  })), [cast, tex]);   // built once: React may run this twice and an object can only live in one parent
  const prof = useMemo(() => cast.prof || (cast.prof = (() => {
    const m = mount(cast.models[PROF], lite);
    const holder = new THREE.Group(); holder.position.set(2.6, 0, -5.38); holder.add(m.root);
    const act = { idle: m.mixer.clipAction(cast.clips.m_idle_neutral_01), right: m.mixer.clipAction(cast.clips.m_gestic_presentation_right_01) };
    act.idle.setLoop(THREE.LoopPingPong, Infinity); act.right.setLoop(THREE.LoopPingPong, Infinity);
    const wk = Object.keys(cast.clips).find((k) => k.startsWith("m_walk"));
    if (wk) act.walk = m.mixer.clipAction(cast.clips[wk]);
    act.idle.play();
    return { m, holder, act, cur: act.idle, state: "write", x: 2.6, tx: 2.6, yaw: 0.25, next: 4, speed: 0, uaR: B(m, "R_UpperArm"), faR: B(m, "R_Forearm"), hR: B(m, "R_Hand"), head: B(m, "Head") };
  })()), [cast]);
  useEffect(() => { window.__cast = { kids, prof }; onLoaded && onLoaded(); }, [kids, prof, onLoaded]);

  const frameNo = useRef(0);
  const fade = (o, to, t = 0.6) => { if (!to || o.cur === to) return; to.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play(); o.cur.crossFadeTo(to, t, false); o.cur = to; };

  useFrame((state, dt) => {
    const p = story.cur, clock = state.clock.elapsedTime, d = Math.min(dt, 0.05), kk = 1 - Math.exp(-d * 6);
    const gl = trap(0.34, 0.41, 0.52, 0.58, p), att = sm(0.8, 0.9, p);
    const frame = (frameNo.current = frameNo.current + 1), every = story.animEvery || 1;
    kids.forEach((b, ki) => {
      b.acc = (b.acc || 0) + d;
      if ((frame + ki) % every) return;
      const step = Math.min(b.acc, 0.2); b.acc = 0;
      const c = b.cfg, t = clock + c.seed * 9;
      if (clock > b.next) {           // next routine: mostly working at the desk, sometimes a real gesture clip
        const doAct = b.r() < 0.45;
        const key = doAct ? (b.r() < 0.12 && b.act.idle_stretch_arms ? "idle_stretch_arms" : ACTIONS[Math.floor(b.r() * ACTIONS.length)]) : BASE[Math.floor(b.r() * 2)];
        const to = b.act[key] || b.act.breathe_01;
        if (to !== b.cur) fade(b, to);
        b.typing = !doAct;
        b.next = clock + (doAct ? Math.min(to.getClip().duration, 9) : 5 + b.r() * 7);
      }
      restorePose(b);
      b.m.mixer.update(step);
      savePose(b);
      b.m.root.updateMatrixWorld(true);

      // head: the base clip, plus looking down at the laptop / phone or up at the camera
      const work = (b.typing ? 1 : 0) * (1 - Math.max(gl, att));
      let yaw = Math.sin(t * 0.35) * 0.06, pitch = -0.2 * work - 0.5 * gl;
      yaw += gl * Math.sin(t * 2.2) * 0.2;
      if (att > 0.001) {
        b.head.getWorldPosition(HP); V1.copy(camera.position).sub(HP);
        const ty = clamp(Math.atan2(-V1.x, -V1.z), -1.0, 1.0), tp = clamp(Math.atan2(V1.y, Math.hypot(V1.x, V1.z)), -0.15, 0.6);
        yaw = yaw * (1 - att) + ty * att; pitch = pitch * (1 - att) + tp * att;
      }
      b.yaw += (yaw - b.yaw) * kk; b.pitch += (pitch - b.pitch) * kk;
      Q1.setFromAxisAngle(AY, b.yaw * 0.4).multiply(Q2.setFromAxisAngle(AX, b.pitch * 0.4)); rotW(b.neck, Q1);
      Q1.setFromAxisAngle(AY, b.yaw * 0.6).multiply(Q2.setFromAxisAngle(AX, b.pitch * 0.6)); rotW(b.head, Q1);

      // hands moving on the keyboard / notebook while working
      if (work > 0.01) {
        Q1.setFromAxisAngle(AX, Math.sin(t * (c.writer ? 6 : 10)) * 0.035 * work); rotW(b.faR, Q1);
        Q1.setFromAxisAngle(AX, Math.sin(t * 9 + 1) * (c.writer ? 0.008 : 0.03) * work); rotW(b.faL, Q1);
      }

      // the right students put a hand up
      const wv = c.relevant ? sm(0.84 + c.col * 0.006, 0.9 + c.col * 0.006, p) : 0;
      if (wv > 0.001) {
        aim(b.uaR, b.faR, UP.set(0.22, 0.92, -0.32).normalize(), wv);
        aim(b.faR, b.hR, V2.set(0.18 + Math.sin(t * 7) * 0.3, 0.92, -0.1).normalize(), wv);
      }

      // screens and phone
      const buzz = gl * (0.5 + Math.sin(t * 20) * 0.3);
      const lit = trap(0.7 + c.row * 0.018 + c.col * 0.008, 0.76 + c.row * 0.018 + c.col * 0.008, 0.9, 0.96, p);
      const keep = c.relevant ? sm(0.8, 0.86, p) : 0;
      b.dev.phoneMat.emissiveIntensity = clamp(buzz + lit * 1.3 + keep * 1.1, 0, 1.6);
      b.dev.phoneMat.emissive.set(c.relevant && p > 0.8 ? "#f3b63f" : "#8ec5d6");
      b.dev.screenMat.emissiveIntensity = 0.18 + gl * 0.12 + lit * 0.5 + keep * 0.35 + work * (0.05 + Math.sin(t * 3) * 0.03);
      b.dev.screenMat.emissive.set(c.relevant && p > 0.8 ? "#f3b63f" : "#a8d6e4");

      // bubbles float above the head
      b.head.getWorldPosition(HP);
      const vq = gl * 0.3 * (1 + Math.sin(t * 5) * 0.04), vx = keep * sm(0.86, 0.92, p) * 0.27;
      b.q.scale.set(vq, vq, 1); b.q.position.set(HP.x + 0.05, HP.y + 0.32 + Math.sin(t * 3) * 0.01, HP.z);
      b.ex.scale.set(vx, vx, 1); b.ex.position.set(HP.x, HP.y + 0.34 + Math.sin(t * 4) * 0.01, HP.z);
    });

    /* ---- the professor: writes, walks along the board, writes again; presents to the class later on ---- */
    const ps = prof, turn = sm(0.66, 0.78, p), writing = 1 - turn;
    if (turn < 0.02 && clock > ps.next && ps.state === "write") {
      ps.state = "walk"; ps.tx = 0.8 + Math.random() * 2.9 - (Math.random() < 0.3 ? 2 : 0);
      if (Math.abs(ps.tx - ps.x) < 0.8) ps.tx = ps.x + (ps.x > 2 ? -1.6 : 1.6);
      if (ps.act.walk) fade(ps, ps.act.walk, 0.35);
    }
    let sp = 0;
    if (ps.state === "walk") {
      const dx = ps.tx - ps.x; sp = Math.min(0.85, Math.abs(dx) * 1.4 + 0.1); ps.x += Math.sign(dx) * sp * d;
      if (Math.abs(dx) < 0.04) { ps.state = "write"; ps.next = clock + 4 + Math.random() * 6; fade(ps, ps.act.idle, 0.4); }
    }
    if (turn > 0.5 && ps.cur !== ps.act.right) { ps.state = "write"; fade(ps, ps.act.right, 0.7); }
    if (turn < 0.5 && ps.cur === ps.act.right) fade(ps, ps.act.idle, 0.7);
    restorePose(ps);
    ps.m.mixer.update(d);
    savePose(ps);
    const walkYaw = ps.state === "walk" ? -Math.sign(ps.tx - ps.x) * 1.45 : 0.2;
    ps.yaw += (walkYaw - ps.yaw) * (1 - Math.exp(-d * 5));
    ps.holder.position.x = ps.x;
    ps.holder.rotation.y = FIT.faceY + ps.yaw * writing + turn * Math.PI;
    ps.m.root.updateMatrixWorld(true);
    if (ps.state === "write" && writing > 0.01) {        // right arm up at the board
      Q1.copy(ps.holder.quaternion);
      aim(ps.uaR, ps.faR, UP.set(0.3, 0.2, -0.93).normalize(), writing);
      aim(ps.faR, ps.hR, V2.set(0.18 + Math.sin(clock * 3) * 0.3, 0.55 + Math.sin(clock * 7) * 0.08, -0.8).normalize(), writing);
    }
  });

  return (
    <group>
      <primitive object={stat} />
      {lite && <ContactShadows />}
      {kids.map((b, i) => <group key={i}><primitive object={b.holder} /><primitive object={b.dev.root} /><primitive object={b.q} /><primitive object={b.ex} /></group>)}
      <primitive object={prof.holder} />
    </group>
  );
}

/* no real-time shadows on low-end devices: a soft dark patch under each desk keeps people grounded */
function ContactShadows() {
  const tex = useMemo(() => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d"), r = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    r.addColorStop(0, "rgba(40,24,12,0.42)"); r.addColorStop(1, "rgba(40,24,12,0)");
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
  return ROSTER.map((c) => (
    <mesh key={c.i} position={[c.x, 0.012, c.z + 0.2]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[1.9, 1.9]} /><meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  ));
}

export function Classroom({ story, tex, onLoaded, lite }) {
  const [cast, setCast] = useState(null);
  useEffect(() => { let live = true; loadCast(lite).then((c) => { if (live) setCast(c); }); return () => { live = false; }; }, [lite]);
  return cast ? <Cast story={story} tex={tex} cast={cast} onLoaded={onLoaded} lite={lite} /> : null;
}

const rng = (seed) => { let x = Math.floor(seed * 9973) % 2147483647 || 7; return () => ((x = (x * 16807) % 2147483647) / 2147483647); };

export function useBubbleTextures() {
  return useMemo(() => ({ q: bubbleTexture("...", "#ffffff"), ex: bubbleTexture("bell", "#e8603c") }), []);
}
