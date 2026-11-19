import * as THREE from "three";

// Clay look: soft, matte, slightly waxy. Materials are shared by colour.
const cache = new Map();
export function clay(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!cache.has(k)) cache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.84, metalness: 0, ...o }));
  return cache.get(k);
}

export const PALETTE = {
  cream: "#f6efe0", plaster: "#efe2cb", wainscot: "#d9714f", board: "#1d3b33", boardDeep: "#142a24",
  wood: "#b98a5e", woodDark: "#8a6140", terracotta: "#e8603c", mustard: "#f3b63f", sky: "#8ec5d6", ink: "#1b1a17",
  skin: ["#f2c9a5", "#d9a27a", "#a8704c", "#7a4a30"],
  shirt: ["#e8603c", "#f3b63f", "#8ec5d6", "#7fb48a", "#c58ad1", "#f2efe6"],
  hair: ["#2a1d17", "#4a2e1f", "#1d1a1a", "#8a5a2b", "#c9893a", "#6b3b4a"],
};
