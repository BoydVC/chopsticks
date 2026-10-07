// Chopsticks: game shell (state machine, input, cameras, replay, HUD, leaderboard).
import * as THREE from "three";
import { createSim, step, autopilot, points, refHeight, refX, TOWER, MODES, dailySeed, runEpisode, burnCue } from "./sim.js";
import { buildWorld, buildVehicle, poseVehicle } from "./scene.js";
import { soft } from "./textures.js";
import { Sound } from "./audio.js";

const $ = (id) => document.getElementById(id);
const DT = 1 / 120, DEG = 180 / Math.PI;
const Q = new URLSearchParams(location.search);
const sound = new Sound();

// ---------- renderer / world ----------
const canvas = $("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: Q.has("capture") });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const W = buildWorld(renderer);
const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 30000);
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();
const vehicles = { booster: buildVehicle("booster"), ship: buildVehicle("ship") };
W.scene.add(vehicles.booster.group, vehicles.ship.group);

// effects: smoke/dust particles + explosion + splash
const fx = new THREE.Group(); W.scene.add(fx);
const smokeTex = soft("235,230,222"), fireTex = soft("255,170,70");
const particles = [];
function puff(pos, vel, { size = 10, grow = 18, life = 3, tex = smokeTex, add = false, opacity = 0.5 } = {}) {
  if (particles.length > 420) return;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
  sp.position.copy(pos); sp.scale.setScalar(size); fx.add(sp);
  particles.push({ sp, vel: vel.clone(), size, grow, life, age: 0, opacity });
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.age += dt;
    if (p.age >= p.life) { fx.remove(p.sp); p.sp.material.dispose(); particles.splice(i, 1); continue; }
    p.sp.position.addScaledVector(p.vel, dt); p.vel.multiplyScalar(1 - 0.6 * dt); p.vel.y += 1.5 * dt;
    const u = p.age / p.life; p.sp.scale.setScalar(p.size + p.grow * u * p.life); p.sp.material.opacity = p.opacity * (1 - u);
  }
}
function clearParticles() { for (const p of particles) { fx.remove(p.sp); p.sp.material.dispose(); } particles.length = 0; }
const flash = new THREE.PointLight(0xffaa55, 0, 1500, 1.4); W.scene.add(flash);

// ---------- app state ----------
const app = {
  state: "menu", demo: true, sim: null, kind: "booster", rec: [], outcomeAt: null, outcomeShown: false,
  cam: "chase", camAuto: true, camHold: 0, input: { steer: 0, thr: 0 }, keys: new Set(), apAssist: false,
  replay: null, paused: false, slow: 1, lbMode: "catch", lastEvents: 0, shake: 0, seed: 1, time: 0,
};
window.__chop = { app };

function newSim(mode, seed) {
  app.sim = createSim(mode, seed); app.kind = app.sim.vehicle; app.seed = seed;
  app.rec = []; app.outcomeAt = null; app.outcomeShown = false; app.lastEvents = 0; app.replay = null; app.slow = 1;
  app.input = { steer: 0, thr: 0 }; app.apAssist = false; app.camAuto = true; app.cam = "chase"; app.camHold = 0; app.shake = 0;
  clearParticles(); flash.intensity = 0;
  vehicles.booster.group.visible = app.kind === "booster"; vehicles.ship.group.visible = app.kind === "ship";
  W.land.visible = app.kind === "booster"; W.buoy.visible = app.kind === "ship";
  W.tower.setArms(0);
  smoothCam.init = false;
  document.body.classList.remove("cine"); $("replay-tag").classList.add("hidden");
}

