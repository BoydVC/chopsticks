import { runEpisode } from "../src/sim.js";
const mode = process.argv[2] || "catch", N = +process.argv[3] || 40;
const out = {}; let ok = 0, sc = 0;
for (let i = 1; i <= N; i++) { const s = runEpisode(mode, i); const r = s.result || { phase: "timeout", why: "" };
  out[r.why] = (out[r.why] || 0) + 1; if (r.score) { ok++; sc += r.score; }
  if (i <= 6 || !r.score) console.log(i, r.phase, r.why, "x", r.x, "vy", r.vy, "vx", r.vx, "tilt", r.tiltDeg, "fuel", r.fuelPct, "score", r.score, "t", r.t); }
console.log(mode, "ok", ok, "/", N, "avg", (sc / Math.max(1, ok)).toFixed(0), out);
