// Procedural canvas textures (no image files, so the single-file build stays self-contained).
import * as THREE from "three";

function canvas(w, h, draw) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const rnd = (() => { let a = 1234567; return () => ((a = (a * 16807) % 2147483647) / 2147483647); })();

export function steel(kind = "booster") {
  return canvas(512, 1024, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, "#9aa0a8"); grd.addColorStop(0.25, "#d9dde2"); grd.addColorStop(0.5, "#b8bdc4"); grd.addColorStop(0.75, "#e3e6ea"); grd.addColorStop(1, "#9aa0a8");
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    // weld rings and stringers
    g.strokeStyle = "rgba(60,64,70,.35)"; g.lineWidth = 2;
    for (let y = 0; y < h; y += 46) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = "rgba(255,255,255,.12)";
    for (let x = 0; x < w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    // brushed noise
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? "255,255,255" : "40,40,40"},${rnd() * 0.05})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 6, 1); }
    if (kind === "booster") {
      // soot toward the engines (bottom of the texture = engine end)
      const s = g.createLinearGradient(0, h, 0, h * 0.55); s.addColorStop(0, "rgba(25,22,20,.85)"); s.addColorStop(0.35, "rgba(40,34,30,.35)"); s.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = s; g.fillRect(0, 0, w, h);
      // frost band (cryo propellant) mid-tank
      const f = g.createLinearGradient(0, h * 0.62, 0, h * 0.8); f.addColorStop(0, "rgba(255,255,255,0)"); f.addColorStop(0.5, "rgba(240,246,255,.35)"); f.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = f; g.fillRect(0, 0, w, h);
    } else {
      // heat-shield tiles on the belly half (u in [0.5,1])
      const tile = 18;
      for (let y = 0; y < h; y += tile * 0.86) for (let x = w * 0.5 + ((y / (tile * 0.86)) % 2) * tile * 0.5; x < w; x += tile) {
        g.fillStyle = `rgb(${20 + rnd() * 14},${20 + rnd() * 14},${24 + rnd() * 14})`;
        g.beginPath(); for (let k = 0; k < 6; k++) { const a = (k / 6) * 6.283 + 0.52; g.lineTo(x + Math.cos(a) * tile * 0.5, y + Math.sin(a) * tile * 0.5); } g.fill();
      }
    }
  });
}

export function gridFin() {
  return canvas(128, 128, (g, w, h) => {
    g.fillStyle = "#3b3f45"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#8a9099"; g.lineWidth = 3;
    for (let i = -w; i < w * 2; i += 14) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
    g.strokeStyle = "#1c1f23"; g.lineWidth = 8; g.strokeRect(0, 0, w, h);
  });
}

export function plume() {
  return canvas(64, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.08, "rgba(170,200,255,.95)"); grd.addColorStop(0.3, "rgba(255,170,90,.75)");
    grd.addColorStop(0.65, "rgba(255,110,40,.3)"); grd.addColorStop(1, "rgba(255,80,20,0)");
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    // soft horizontal falloff
    const img = g.getImageData(0, 0, w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const u = Math.abs(x / (w - 1) - 0.5) * 2; img.data[(y * w + x) * 4 + 3] *= Math.max(0, 1 - u * u); }
    g.putImageData(img, 0, 0);
  });
}

export function soft(color = "255,255,255", inner = 0.0) {
  return canvas(128, 128, (g, w) => {
    const grd = g.createRadialGradient(w / 2, w / 2, w * inner, w / 2, w / 2, w / 2);
    grd.addColorStop(0, `rgba(${color},1)`); grd.addColorStop(0.4, `rgba(${color},.55)`); grd.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = grd; g.fillRect(0, 0, w, w);
  });
}

export function cloud() {
  return canvas(256, 128, (g, w, h) => {
    for (let i = 0; i < 26; i++) {
      const x = w * (0.2 + rnd() * 0.6), y = h * (0.45 + (rnd() - 0.5) * 0.35), r = 18 + rnd() * 34;
      const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, "rgba(255,255,255,.55)"); grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    }
  });
}

export function ground() {
  const t = canvas(512, 512, (g, w, h) => {
    g.fillStyle = "#c8b48e"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 16000; i++) { const v = 150 + rnd() * 70; g.fillStyle = `rgba(${v},${v * 0.88},${v * 0.66},.25)`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(110,120,80,${0.05 + rnd() * 0.08})`; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 6 + rnd() * 30, 3 + rnd() * 12, rnd() * 3, 0, 6.283); g.fill(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export function concrete() {
  const t = canvas(256, 256, (g, w, h) => {
    g.fillStyle = "#a9a7a2"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) { const v = 130 + rnd() * 70; g.fillStyle = `rgba(${v},${v},${v - 5},.25)`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
    g.strokeStyle = "rgba(60,60,60,.35)"; g.lineWidth = 2; for (let x = 0; x <= w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); g.beginPath(); g.moveTo(0, x); g.lineTo(w, x); g.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export function waterNormal() {
  const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
  const img = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const a = Math.sin((x / 256) * 6.283 * 3 + Math.sin((y / 256) * 6.283 * 2) * 1.5) + Math.sin((y / 256) * 6.283 * 5 + (x / 256) * 6.283);
    const b = Math.cos((y / 256) * 6.283 * 4 + Math.sin((x / 256) * 6.283 * 3)) + Math.cos((x / 256) * 6.283 * 7);
    const i = (y * 256 + x) * 4; img.data[i] = 128 + a * 28; img.data[i + 1] = 128 + b * 28; img.data[i + 2] = 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export function sky() {
  return canvas(16, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, "#0d2a5c"); grd.addColorStop(0.45, "#3f79c2"); grd.addColorStop(0.72, "#9cc4ea"); grd.addColorStop(0.86, "#f3d7b5"); grd.addColorStop(1, "#f6c99a");
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
  });
}
