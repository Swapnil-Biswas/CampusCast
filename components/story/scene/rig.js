"use client";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";

// Camera keyframes along the story: [progress, x, y, z, yaw, pitch, fov]
export const KEYS = [
  [0.00, -2.4, 2.4, 11.0, 0.05, -0.04, 36],
  [0.10, -1.6, 2.2, 9.0, 0.03, -0.03, 36],
  [0.20, -0.2, 2.0, 6.6, 0.0, -0.01, 38],
  [0.30, 0.0, 1.75, 4.4, 0.0, 0.02, 40],
  [0.40, 0.6, 1.8, 3.0, -0.5, 0.0, 40],
  [0.50, 1.2, 1.85, 2.4, -1.45, 0.02, 42],
  [0.60, 0.3, 1.95, 1.2, -0.2, 0.0, 40],
  [0.70, 0.0, 2.1, -0.6, 0.0, 0.0, 36],
  [0.78, 0.0, 2.2, -0.9, 0.0, 0.0, 36],
  [0.88, 0.0, 2.9, -3.8, Math.PI, -0.22, 44],
  [0.95, 0.0, 4.6, -2.4, Math.PI, -0.5, 44],
  [1.00, 0.0, 26.0, -7.5, Math.PI, -1.2, 38],
];

// Portrait phones get their own shots: centred, higher up, so the whole class fits a narrow screen.
export const KEYS_PORTRAIT = [
  [0.00, 0.0, 3.7, 11.6, 0.0, -0.2, 60],
  [0.10, 0.0, 3.3, 9.8, 0.0, -0.18, 60],
  [0.20, 0.0, 2.7, 7.6, 0.0, -0.12, 60],
  [0.30, 0.0, 2.2, 5.2, 0.0, -0.05, 60],
  [0.40, 0.4, 1.95, 3.2, -0.6, 0.0, 58],
  [0.50, 0.0, 1.95, 2.8, -1.5, 0.03, 58],
  [0.60, -0.8, 2.1, 1.6, -0.2, 0.0, 58],
  [0.70, -2.0, 2.25, -0.2, 0.0, 0.0, 60],
  [0.78, -2.0, 2.25, -0.4, 0.0, 0.0, 60],
  [0.88, 0.0, 4.5, -3.9, Math.PI, -0.5, 60],
  [0.95, 0.0, 5.2, -4.4, Math.PI, -0.56, 60],
  [1.00, 0.0, 36.0, -7.5, Math.PI, -1.25, 38],
];

// monotone cubic interpolation per channel: smooth, but never overshoots a keyframe
function tangents(ps, vs) {
  const n = ps.length, d = [], m = new Array(n);
  for (let k = 0; k < n - 1; k++) d.push((vs[k + 1] - vs[k]) / (ps[k + 1] - ps[k]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let k = 1; k < n - 1; k++) {
    if (d[k - 1] * d[k] <= 0) m[k] = 0;
    else { m[k] = (d[k - 1] + d[k]) / 2; const lim = 3 * Math.min(Math.abs(d[k - 1]), Math.abs(d[k])); m[k] = Math.sign(m[k]) * Math.min(Math.abs(m[k]), lim); }
  }
  return m;
}
const channels = (K) => [1, 2, 3, 4, 5, 6].map((c) => {
  const ps = K.map((k) => k[0]), vs = K.map((k) => k[c]);
  return { ps, vs, m: tangents(ps, vs) };
});
const CH = channels(KEYS), CH_P = channels(KEYS_PORTRAIT);
function sample(ch, p) {
  const { ps, vs, m } = ch; let k = 0;
  while (k < ps.length - 2 && p > ps[k + 1]) k++;
  const h = ps[k + 1] - ps[k], t = Math.min(1, Math.max(0, (p - ps[k]) / h)), t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * vs[k] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * vs[k + 1] + (t3 - t2) * h * m[k + 1];
}

const eu = new THREE.Euler(0, 0, 0, "YXZ");
export function CameraRig({ story }) {
  const { camera, invalidate } = useThree();
  useFrame((state, dt) => {
    const k = 1 - Math.exp(-Math.min(dt, 0.05) * 5.5);
    story.cur += (story.p - story.cur) * k;
    if (Math.abs(story.p - story.cur) < 0.0002) story.cur = story.p;
    const p = Math.min(1, Math.max(0, story.cur)), t = state.clock.elapsedTime;
    const aspect = state.size.width / state.size.height, portrait = aspect < 0.85;
    let [x, y, z, yaw, pitch, fov0] = (portrait ? CH_P : CH).map((c) => sample(c, p));
    // on phones the copy sits at the bottom, so push the picture up into the free space above it
    const vk = portrait ? `${state.size.width}x${state.size.height}` : "";
    if (story.vk !== vk) {
      story.vk = vk;
      if (portrait) camera.setViewOffset(state.size.width, state.size.height, 0, state.size.height * 0.2, state.size.width, state.size.height); else camera.clearViewOffset();
    }
    if (story.cam) [x, y, z, yaw, pitch, fov0] = story.cam;   // debug: free camera
    const fov = (fov0 + (story.intro || 0) * 8) * (!portrait && aspect < 1 ? Math.pow(1 / aspect, 0.7) : 1);   // keep the room in frame on portrait screens
    const io = story.intro || 0;
    camera.position.set(x + Math.sin(t * 0.3) * 0.04 + io * 2.4, y + Math.sin(t * 0.37) * 0.025 + io * 2.0, z + io * 1.1);
    eu.set(pitch - io * 0.2 + Math.sin(t * 0.41) * 0.003, yaw + Math.sin(t * 0.27) * 0.004, 0);
    camera.quaternion.setFromEuler(eu);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  });
  return null;
}
