import * as THREE from "three";

/* Photo-scanned CC0 materials from Poly Haven (compressed in /public/textures). Good devices only. */
const NAMES = { floor: "wood_floor", walnut: "walnut_veneer", oak: "oak_veneer_01", plaster: "painted_plaster_wall" };
let store = null, pending = null;

export function loadPBR() {
  if (pending) return pending;
  const L = new THREE.TextureLoader();
  const one = async (key) => {
    const n = NAMES[key];
    const [map, normalMap, roughnessMap] = await Promise.all(["diff", "nor", "rough"].map((t) => L.loadAsync(`/textures/${n}_${t}.webp`)));
    map.colorSpace = THREE.SRGBColorSpace;
    return [key, { map, normalMap, roughnessMap }];
  };
  pending = Promise.all(Object.keys(NAMES).map(one)).then((r) => { store = Object.fromEntries(r); return store; }).catch(() => null);
  return pending;
}

const rep = (t, x, y, rot = 0) => { const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(x, y); c.rotation = rot; c.anisotropy = 16; c.needsUpdate = true; return c; };

/* tint is an [r, g, b] multiplier so the neutral scans can be warmed or lightened */
export function pbrMat(key, rx, ry, { tint = [1, 1, 1], normal = 1, rough = 1, rot = 0, metal = 0 } = {}) {
  const s = store && store[key];
  if (!s) return new THREE.MeshStandardMaterial({ color: "#cdb89a", roughness: 0.8 });
  return new THREE.MeshStandardMaterial({
    map: rep(s.map, rx, ry, rot), normalMap: rep(s.normalMap, rx, ry, rot), roughnessMap: rep(s.roughnessMap, rx, ry, rot),
    color: new THREE.Color(tint[0], tint[1], tint[2]), roughness: rough, metalness: metal, normalScale: new THREE.Vector2(normal, normal),
  });
}

/* woven fabric: generated bump so felt panels and chair pads read as cloth */
let weave = null;
function weaveTex() {
  if (weave) return weave;
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d"), id = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const a = Math.sin((x / 256) * Math.PI * 64) * ((y >> 2) % 2 ? 1 : -1), b = Math.sin((y / 256) * Math.PI * 64) * ((x >> 2) % 2 ? -1 : 1);
    const v = 128 + (a + b) * 42 + (Math.random() - 0.5) * 46, i = (y * 256 + x) * 4;
    id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  weave = new THREE.CanvasTexture(c); weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
  return weave;
}
export function fabricMat(color, r = 6) {
  const t = weaveTex().clone(); t.repeat.set(r, r); t.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ color, roughness: 0.95, bumpMap: t, bumpScale: 0.6 });
}

export const ALU = () => new THREE.MeshStandardMaterial({ color: "#b9bdc4", metalness: 0.85, roughness: 0.34 });
export const STEEL = () => new THREE.MeshStandardMaterial({ color: "#3b3e44", metalness: 0.8, roughness: 0.42 });
export const BRASS = () => new THREE.MeshStandardMaterial({ color: "#b48a4a", metalness: 0.9, roughness: 0.32 });
