// Chopsticks flight model: 2-D rigid body (downrange x, altitude y, tilt theta) with thrust, gimbal,
// grid fins / flaps, drag, gusting wind and limited propellant. Pure JS, no DOM: runs in the browser and in Node.
// Angles: theta = tilt of the body axis from vertical, + = nose leaning toward +x (clockwise).
// Game-tuned values, not real flight data. Super Heavy / Starship numbers are loose approximations.

export const G = 9.81;
const RHO0 = 1.225, HSCALE = 8500, DEG = Math.PI / 180;

export const TOWER = {
  faceX: -21, backX: -35, top: 146,        // tower body occupies x in [backX, faceX]
  armY: 100,                                // top surface of the chopsticks
  armTipX: 15,                              // arms reach from the tower face out to here
  catchHalf: 6,                             // |x| <= this at the pins = a catch window
  mountTop: 22, mountHalf: 12,              // launch mount under the catch point
};

export const VEHICLES = {
  booster: {
    name: "Super Heavy", L: 70, R: 4.5, hcg: 26, hpin: 62, dry: 180000, fuel: 40000, Tmax: 12e6, isp: 330,
    minThr: 0.12, gimbalMax: 15 * DEG, gimbalRate: 30 * DEG, spool: 0.6, leanPowered: 14 * DEG,
    coastBase: 0, coastLean: -20 * DEG, cdAx: 1.25, cdN: 1.2, finTorque: 4.0e7, stab: 2.0e7, damp: 3.0,
  },
  ship: {
    name: "Starship", L: 50, R: 4.5, hcg: 20, hpin: 40, dry: 100000, fuel: 22000, Tmax: 6e6, isp: 330,
    minThr: 0.12, gimbalMax: 15 * DEG, gimbalRate: 35 * DEG, spool: 0.6, leanPowered: 12 * DEG,
    coastBase: -90 * DEG, coastLean: 12 * DEG, cdAx: 0.9, cdN: 1.0, finTorque: 2.6e7, stab: 0, damp: 3.0,
  },
};

export const MODES = {
  catch: { vehicle: "booster", label: "Booster Catch" },
  ship: { vehicle: "ship", label: "Ship Splashdown" },
  daily: { vehicle: "booster", label: "Daily Challenge" },
};

