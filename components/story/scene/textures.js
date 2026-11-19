import * as THREE from "three";

const tex = (c, rep) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
};
const canvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; };
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

export function floorTexture() {
  const [c, g] = canvas(1024, 1024);
  const cols = ["#d6b48a", "#cda97c", "#dbbb92", "#c9a475", "#d2ae82"];
  const n = 8, h = 1024 / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[i % cols.length]; g.fillRect(0, i * h, 1024, h);
    for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(110,72,40,${0.025 + rnd() * 0.05})`; g.fillRect(rnd() * 1024, i * h + rnd() * h, 80 + rnd() * 300, 1 + rnd() * 2.4); }
    g.fillStyle = "rgba(70,44,24,0.45)"; g.fillRect(0, i * h, 1024, 2.5);
    const off = (i % 2) * 512 + rnd() * 120; g.fillRect(off, i * h, 2.5, h);
  }
  return tex(c, [3, 5]);
}

export function slatTexture() {
  const [c, g] = canvas(1024, 256);
  const n = 48, w = 1024 / n;
  for (let i = 0; i < n; i++) {
    const t = 0.5 + rnd() * 0.5;
    g.fillStyle = `rgb(${Math.round(120 * t + 40)},${Math.round(80 * t + 28)},${Math.round(52 * t + 18)})`; g.fillRect(i * w, 0, w - 3, 256);
    g.fillStyle = "rgba(30,18,10,0.55)"; g.fillRect(i * w + w - 3, 0, 3, 256);
    g.fillStyle = "rgba(255,255,255,0.07)"; g.fillRect(i * w, 0, 2, 256);
  }
  return tex(c);
}

export function slideTexture(font) {
  const [c, g] = canvas(1536, 640);
  g.fillStyle = "#f4f1ea"; g.fillRect(0, 0, 1536, 640);
  g.fillStyle = "#1d3b33"; g.fillRect(0, 0, 40, 640);
  g.fillStyle = "#1b1a17"; g.font = `800 120px ${font}`; g.textBaseline = "middle"; g.fillText("CS301 · Databases", 120, 220);
  g.fillStyle = "#e8603c"; g.font = `700 64px ${font}`; g.fillText("Semester 5 · Unit 3", 120, 360);
  g.fillStyle = "#6b6a66"; g.font = `500 46px ${font}`; g.fillText("Normalization, keys and dependencies", 120, 460);
  g.fillStyle = "#f3b63f"; g.beginPath(); g.roundRect(120, 520, 260, 60, 30); g.fill(); g.fillStyle = "#1b1a17"; g.font = `800 34px ${font}`; g.textAlign = "center"; g.fillText("EXAM TUE", 250, 551);
  return tex(c);
}

export function artTexture(kind) {
  const [c, g] = canvas(256, 340);
  g.fillStyle = "#f2ece0"; g.fillRect(0, 0, 256, 340);
  const cols = ["#e8603c", "#f3b63f", "#8ec5d6", "#7fb48a", "#1d3b33"];
  if (kind === 0) { g.fillStyle = cols[4]; g.beginPath(); g.arc(128, 150, 90, 0, 7); g.fill(); g.fillStyle = cols[0]; g.beginPath(); g.arc(128, 150, 50, Math.PI, 0); g.fill(); g.fillStyle = cols[1]; g.fillRect(40, 270, 176, 22); }
  else { g.fillStyle = cols[2]; g.fillRect(30, 40, 90, 260); g.fillStyle = cols[1]; g.fillRect(130, 40, 96, 120); g.fillStyle = cols[3]; g.beginPath(); g.arc(178, 232, 52, 0, 7); g.fill(); g.fillStyle = cols[0]; g.fillRect(130, 170, 40, 12); }
  g.strokeStyle = "#1b1a17"; g.lineWidth = 8; g.strokeRect(4, 4, 248, 332);
  return tex(c);
}

export function corkTexture() {
  const [c, g] = canvas(1024, 512);
  g.fillStyle = "#c79a68"; g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${90 + rnd() * 70},${55 + rnd() * 40},${25 + rnd() * 25},${0.18 + rnd() * 0.3})`; g.beginPath(); g.arc(rnd() * 1024, rnd() * 512, 1 + rnd() * 3.2, 0, 7); g.fill(); }
  return tex(c);
}