function startDemo(seed) {
  app.state = "menu"; app.demo = true;
  // pick a seed the flight computer catches cleanly (simulated headless first; takes a few ms)
  let s = seed ?? Math.floor(Math.random() * 1e6);
  if (seed == null) for (let i = 0; i < 40; i++) { const r = runEpisode("catch", s).result; if (r && r.score >= 860) break; s++; }
  newSim("catch", s);
  $("menu").classList.remove("hidden"); $("result").classList.add("hidden"); $("hud").classList.add("hidden"); $("demo-tag").classList.remove("hidden"); $("touch").classList.add("hidden");
}
function startGame(mode, forceSeed) {
  sound.init(); app.usedAP = false;
  const seed = forceSeed ?? (mode === "daily" ? dailySeed() : Math.floor(Math.random() * 1e6));
  newSim(mode, seed); app.state = "play"; app.demo = false;
  $("menu").classList.add("hidden"); $("result").classList.add("hidden"); $("hud").classList.remove("hidden"); $("demo-tag").classList.add("hidden");
  if (matchMedia("(pointer:coarse)").matches || Q.has("touch")) $("touch").classList.remove("hidden");
  $("t-thr").value = 0;
  $("h-mode").textContent = MODES[mode].label.toUpperCase();
  $("h-sub").textContent = mode === "daily" ? `Daily ${seed.slice(6)} · seeded winds` : `Seed ${seed}`;
  $("h-finlab").textContent = app.kind === "ship" ? "FLAPS" : "GRID FINS";
  $("h-altlab").textContent = app.kind === "ship" ? "ALTITUDE" : "PINS ABOVE ARMS";
  if (mode !== "ship") sound.sonicBoom();
  callout(mode === "ship" ? "BELLY-FLOP · FLIP & BURN" : "BOOSTER RETURN", "#ffd08a", 2.2);
  hint(mode === "ship" ? "Steer with A/D, then Space to light the engines and flip upright. Splash slowly near the buoy." : "Glide toward the tower with A/D. Light the engines with Space, late. Settle onto the arms.");
}

// ---------- input ----------
addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
  app.keys.add(k);
  sound.init();
  if (app.state === "menu") {
    if (k === "enter" || k === " ") startGame("catch");
    if (k === "1") startGame("catch"); if (k === "2") startGame("ship"); if (k === "3") startGame("daily");
    return;
  }
  if (k === "escape") { app.paused = false; $("pause").classList.add("hidden"); startDemo(); return; }
  if (k === "m") sound.setMuted(!sound.muted);
  if (k === "c") cycleCam();
  if (k === "v") { app.camAuto = true; flashCam(); }
  if (k === "p" && app.state === "play") { app.paused = !app.paused; $("pause").classList.toggle("hidden", !app.paused); }
  if (app.state === "play" && !app.sim.result) {
    if (k === " " && app.input.thr === 0) { app.input.thr = 0.65; }
    if (k === "x") app.input.thr = 0;
    if (k === "t") { app.apAssist = !app.apAssist; hint(app.apAssist ? "Autopilot flying: this run won't be ranked. Press T to take back control." : "You have control."); }
  }
  if (k === "r" && (app.state === "result" || app.state === "replay")) startReplay();
  else if (k === "r" && app.state === "play" && !app.sim.result) startGame(app.sim.mode);
  if (k === "enter" && (app.state === "result" || app.state === "replay")) startGame(app.sim.mode);
});
addEventListener("keyup", (e) => app.keys.delete(e.key.toLowerCase()));
function readInput(dt) {
  const K = app.keys; let st = 0;
  if (K.has("a") || K.has("arrowleft") || touch.left) st -= 1;
  if (K.has("d") || K.has("arrowright") || touch.right) st += 1;
  app.input.steer += (st - app.input.steer) * Math.min(1, dt * 5);
  if (K.has("w") || K.has("arrowup")) app.input.thr = Math.min(1, (app.input.thr || 0.12) + dt * 0.8);
  if (K.has("s") || K.has("arrowdown")) app.input.thr = Math.max(0, app.input.thr - dt * 0.8);
  if (K.has("shift")) app.input.thr = 1;
  if (touch.slider) app.input.thr = touch.slider / 100; else if (touch.active) $("t-thr").value = Math.round(app.input.thr * 100);
}
const touch = { left: false, right: false, slider: null, active: false };
function bindHold(id, key) {
  const el = $(id);
  el.addEventListener("pointerdown", (e) => { e.preventDefault(); touch[key] = true; touch.active = true; sound.init(); });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) el.addEventListener(ev, () => (touch[key] = false));
}
bindHold("t-left", "left"); bindHold("t-right", "right");
$("t-thr").addEventListener("input", (e) => { touch.slider = +e.target.value; touch.active = true; });
$("t-thr").addEventListener("change", () => { touch.slider = null; });
$("t-ign").addEventListener("pointerdown", () => { if (app.input.thr === 0) app.input.thr = 0.65; touch.active = true; });
$("t-cam").addEventListener("pointerdown", () => cycleCam());