// ---------- seeded RNG ----------
export function rng(seed) {
  let a = (typeof seed === "string" ? hashStr(seed) : seed) >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hashStr(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
export const dailySeed = (d = new Date()) => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return "daily-" + p;
};

// ---------- wind: steady base + slow swell + discrete gusts ----------
export function makeWind(r, strength = 1) {
  const base = (r() * 2 - 1) * 9 * strength;
  const waves = [0, 1, 2].map(() => ({ a: (1 + r() * 3) * strength, f: 0.03 + r() * 0.12, p: r() * 6.283 }));
  const gusts = [];
  let t = 2 + r() * 4;
  while (t < 140) { gusts.push({ t0: t, dur: 1.8 + r() * 2.8, a: (r() < 0.5 ? -1 : 1) * (4 + r() * 9) * strength }); t += 3 + r() * 7; }
  const at = (time, y) => {
    let w = base;
    for (const q of waves) w += q.a * Math.sin(6.283 * q.f * time + q.p);
    for (const g of gusts) { const u = (time - g.t0) / g.dur; if (u > 0 && u < 1) w += g.a * Math.sin(Math.PI * u) ** 2; }
    return w * (0.65 + 0.35 * Math.min(1, Math.max(0, y) / 1200));
  };
  return { base, gusts, at };
}

// ---------- simulation ----------
export function createSim(mode = "catch", seed = 1, opts = {}) {
  const m = MODES[mode] || MODES.catch;
  const V = VEHICLES[m.vehicle];
  const r = rng(seed);
  const wind = makeWind(r, mode === "daily" ? 1.25 : opts.windScale ?? 1);
  const side = r() < 0.5 ? -1 : 1;
  let s;
  if (m.vehicle === "booster") {
    // the booster always comes home from the ocean side (+x); the tower stands on the -x side of the mount
    s = { x: 110 + r() * 260, vx: -(4 + r() * 18), y: 3200 + r() * 600, vy: -195 - r() * 25, th: (r() * 2 - 1) * 4 * DEG };
  } else {
    s = { x: 120 + r() * 200, y: 1300 + r() * 300, vx: -(2 + r() * 8), vy: -62 - r() * 8, th: -90 * DEG + (r() * 2 - 1) * 5 * DEG };
  }
  Object.assign(s, { om: 0, fuel: V.fuel, thr: 0, thrCmd: 0, lit: false, spoolT: 0, gimbal: 0, fin: 0, steer: 0, t: 0, phase: "flight", arms: 0, armsClosing: false, burnTime: 0, ignitions: 0 });
  const sim = { mode, seed, V, wind, s, events: [], result: null, vehicle: m.vehicle, label: m.label, windNow: 0, q: 0, maxQ: 0 };
  return sim;
}

const mass = (sim) => sim.V.dry + sim.s.fuel;
export function points(sim) {
  const { s, V } = sim; const bx = Math.sin(s.th), by = Math.cos(s.th);
  const base = { x: s.x - V.hcg * bx, y: s.y - V.hcg * by };
  return { base, pin: { x: base.x + V.hpin * bx, y: base.y + V.hpin * by }, top: { x: base.x + V.L * bx, y: base.y + V.L * by }, b: { x: bx, y: by } };
}
// The quantity the player is trying to zero: height of the catch pins over the arms (booster) or engines over the sea (ship).
export function refHeight(sim) { const p = points(sim); return sim.vehicle === "booster" ? p.pin.y - TOWER.armY : p.base.y; }
export function refX(sim) { const p = points(sim); return sim.vehicle === "booster" ? p.pin.x : p.base.x; }

export function step(sim, input, dt = 1 / 120) {
  const { s, V } = sim;
  if (s.phase !== "flight") { settle(sim, dt); return sim; }
  const steer = Math.max(-1, Math.min(1, input.steer || 0));
  s.steer = steer;
  s.thrCmd = Math.max(0, Math.min(1, input.throttle ?? 0));
  // engines: spool-up, min throttle, rate limit, fuel
  if (s.thrCmd > 0 && s.fuel > 0) {
    if (!s.lit) { s.lit = true; s.spoolT = 0; s.ignitions++; sim.events.push({ t: s.t, type: "ignition" }); }
    s.spoolT += dt;
    const target = Math.max(V.minThr, s.thrCmd) * Math.min(1, s.spoolT / V.spool);
    s.thr += Math.max(-1.5 * dt, Math.min(1.5 * dt, target - s.thr));
    if (s.spoolT < V.spool) s.thr = Math.min(s.thr, target);
  } else {
    if (s.lit) sim.events.push({ t: s.t, type: s.fuel <= 0 ? "flameout" : "shutdown" });
    s.lit = false; s.thr = Math.max(0, s.thr - 4 * dt);
  }
  const M = mass(sim), I = (M * V.L * V.L) / 12;
  const T = s.thr * V.Tmax;
  if (T > 0) { const md = T / (V.isp * G); s.fuel = Math.max(0, s.fuel - md * dt); s.burnTime += dt; }
  // aero
  const w = sim.wind.at(s.t, s.y); sim.windNow = w;
  const rvx = s.vx - w, rvy = s.vy;
  const bx = Math.sin(s.th), by = Math.cos(s.th);
  const va = rvx * bx + rvy * by;                     // axial component
  const vnx = rvx - va * bx, vny = rvy - va * by;     // normal component
  const vn = Math.hypot(vnx, vny);
  const rho = RHO0 * Math.exp(-Math.max(0, s.y) / HSCALE);
  const kA = 0.5 * rho * V.cdAx * Math.PI * V.R * V.R, kN = 0.5 * rho * V.cdN * V.L * 2 * V.R;
  let fx = -kA * Math.abs(va) * va * bx - kN * vn * vnx;
  let fy = -kA * Math.abs(va) * va * by - kN * vn * vny;
  const vrel = Math.hypot(rvx, rvy), q = 0.5 * rho * vrel * vrel, qn = Math.min(1.6, q / 24000);
  sim.q = q; sim.maxQ = Math.max(sim.maxQ, q);
  // flight computer: steer -> commanded lean; PD -> torque demand split between gimbal and fins/flaps
  const powered = s.lit && s.thr > 0.05;
  const thCmd = powered ? steer * V.leanPowered : V.coastBase + steer * V.coastLean;
  const alphaDes = 2.2 * (thCmd - s.th) - 2.6 * s.om;
  let need = I * alphaDes;
  // passive aero torques (known to the flight computer)
  let tauAero = -V.damp * qn * I * 0.15 * s.om;
  if (V.stab && vrel > 1) { const thW = Math.atan2(-rvx, -rvy); tauAero += -V.stab * qn * Math.sin(s.th - thW); }
  need -= tauAero;
  let gTarget = 0;
  if (T > 0) { const sinG = Math.max(-Math.sin(V.gimbalMax), Math.min(Math.sin(V.gimbalMax), -need / (T * V.hcg))); gTarget = Math.asin(sinG); }
  s.gimbal += Math.max(-V.gimbalRate * dt, Math.min(V.gimbalRate * dt, gTarget - s.gimbal));
  const tauG = -T * V.hcg * Math.sin(s.gimbal);
  const finAuth = V.finTorque * Math.max(0.02, qn);
  const finTarget = Math.max(-1, Math.min(1, (need - tauG) / finAuth));
  s.fin += (finTarget - s.fin) * Math.min(1, dt / 0.12);
  const tau = tauG + s.fin * finAuth + tauAero;
  // thrust
  const tdx = Math.sin(s.th + s.gimbal), tdy = Math.cos(s.th + s.gimbal);
  fx += T * tdx; fy += T * tdy - M * G;
  s.vx += (fx / M) * dt; s.vy += (fy / M) * dt;
  s.x += s.vx * dt; s.y += s.vy * dt;
  s.om += (tau / I) * dt; s.th += s.om * dt;
  s.t += dt;
  checkContact(sim);
  if (s.t > 150 && s.phase === "flight") end(sim, "crashed", "Ran out of time");
  return sim;
}

function end(sim, phase, why, extra = {}) {
  const s = sim.s; s.phase = phase; s.lit = false;
  const p = points(sim);
  sim.result = { phase, why, t: +s.t.toFixed(2), x: +refX(sim).toFixed(2), vx: +s.vx.toFixed(2), vy: +s.vy.toFixed(2), tiltDeg: +(s.th / DEG).toFixed(2), omDeg: +(s.om / DEG).toFixed(2), fuelPct: +((100 * s.fuel) / sim.V.fuel).toFixed(1), base: p.base, ...extra };
  sim.events.push({ t: s.t, type: phase, why });
}

export function grade(sim, x, vx, vy, thDeg) {
  const fuel = sim.s.fuel / sim.V.fuel;
  const c = (v) => Math.max(0, Math.min(1, v));
  if (sim.vehicle === "booster") {
    const parts = { position: 400 * c(1 - Math.abs(x) / TOWER.catchHalf), descent: 250 * c(1 - Math.max(0, Math.abs(vy) - 1) / 9), drift: 150 * c(1 - Math.abs(vx) / 5), attitude: 100 * c(1 - Math.abs(thDeg) / 12), fuel: 100 * c(fuel / 0.5) };
    return finishGrade(parts);
  }
  const parts = { position: 300 * c(1 - Math.abs(x) / 60), descent: 300 * c(1 - Math.max(0, Math.abs(vy) - 1.5) / 8.5), drift: 100 * c(1 - Math.abs(vx) / 6), attitude: 200 * c(1 - Math.abs(thDeg) / 15), fuel: 100 * c(fuel / 0.5) };
  return finishGrade(parts);
}
function finishGrade(parts) {
  for (const k in parts) parts[k] = Math.round(parts[k]);
  const score = Object.values(parts).reduce((a, b) => a + b, 0);
  const title = score >= 920 ? "Chopsticks perfection" : score >= 800 ? "Textbook catch" : score >= 650 ? "Solid catch" : score >= 450 ? "Caught it" : "Caught... barely";
  return { score, parts, title };
}

function checkContact(sim) {
  const { s, V } = sim, T = TOWER, p = points(sim);
  if (Math.abs(s.x) > 6000 || s.y > 9000) return end(sim, "crashed", "Lost the vehicle");
  if (sim.vehicle === "ship") {
    if (p.base.y <= 0 || p.top.y <= 0) {
      const thDeg = s.th / DEG, x = p.base.x;
      if (Math.abs(s.vy) <= 10 && Math.abs(thDeg) <= 20 && p.base.y <= p.top.y) {
        end(sim, "splashed", "Splashdown", grade(sim, x, s.vx, s.vy, thDeg));
      } else end(sim, "crashed", Math.abs(thDeg) > 20 ? "Hit the water sideways" : "Hit the water too fast");
    }
    return;
  }
  // tower body
  for (let k = 0; k <= 7; k++) {
    const u = k / 7, px = p.base.x + (p.top.x - p.base.x) * u, py = p.base.y + (p.top.y - p.base.y) * u;
    if (py < T.top && px - V.R < T.faceX && px + V.R > T.backX) return end(sim, "crashed", "Hit the tower");
  }
  // arms close automatically when the booster is lined up below them
  if (p.base.y < T.armY && p.pin.y > T.armY && Math.abs(p.pin.x) <= T.catchHalf + 2 && p.pin.y - T.armY < 25) s.armsClosing = true;
  // pins reach the arms
  if (p.pin.y <= T.armY && s.prevPinY > T.armY) {
    const x = p.pin.x, thDeg = s.th / DEG;
    if (Math.abs(x) <= T.catchHalf) {
      if (Math.abs(s.vy) > 12) return end(sim, "crashed", "Too fast: the arms couldn't hold it");
      if (Math.abs(thDeg) > 15) return end(sim, "crashed", "Too tilted to seat on the arms");
      if (Math.abs(s.vx) > 6) return end(sim, "crashed", "Swinging too hard sideways");
      const g = grade(sim, x, s.vx, s.vy, thDeg);
      s.armsClosing = true;
      return end(sim, "caught", Math.abs(s.vy) > 8 ? "Hard catch" : "Caught!", g);
    }
    if (x > T.faceX && x < T.armTipX + V.R) return end(sim, "crashed", "Clipped a chopstick");
  }
  s.prevPinY = p.pin.y;
  // launch mount / ground: no landing legs
  if (Math.abs(p.base.x) < T.mountHalf && p.base.y <= T.mountTop) return end(sim, "crashed", "Landed on the launch mount (no legs!)");
  if (p.base.y <= 0 || p.top.y <= 0) return end(sim, "crashed", "Hit the ground (Super Heavy has no legs)");
}

// after the outcome: settle on the arms / float / fall
function settle(sim, dt) {
  const s = sim.s; s.t += dt; s.thr = Math.max(0, s.thr - 3 * dt); s.gimbal *= 1 - Math.min(1, dt * 2); s.fin *= 1 - Math.min(1, dt * 2);
  if (s.phase === "caught") {
    s.armsClosing = true;
    const k = Math.min(1, dt * 3);
    s.vy += (0 - s.vy) * k; s.vx += (0 - s.vx) * k; s.y += s.vy * dt; s.x += s.vx * dt;
    s.om += (-s.th * 4 - s.om * 2.2) * dt; s.th += s.om * dt;
  } else if (s.phase === "splashed") {
    s.vy *= 1 - Math.min(1, dt * 4); s.vx *= 1 - Math.min(1, dt * 2); s.y += s.vy * dt; s.x += s.vx * dt;
    const dir = s.th >= 0 ? 1 : -1; s.om += dir * 0.35 * dt; s.th = Math.max(-1.62, Math.min(1.62, s.th + s.om * dt));
  }
  s.arms = Math.min(1, s.arms + (s.armsClosing ? dt / 0.9 : 0));
}

// ---------- ignition cue for human pilots: same suicide-burn estimate the autopilot uses ----------
export function burnCue(sim) {
  const { s, V } = sim; const M = mass(sim), isShip = sim.vehicle === "ship";
  const h = refHeight(sim), aPlan = (V.Tmax * (isShip ? 0.5 : 0.62)) / M - G;
  const hf = isShip ? 6 : 8, extra = isShip ? -s.vy * 9 : -s.vy * V.spool * 0.7;
  const hBurn = (s.vy * s.vy) / (2 * aPlan) + hf + extra;
  const t = s.vy < 0 ? (h - hBurn) / -s.vy : Infinity;
  return { hBurn, t };
}

// ---------- autopilot: a simple guidance law the attract mode and the smoke test use ----------
export function autopilot(sim) {
  const { s, V } = sim; const M = mass(sim);
  const h = refHeight(sim), x = refX(sim);
  const isShip = sim.vehicle === "ship";
  const hf = isShip ? 6 : 8, vf = isShip ? 1.6 : 1.3;
  const aPlan = (V.Tmax * (isShip ? 0.5 : 0.62)) / M - G;
  const ap = (sim._ap ||= { burning: false });
  const extra = isShip ? -s.vy * 9 : -s.vy * V.spool * 0.7;
  const hBurn = (s.vy * s.vy - vf * vf) / (2 * aPlan) + hf + extra;
  if (!ap.burning) {
    // coast: glide so we arrive over the target with little sideways speed when the burn starts
    const tIgn = Math.max(0, h - hBurn) / Math.max(20, -s.vy);
    const tBurn = -s.vy / Math.max(5, aPlan);
    const aim = isShip ? -Math.sin(s.th) * 120 : 25;   // ship: the flip burn shoves it nose-ward, so start up-range
    const vxDes = Math.max(-45, Math.min(45, -(x - aim + s.vx * tBurn * 0.5) / Math.max(2.5, tIgn + 1.5)));
    const steer = Math.max(-1, Math.min(1, (vxDes - s.vx) * 0.12));
    if (h <= hBurn && s.vy < 0) ap.burning = true;
    else return { throttle: 0, steer };
  }
  // don't descend onto the arms until lined up: hold height while the sideways error is large
  const hold = isShip ? 0 : Math.min(120, Math.max(0, Math.abs(x) - 2.5) * 3 + Math.max(0, Math.abs(s.vx) - 1.2) * 4);
  const he = h - hold;
  let vyDes = he > hf ? -Math.sqrt(vf * vf + 2 * aPlan * 0.92 * (he - hf)) : he > 0 || isShip ? -Math.max(0.6, Math.min(vf, 0.4 + Math.max(0, he) * 0.12)) : Math.min(3, -he * 0.3);
  if (!isShip && h < 160) vyDes = Math.max(vyDes, -(vf + Math.max(0, he) / 3.2));   // gentle final approach near the tower
  if (!isShip && h < 110 && h > 3 && s.vx < -2.5 && x < 6) vyDes = Math.max(vyDes, -0.5);  // drifting at the tower: stop descending, sort it out first
  const aUp = G + 2.4 * (vyDes - s.vy);
  // lateral PD on position, stiffer than the attitude loop is slow
  // approach from the ocean side, sliding in toward the tower only near the end
  const xT = isShip ? 0 : Math.min(10, Math.max(0, (h - 15) * 0.06));
  const ax = Math.max(-6, Math.min(6, -0.22 * (x - xT) - 0.9 * s.vx));
  const cap = V.leanPowered * (isShip ? 1 : Math.max(0.3, Math.min(1, (h - 20) / 120)));
  const capPos = cap, capNeg = cap;
  const lean = Math.max(-capNeg, Math.min(capPos, Math.atan2(ax, Math.max(aUp, (V.minThr * V.Tmax) / M))));
  const flipping = Math.abs(s.th) > 25 * DEG;
  let thr = (M * Math.hypot(Math.max(0, aUp), ax)) / (V.Tmax * Math.max(0.35, Math.cos(s.th)));
  if (flipping) thr = 0.22;
  return { throttle: Math.max(0.02, Math.min(1, thr)), steer: lean / V.leanPowered };
}

export function runEpisode(mode, seed, controller = autopilot, maxT = 150, dt = 1 / 120) {
  const sim = createSim(mode, seed);
  while (sim.s.phase === "flight" && sim.s.t < maxT) step(sim, controller(sim), dt);
  return sim;
}