export function boardTexture(font, s = 1) {
  const [c, g] = canvas(2048 * s, 720 * s);
  g.scale(s, s);
  const gr = g.createLinearGradient(0, 0, 2048, 720);
  gr.addColorStop(0, "#27493f"); gr.addColorStop(0.55, "#1d3b33"); gr.addColorStop(1, "#183029");
  g.fillStyle = gr; g.fillRect(0, 0, 2048, 720);
  // chalk dust smears
  for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(255,255,255,${0.012 + rnd() * 0.03})`; g.beginPath(); g.ellipse(rnd() * 2048, rnd() * 720, 120 + rnd() * 380, 12 + rnd() * 50, rnd() * 0.5 - 0.25, 0, 7); g.fill(); }
  g.fillStyle = "#f7f2e4"; g.textAlign = "left"; g.textBaseline = "middle";
  g.font = `700 120px ${font}`; g.shadowColor = "rgba(255,255,255,0.35)"; g.shadowBlur = 5;
  g.fillText("Unit 3: Normalization", 150, 150);
  g.shadowBlur = 0; g.fillStyle = "#f3b63f"; g.font = `500 70px ${font}`;
  g.fillText("1NF  →  2NF  →  3NF", 150, 290);
  g.fillStyle = "rgba(247,242,228,0.85)"; g.font = `500 52px ${font}`;
  g.fillText("Remove repeating groups", 150, 410); g.fillText("Remove partial dependencies", 150, 500); g.fillText("Remove transitive dependencies", 150, 590);
  g.strokeStyle = "rgba(247,242,228,0.75)"; g.lineWidth = 6; g.lineCap = "round";
  g.strokeRect(1420, 120, 220, 150); g.strokeRect(1720, 120, 220, 150); g.beginPath(); g.moveTo(1640, 195); g.lineTo(1720, 195); g.moveTo(1700, 175); g.lineTo(1720, 195); g.lineTo(1700, 215); g.stroke();
  g.strokeRect(1560, 400, 240, 150); g.beginPath(); g.moveTo(1530, 270); g.lineTo(1650, 400); g.moveTo(1830, 270); g.lineTo(1700, 400); g.stroke();
  if (s > 1) {           // chalk is broken and dusty: fleck the strokes with board colour, and dust the slate
    for (let i = 0; i < 26000; i++) { g.fillStyle = "rgba(29,59,51,0.55)"; g.fillRect(rnd() * 2048, rnd() * 720, 0.6 + rnd() * 1.4, 0.5 + rnd() * 1); }
    for (let i = 0; i < 9000; i++) { g.fillStyle = "rgba(255,255,255,0.05)"; g.fillRect(rnd() * 2048, rnd() * 720, 0.8, 0.8); }
  }
  const t = tex(c); return t;
}

// the UI that appears on the board once CampusCast takes over
export function feedTexture(font, s = 1) {
  const [c, g] = canvas(2048 * s, 720 * s);
  g.scale(s, s);
  g.fillStyle = "#101f1b"; g.fillRect(0, 0, 2048, 720);
  const rows = [["NOW", "#e8603c", "Exam rescheduled", 0.9], ["TODAY", "#f3b63f", "Hackathon closes tonight", 0.72], ["SOON", "#8ec5d6", "Docker workshop · 40 seats", 0.58], ["SOON", "#7fb48a", "Club auditions Friday", 0.46], ["FYI", "#c58ad1", "Music night poster", 0.34]];
  g.font = `700 44px ${font}`; g.textBaseline = "middle";
  rows.forEach(([p, col, t, w], i) => {
    const y = 90 + i * 118;
    g.fillStyle = "rgba(255,255,255,0.06)"; g.beginPath(); g.roundRect(150, y, 1748, 92, 26); g.fill();
    g.fillStyle = col; g.beginPath(); g.roundRect(176, y + 20, 170, 52, 26); g.fill();
    g.fillStyle = "#101f1b"; g.textAlign = "center"; g.font = `800 34px ${font}`; g.fillText(p, 261, y + 47);
    g.font = `700 44px ${font}`; g.fillStyle = "#f7f2e4"; g.textAlign = "left"; g.fillText(t, 382, y + 47);
    g.fillStyle = "rgba(255,255,255,0.12)"; g.beginPath(); g.roundRect(1330, y + 38, 480, 16, 8); g.fill();
    g.fillStyle = col; g.beginPath(); g.roundRect(1330, y + 38, 480 * w, 16, 8); g.fill();
  });
  return tex(c);
}

export function noteTextures(font, mono) {
  const defs = [["#ffb8c6", "NOW", "Exam moved to Tue"], ["#ffe566", "TODAY", "Hackathon closes tonight"], ["#a9d4ff", "SOON", "Docker · 40 seats"], ["#b6e89a", "CLUB", "Auditions Friday"],
    ["#ffc074", "DEPT", "Fee deadline extended"], ["#d3c2ff", "XCHG", "Selling: Maths books"], ["#ffe566", "FEST", "Dance crew call"], ["#ffb8c6", "LAB", "Lab shifted to B-204"]];
  return defs.map(([col, tag, text]) => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = col; g.fillRect(0, 0, 256, 256);
    g.fillStyle = "rgba(0,0,0,0.1)"; g.fillRect(0, 0, 256, 26);
    g.fillStyle = "#1b1a17"; g.font = `500 24px ${mono}`; g.fillText(tag, 16, 62);
    g.font = `800 38px ${font}`; g.textBaseline = "alphabetic";
    const words = text.toUpperCase().split(" "); let line = "", y = 110;
    words.forEach((w) => { const t = line ? line + " " + w : w; if (g.measureText(t).width > 224 && line) { g.fillText(line, 16, y); y += 42; line = w; } else line = t; });
    g.fillText(line, 16, y);
    g.strokeStyle = "#1b1a17"; g.lineWidth = 10; g.strokeRect(0, 0, 256, 256);
    return tex(c);
  });
}

export function bubbleTexture(kind, color) {
  const [c, g] = canvas(256, 256);
  g.shadowColor = "rgba(0,0,0,0.25)"; g.shadowBlur = 14; g.shadowOffsetY = 6;
  g.fillStyle = color;
  if (kind === "bell") {
    g.beginPath(); g.arc(128, 120, 84, 0, 7); g.fill();
    g.shadowColor = "transparent"; g.fillStyle = "#ffffff"; g.strokeStyle = "#ffffff"; g.lineWidth = 9; g.lineJoin = "round"; g.lineCap = "round";
    g.beginPath(); g.moveTo(84, 150); g.quadraticCurveTo(96, 140, 96, 108); g.bezierCurveTo(96, 78, 112, 70, 128, 70); g.bezierCurveTo(144, 70, 160, 78, 160, 108); g.quadraticCurveTo(160, 140, 172, 150); g.closePath(); g.fill();
    g.beginPath(); g.arc(128, 166, 12, 0, Math.PI); g.fill(); g.beginPath(); g.moveTo(128, 62); g.lineTo(128, 70); g.stroke();
  } else {
    g.beginPath(); g.roundRect(34, 70, 188, 100, 50); g.fill();
    g.beginPath(); g.moveTo(70, 160); g.lineTo(62, 196); g.lineTo(104, 166); g.closePath(); g.fill();
    g.shadowColor = "transparent"; g.fillStyle = "#6b6a66";
    [86, 128, 170].forEach((x) => { g.beginPath(); g.arc(x, 120, 12, 0, 7); g.fill(); });
  }
  return tex(c);
}

export function posterTexture(kind) {
  const [c, g] = canvas(256, 340);
  g.fillStyle = "#f6efe0"; g.fillRect(0, 0, 256, 340);
  if (kind === "map") {
    g.fillStyle = "#8ec5d6"; g.fillRect(14, 14, 228, 312);
    const blobs = [[70, 90, 50], [140, 130, 38], [190, 70, 34], [90, 200, 46], [180, 230, 40]];
    g.fillStyle = "#7fb48a"; blobs.forEach(([x, y, r]) => { g.beginPath(); g.ellipse(x, y, r, r * 0.7, 0.4, 0, 7); g.fill(); });
  } else {
    g.fillStyle = "#e8603c"; g.fillRect(14, 14, 228, 312);
    g.fillStyle = "#f6efe0"; g.font = "800 110px sans-serif"; g.textAlign = "center"; g.fillText("A", 80, 140); g.fillStyle = "#f3b63f"; g.fillText("B", 176, 140); g.fillStyle = "#8ec5d6"; g.fillText("C", 80, 270); g.fillStyle = "#f6efe0"; g.fillText("D", 176, 270);
  }
  g.strokeStyle = "#1b1a17"; g.lineWidth = 8; g.strokeRect(4, 4, 248, 332);
  return tex(c);
}