// ---------- menu / result wiring ----------
document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => startGame(b.dataset.mode)));
document.querySelectorAll("[data-lb]").forEach((b) => b.addEventListener("click", () => { app.lbMode = b.dataset.lb; renderLB(); }));
$("r-replay").addEventListener("click", startReplay);
$("r-retry").addEventListener("click", () => startGame(app.sim.mode));
$("r-menu").addEventListener("click", () => startDemo());
$("r-savebtn").addEventListener("click", saveScore);
$("daily-sub").textContent = `${dailySeed().slice(6)}: same seeded winds for everyone today`;

// ---------- leaderboard (localStorage) ----------
const LBKEY = "chopsticks.lb.v1";
const lbLoad = () => { try { return JSON.parse(localStorage.getItem(LBKEY)) || {}; } catch { return {}; } };
function lbKey(mode) { return mode === "daily" ? "daily:" + dailySeed().slice(6) : mode; }
function renderLB() {
  const list = (lbLoad()[lbKey(app.lbMode)] || []).slice(0, 8);
  $("lb-mode").textContent = app.lbMode === "daily" ? "Today " + dailySeed().slice(6) : MODES[app.lbMode].label;
  $("lb").innerHTML = list.length ? list.map((e) => `<li><b>${e.score}</b>${esc(e.name)} <span>${esc(e.title)} · ${e.date}</span></li>`).join("") : `<li class="mut" style="list-style:none;margin-left:-20px">No scores yet. Be the first.</li>`;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function saveScore() {
  const r = app.sim.result; if (!r || !r.score || app.saved || app.ranked === false) return;
  const name = ($("r-name").value || "Pilot").slice(0, 16); localStorage.setItem("chopsticks.name", name);
  const db = lbLoad(), key = lbKey(app.sim.mode);
  db[key] = [...(db[key] || []), { name, score: r.score, title: r.title, date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }) }].sort((a, b) => b.score - a.score).slice(0, 10);
  localStorage.setItem(LBKEY, JSON.stringify(db)); app.saved = true; $("r-savebtn").textContent = "Saved ✓"; app.lbMode = app.sim.mode; renderLB();
}
renderLB();

// ---------- callouts ----------
let calloutT = 0;
function callout(text, color = "#fff", secs = 1.6) { const el = $("callout"); el.textContent = text; el.style.color = color; el.classList.add("on"); calloutT = secs; }
let hintT = 0; function hint(t, secs = 7) { $("hint").textContent = t; $("hint").style.opacity = 1; hintT = secs; }

// ---------- cameras ----------
const CAMS = () => (app.kind === "ship" ? ["chase", "booster", "buoy"] : ["chase", "booster", "tower"]);
const CAMNAME = { chase: "CHASE CAM", booster: "ONBOARD CAM", tower: "TOWER CAM", buoy: "BUOY CAM" };
function cycleCam() { const c = CAMS(); app.cam = c[(c.indexOf(app.cam) + 1) % c.length]; app.camAuto = false; flashCam(); }
function flashCam() { $("camtag").textContent = CAMNAME[app.cam] + (app.camAuto ? " · AUTO" : ""); }
function director(f, dt) {
  if (!app.camAuto) return;
  app.camHold -= dt; if (app.camHold > 0) return;
  const h = f.h, ship = app.kind === "ship"; let want = app.cam;
  if (f.phase !== "flight") want = ship ? "buoy" : "tower";
  else if (h > 1400) want = "chase";
  else if (f.lit && f.burnT < 3.2) want = "booster";
  else if (h < (ship ? 260 : 300)) want = ship ? "buoy" : "tower";
  else want = "chase";
  if (want !== app.cam) { app.cam = want; app.camHold = 1.2; flashCam(); }
}
const smoothCam = { init: false, pos: new THREE.Vector3(), look: new THREE.Vector3() };
const tmpV = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
function placeCamera(f, dt, name = app.cam) {
  const V = app.kind === "ship" ? vehicles.ship.V : vehicles.booster.V;
  const bx = Math.sin(f.th), by = Math.cos(f.th);
  const mid = new THREE.Vector3(f.bx + bx * V.L * 0.5, f.by + by * V.L * 0.5, 0);
  let pos, look, fov = 50; camera.up.copy(up);
  if (name === "chase") {
    const far = Math.min(1, Math.max(0, (f.h - 200) / 1500));
    pos = mid.clone().add(new THREE.Vector3(70 + 60 * far, 6 - 40 * far, 150 + 120 * far)); look = mid.clone(); fov = 42;
    if (!smoothCam.init || dt === 0) { smoothCam.pos.copy(pos); smoothCam.init = true; }
    smoothCam.pos.lerp(pos, Math.min(1, dt * 3)); pos = smoothCam.pos.clone();
  } else if (name === "booster") {
    pos = new THREE.Vector3(f.bx + bx * (V.L - 9), f.by + by * (V.L - 9), V.R + 3.5);
    look = new THREE.Vector3(f.bx - bx * 120, f.by - by * 120, 1); fov = 72;
    camera.up.set(bx, by, 0);
  } else if (name === "tower") {
    // low on the tower's far side, looking up past the chopsticks
    pos = new THREE.Vector3(TOWER.backX - 18, 52, 58); look = mid.clone().add(new THREE.Vector3(0, -4, 0));
    const d = pos.distanceTo(look); fov = Math.max(9, Math.min(64, 2 * Math.atan(68 / d) * DEG));
  } else {
    pos = new THREE.Vector3(6, 3.2, 70); look = mid.clone();
    const d = pos.distanceTo(look); fov = Math.max(10, Math.min(65, 2 * Math.atan(60 / d) * DEG));
  }
  if (app.shake > 0) { pos.add(new THREE.Vector3((Math.random() - 0.5) * app.shake, (Math.random() - 0.5) * app.shake, 0)); }
  camera.position.copy(pos); camera.fov = fov; camera.updateProjectionMatrix(); camera.lookAt(look);
}

// ---------- frame snapshot (live or replay) ----------
function frameFromSim(sim) {
  const p = points(sim), s = sim.s;
  return { t: s.t, bx: p.base.x, by: p.base.y, th: s.th, thr: s.thr, g: s.gimbal, fin: s.fin, arms: s.arms, lit: s.lit, phase: s.phase, h: refHeight(sim), x: refX(sim), vx: s.vx, vy: s.vy, burnT: s.burnTime, wind: sim.windNow };
}
function render(f, dt, t) {
  const v = vehicles[app.kind];
  const exploded = f.phase === "crashed" && app.outcomeAt != null && f.t >= app.outcomeAt;
  v.group.visible = !exploded || f.t < app.outcomeAt + 0.05;
  poseVehicle(v, { x: f.bx, y: f.by }, f.th, f.thr, f.g, f.fin, t);
  W.tower.setArms(easeArms(f.arms));
  W.wn.offset.x = t * 0.004; W.wn.offset.y = t * 0.002;
  W.tower.beacon.visible = Math.floor(t * 1.2) % 2 === 0;
  // exhaust interaction with the ground / sea
  if (f.thr > 0.05 && dt > 0) {
    const base = new THREE.Vector3(f.bx, f.by, 0), groundY = app.kind === "booster" && Math.abs(f.bx) < 14 ? TOWER.mountTop : 0;
    const dist = f.by - groundY;
    if (dist < 120 && Math.random() < 0.9) for (let i = 0; i < 2; i++) {
      const a = Math.random() * 6.283; puff(new THREE.Vector3(f.bx + Math.cos(a) * 6, groundY + 3, Math.sin(a) * 6), new THREE.Vector3(Math.cos(a) * 40, 4 + Math.random() * 6, Math.sin(a) * 40), { size: 12, grow: 10, life: 3.2, opacity: 0.55 * (1 - dist / 120) });
    }
    if (Math.random() < 0.35) puff(base.clone().add(new THREE.Vector3(0, -8, 0)), new THREE.Vector3(-Math.sin(f.th) * 20, -30, 0), { size: 6, grow: 5, life: 1.2, opacity: 0.25 });
  }
  if (dt > 0) updateParticles(dt);
  flash.intensity *= Math.pow(0.02, dt);
  app.shake = Math.max(0, app.shake - dt * 6);
}
const easeArms = (a) => a * a * (3 - 2 * a);

// ---------- outcome ----------
function onOutcome(sim) {
  const r = sim.result; if (app.outcomeAt == null) app.outcomeAt = r.t;
  const p = points(sim);
  if (r.phase === "caught") {
    sound.clank(); app.shake = 2.5; setTimeout(() => sound.win(r.score), 350);
    callout(r.score >= 920 ? "CHOPSTICKS PERFECTION!" : "CAUGHT!", "#6ee7b7", 2.4);
  } else if (r.phase === "splashed") {
    sound.splash(); callout("SPLASHDOWN!", "#7dd3fc", 2.2); setTimeout(() => sound.win(r.score), 300);
    for (let i = 0; i < 40; i++) { const a = Math.random() * 6.283; puff(new THREE.Vector3(p.base.x + Math.cos(a) * 5, 2, Math.sin(a) * 5), new THREE.Vector3(Math.cos(a) * 25, 10 + Math.random() * 25, Math.sin(a) * 25), { size: 8, grow: 8, life: 2.5, opacity: 0.8 }); }
  } else {
    sound.boom(); app.shake = 6; callout(r.why.toUpperCase(), "#fb7185", 2.6);
    flash.position.set(p.base.x, p.base.y + 20, 10); flash.intensity = 4e5;
    const c = new THREE.Vector3((p.base.x + p.top.x) / 2, (p.base.y + p.top.y) / 2, 0);
    for (let i = 0; i < 70; i++) { const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize(); puff(c.clone().addScaledVector(d, Math.random() * 20), d.multiplyScalar(30 + Math.random() * 60), { size: 16, grow: 22, life: 1.6 + Math.random(), tex: fireTex, add: true, opacity: 0.9 }); }
    for (let i = 0; i < 40; i++) { const d = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize(); puff(c.clone().addScaledVector(d, 10), d.multiplyScalar(15 + Math.random() * 25), { size: 22, grow: 14, life: 6, opacity: 0.6 }); }
  }
}
function showResult() {
  const sim = app.sim, r = sim.result; app.state = "result"; app.saved = false; app.ranked = !app.usedAP;
  $("result").classList.remove("hidden"); $("touch").classList.add("hidden");
  $("r-kicker").textContent = `${MODES[sim.mode].label.toUpperCase()} · ${sim.mode === "daily" ? dailySeed().slice(6) : "SEED " + app.seed}`;
  const ok = !!r.score;
  $("r-title").textContent = ok ? r.title : r.why; $("r-title").className = ok ? "good" : "bad";
  $("r-score").textContent = ok ? r.score : "0";
  $("r-parts").innerHTML = ok ? Object.entries(r.parts).map(([k, v]) => { const max = { position: sim.vehicle === "ship" ? 300 : 400, descent: sim.vehicle === "ship" ? 300 : 250, drift: sim.vehicle === "ship" ? 100 : 150, attitude: sim.vehicle === "ship" ? 200 : 100, fuel: 100 }[k]; return `<div class="part"><b>${v}</b><span>${k.toUpperCase()}</span><i style="width:${(100 * v) / max}%"></i></div>`; }).join("") : "";
  $("r-meas").textContent = `offset ${Math.abs(r.x).toFixed(2)} m · vertical ${Math.abs(r.vy).toFixed(2)} m/s · sideways ${Math.abs(r.vx).toFixed(2)} m/s · tilt ${Math.abs(r.tiltDeg).toFixed(1)}° · fuel left ${r.fuelPct}%` + (app.usedAP ? " · autopilot flew (unranked)" : "");
  $("r-save").style.display = ok && !app.usedAP ? "flex" : "none"; $("r-savebtn").textContent = "Save score";
  $("r-name").value = localStorage.getItem("chopsticks.name") || "Boyd";
}

// ---------- replay ----------
function startReplay() {
  if (!app.rec.length) return;
  const end = app.rec[app.rec.length - 1].t, t0 = Math.max(app.rec[0].t, (app.outcomeAt ?? end) - 8);
  app.replay = { t: t0, end: Math.min(end, (app.outcomeAt ?? end) + 3.5), speed: 0.35, cutT: 0, cams: CAMS(), ci: 0 };
  app.state = "replay"; $("result").classList.add("hidden"); $("replay-tag").classList.remove("hidden"); document.body.classList.add("cine");
  app.cam = "chase"; app.camAuto = false; flashCam(); clearParticles();
}
function recAt(t) {
  const R = app.rec; let lo = 0, hi = R.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (R[m].t <= t) lo = m; else hi = m; }
  const a = R[lo], b = R[hi], u = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0;
  const f = { ...a }; for (const k of ["bx", "by", "th", "thr", "g", "fin", "arms", "h", "x"]) f[k] = a[k] + (b[k] - a[k]) * u; f.t = t; return f;
}

// ---------- HUD ----------
const scope = $("scope").getContext("2d");
function hud(sim) {
  const s = sim.s, h = refHeight(sim), x = refX(sim), ship = sim.vehicle === "ship";
  const set = (id, txt, cls = "") => { const el = $(id); el.textContent = txt; el.className = cls; };
  set("h-alt", `${h.toFixed(h < 100 ? 1 : 0)} m`);
  const vy = s.vy, vyCls = h < 60 ? (Math.abs(vy) < 3 ? "good" : Math.abs(vy) < 8 ? "warn" : "bad") : "";
  set("h-vy", `${vy.toFixed(1)} m/s`, vyCls);
  if (sim.result) set("h-cue", sim.result.score ? "DONE" : "—", sim.result.score ? "good" : "");
  else if (s.lit || s.burnTime > 0) set("h-cue", s.lit ? "BURNING" : "RELIGHT?", s.lit ? "good" : "warn");
  else { const cue = burnCue(sim); set("h-cue", cue.t > 0.4 ? `in ${cue.t.toFixed(1)} s` : cue.t > -1.5 ? "NOW!" : "LATE!", cue.t > 3 ? "" : cue.t > 0.4 ? "warn" : "bad pulse"); }
  set("h-x", `${x >= 0 ? "←" : "→"} ${Math.abs(x).toFixed(1)} m`, Math.abs(x) < (ship ? 15 : 2) ? "good" : Math.abs(x) < (ship ? 40 : 6) ? "warn" : "bad");
  set("h-vx", `${s.vx.toFixed(1)} m/s`, Math.abs(s.vx) < 2 ? "good" : Math.abs(s.vx) < 5 ? "warn" : "bad");
  set("h-th", `${(s.th * DEG).toFixed(1)}°`, Math.abs(s.th * DEG) < 4 ? "good" : Math.abs(s.th * DEG) < 10 ? "warn" : "bad");
  $("b-thr").style.height = `${s.thr * 100}%`; $("b-cmd").style.bottom = `${app.input.thr * 100}%`; $("h-thr").textContent = `${Math.round(s.thr * 100)}%`;
  const fuel = s.fuel / sim.V.fuel; $("b-fuel").style.height = `${fuel * 100}%`; set("h-fuel", `${Math.round(fuel * 100)}%`, fuel < 0.15 ? "val bad" : "val");
  set("h-eng", s.lit ? (s.spoolT < sim.V.spool ? "SPOOLING" : "LIT") : "OFF", s.lit ? "good" : "");
  set("h-gim", `${(s.gimbal * DEG).toFixed(1)}°`); set("h-fin", `${(s.fin * 100).toFixed(0)}%`);
  const w = sim.windNow; set("h-wind", `${w >= 0 ? "→" : "←"} ${Math.abs(w).toFixed(1)} m/s`, Math.abs(w) > 12 ? "warn" : "");
  // approach scope: side view around the catch point
  const c = scope, Wd = 300, Hd = 190; c.clearRect(0, 0, Wd, Hd);
  const span = Math.max(260, Math.abs(h) * 1.25, Math.abs(x) * 2.6);
  const cx = Wd * 0.45, cy = Hd - 18, k = (Hd - 30) / span;
  const X = (wx) => cx + wx * k, Y = (wy) => cy - (wy - (ship ? 0 : TOWER.armY) + (ship ? 0 : 0)) * k;
  c.fillStyle = "#93a3bf"; c.font = "10px ui-monospace,monospace"; c.fillText(`APPROACH · ${Math.round(span)} m`, 10, 14);
  c.strokeStyle = "#ffffff22"; c.beginPath(); c.moveTo(0, Y(ship ? 0 : TOWER.armY)); c.lineTo(Wd, Y(ship ? 0 : TOWER.armY)); c.stroke();
  if (!ship) {
    c.fillStyle = "#8d97a8"; c.fillRect(X(TOWER.backX), Y(TOWER.top), (TOWER.faceX - TOWER.backX) * k, (TOWER.top) * k);
    c.fillStyle = "#c9a227"; c.fillRect(X(TOWER.faceX), Y(TOWER.armY) - 1.5, (TOWER.armTipX - TOWER.faceX) * k, 3);
    c.fillStyle = "#6ee7b755"; c.fillRect(X(-TOWER.catchHalf), Y(TOWER.armY) - 5, TOWER.catchHalf * 2 * k, 10);
  } else { c.fillStyle = "#38bdf833"; c.fillRect(0, Y(0), Wd, Hd); c.fillStyle = "#ff7a1a"; c.fillRect(X(0) - 2, Y(0) - 4, 4, 4); }
  // trail
  c.strokeStyle = "#ffd08acc"; c.lineWidth = 1.5; c.beginPath(); const R = app.rec; for (let i = Math.max(0, R.length - 900); i < R.length; i += 6) { const f = R[i]; i === Math.max(0, R.length - 900) ? c.moveTo(X(f.x), Y(f.h + (ship ? 0 : TOWER.armY))) : c.lineTo(X(f.x), Y(f.h + (ship ? 0 : TOWER.armY))); } c.stroke();
  // vehicle glyph
  const gx = X(x), gy = Y(h + (ship ? 0 : TOWER.armY)); c.save(); c.translate(gx, gy); c.rotate(s.th); c.fillStyle = "#fff"; c.fillRect(-2, -3, 4, Math.max(8, 70 * k)); c.restore();
  c.fillStyle = "#fff"; c.beginPath(); c.arc(gx, gy, 2.5, 0, 6.283); c.fill();
}

// ---------- main loop ----------
let last = performance.now(), acc = 0;
function tick(now) {
  const real = Math.min(0.1, (now - last) / 1000); last = now; app.time += real;
  frame(real);
  requestAnimationFrame(tick);
}
function frame(real) {
  if (calloutT > 0 && (calloutT -= real) <= 0) $("callout").classList.remove("on");
  if (hintT > 0 && (hintT -= real) <= 0) $("hint").style.opacity = 0;
  const sim = app.sim;
  if (app.state === "replay") {
    const R = app.replay; const prev = R.t; R.t += real * R.speed; R.cutT += real * R.speed;
    if (R.cutT > 2.0 && app.outcomeAt != null && R.t < app.outcomeAt - 0.8) { R.cutT = 0; R.ci = (R.ci + 1) % R.cams.length; app.cam = R.cams[R.ci]; flashCam(); }
    if (app.outcomeAt != null && prev < app.outcomeAt - 1.2 && R.t >= app.outcomeAt - 1.2) { app.cam = app.kind === "ship" ? "buoy" : "tower"; flashCam(); }
    if (app.outcomeAt != null && prev < app.outcomeAt && R.t >= app.outcomeAt) { onOutcomeFx(); }
    const f = recAt(R.t);
    render(f, real * R.speed, app.time); placeCamera(f, real * R.speed);
    sound.update(f.thr, Math.hypot(f.vx || 0, f.vy || 0), 0, 0.5);
    if (R.t >= R.end) {
      $("replay-tag").classList.add("hidden"); document.body.classList.remove("cine");
      if (app.demo) startDemo(); else { app.state = "result"; showResult(); }
    }
    if (!app.noRender) renderer.render(W.scene, camera); return;
  }
  if (app.paused) { renderer.render(W.scene, camera); return; }
  // simulate
  if (app.state === "play" && !sim.result) readInput(real);
  acc += real * app.slow;
  while (acc >= DT) {
    acc -= DT;
    let ctrl;
    if (app.demo || app.apAssist) { ctrl = autopilot(sim); if (app.apAssist) { app.usedAP = true; app.input.thr = ctrl.throttle; } }
    else ctrl = { throttle: app.input.thr, steer: app.input.steer };
    const had = !!sim.result; step(sim, ctrl, DT);
    if (sim.s.t % (1 / 60) < DT) app.rec.push(frameFromSim(sim));
    if (!had && sim.result) onOutcome(sim);
  }
  // sim events -> sounds/callouts
  while (app.lastEvents < sim.events.length) {
    const e = sim.events[app.lastEvents++];
    if (e.type === "ignition") { sound.ignition(); if (!app.demo) callout("IGNITION", "#ffd08a", 1); }
    if (e.type === "flameout") { callout("FLAMEOUT: OUT OF FUEL", "#fb7185", 2); }
  }
  if (!sim.result && sim.s.armsClosing && !app.armsSaid) { app.armsSaid = true; sound.armsMove(); if (!app.demo) callout("ARMS CLOSING", "#c9e7ff", 1.2); }
  if (sim.result == null) app.armsSaid = sim.s.armsClosing;
  const gustNow = Math.abs(sim.windNow) > 12; if (gustNow && !app.gust && !sim.result) { sound.gust(); if (!app.demo) callout("GUST!", "#fcd34d", 0.9); } app.gust = gustNow;
  const f = frameFromSim(sim);
  director(f, real);
  render(f, real * app.slow, app.time);
  placeCamera(f, real);
  sound.update(sim.s.thr, Math.hypot(sim.s.vx, sim.s.vy), sim.q, app.demo ? 0.0 : 1);
  if (app.state === "play") hud(sim);
  // after the outcome: linger, then result (or replay in demo)
  if (sim.result && sim.s.t - app.outcomeAt > (app.demo ? 3.0 : 2.6) && !app.outcomeShown) {
    app.outcomeShown = true;
    if (app.demo) startReplay(); else showResult();
  }
  document.body.classList.toggle("attract-min", app.demo && (f.h < 420 || !!sim.result));
  if (!app.noRender) renderer.render(W.scene, camera);
}
function onOutcomeFx() { onOutcome(app.sim); }   // replay re-fires the catch/crash effects at the right moment

// test / capture hooks: deterministic stepping without requestAnimationFrame
window.__chop.advance = (secs, fps = 60, renderLast = true) => {
  const n = Math.round(secs * fps);
  for (let i = 0; i < n; i++) { app.noRender = !(renderLast && i === n - 1); app.time += 1 / fps; frame(1 / fps); }
  app.noRender = false;
};
window.__chop.until = (pred, fps = 60, maxSecs = 120) => { for (let i = 0; i < maxSecs * fps; i++) { if (pred(app)) break; app.noRender = true; app.time += 1 / fps; frame(1 / fps); } app.noRender = false; frame(0.0001); };
window.__chop.ap = (on = true) => { app.apAssist = on; };
window.__chop.startDemo = startDemo; window.__chop.startGame = startGame; window.__chop.startReplay = startReplay;
window.__chop.setCam = (c) => { app.cam = c; app.camAuto = false; flashCam(); };
window.__chop.state = () => ({ state: app.state, t: app.sim.s.t, phase: app.sim.s.phase, result: app.sim.result, cam: app.cam, seed: app.seed });

app.usedAP = false;
startDemo(Q.has("seed") ? +Q.get("seed") : undefined);
flashCam();
if (!Q.has("capture")) requestAnimationFrame(tick); else window.__chop.ready = true;
