// Chopsticks smoke test.
//  1) Physics, headless in Node: the autopilot must actually catch boosters (and splash ships) across many seeds.
//  2) Sanity: determinism, terminal velocity, fuel accounting, no-legs crash, score bounds, daily seed.
//  3) Server on :4242 + the single-file offline build (no network references), and (if Chrome exists) the
//     offline file actually boots and its attract-mode demo flies to a catch in a real browser.
import { runEpisode, createSim, step, autopilot, dailySeed, TOWER } from "../src/sim.js";
import fs from "fs";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ok  ", m); } else { fail++; console.log("  FAIL", m); } };

console.log("Autopilot catches (headless physics)");
const N = 100; let caught = 0, best = 0, scores = [];
for (let s = 1; s <= N; s++) { const r = runEpisode("catch", s).result; if (r.phase === "caught") { caught++; scores.push(r.score); best = Math.max(best, r.score); } }
const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
ok(caught >= 90, `Booster Catch: autopilot caught ${caught}/${N} seeds (avg score ${avg}, best ${best})`);
const demo = runEpisode("catch", 3).result;
ok(demo.phase === "caught" && Math.abs(demo.x) <= TOWER.catchHalf, `attract-mode seed 3 is a catch (x=${demo.x} m, vy=${demo.vy} m/s, score ${demo.score})`);
let daily = 0; for (let d = 1; d <= 30; d++) if (runEpisode("daily", `daily-2026-10-${String(d).padStart(2, "0")}`).result.phase === "caught") daily++;
ok(daily >= 25, `Daily Challenge (gustier): caught ${daily}/30 October seeds`);
let splash = 0; for (let s = 1; s <= 40; s++) if (runEpisode("ship", s).result.phase === "splashed") splash++;
ok(splash >= 38, `Ship Splashdown: autopilot splashed ${splash}/40 seeds`);

console.log("Physics sanity");
const a = runEpisode("catch", 42).result, b = runEpisode("catch", 42).result;
ok(JSON.stringify(a) === JSON.stringify(b), "deterministic: same seed, same flight");
ok(/^daily-\d{4}-\d{2}-\d{2}$/.test(dailySeed()), `daily seed format (${dailySeed()})`);
{ const sim = createSim("catch", 5); let vmax = 0; const f0 = sim.s.fuel;
  while (sim.s.phase === "flight") { step(sim, { throttle: 0, steer: 0 }); vmax = Math.max(vmax, -sim.s.vy); }
  ok(vmax > 150 && vmax < 300, `unpowered fall reaches a drag-limited speed (${vmax.toFixed(0)} m/s)`);
  ok(sim.s.fuel === f0, "no fuel burned with engines off");
  ok(sim.result.phase === "crashed", `no engines = crash: "${sim.result.why}"`); }
{ const sim = createSim("catch", 6); for (let i = 0; i < 240; i++) step(sim, { throttle: 1, steer: 0 }); ok(sim.s.fuel < sim.V.fuel && sim.s.lit, "full throttle burns fuel"); }
{ const sim = createSim("catch", 7); let r; while (sim.s.phase === "flight") step(sim, { throttle: 1, steer: 0 }); r = sim.result; ok(r.phase === "crashed", `full throttle the whole way also fails (${r.why})`); }
ok(scores.every((s) => s >= 0 && s <= 1000), "scores within 0..1000");

console.log("Server + offline build");
const port = 4242;
try { const h = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json(); ok(h.ok && h.app === "chopsticks", `server healthy on :${port}`); } catch (e) { ok(false, `server on :${port} (${e.message})`); }
try { const html = await (await fetch(`http://127.0.0.1:${port}/`)).text(); ok(html.includes("CHOPSTICKS") && html.includes("Not affiliated"), "index served with fan-project note"); } catch (e) { ok(false, "index served"); }
const snap = "dist/chopsticks-snapshot.html";
ok(fs.existsSync(snap), `${snap} exists (${(fs.statSync(snap).size / 1024).toFixed(0)} KB)`);
const html = fs.readFileSync(snap, "utf8");
ok(!/<script[^>]+src=|<link[^>]+href="(?!data:)/i.test(html), "snapshot is single-file (no external scripts/styles)");
ok(!/(src|href)="https?:/i.test(html) && !/import\s*\(?\s*["']https?:/i.test(html), "snapshot makes no network requests");

let chrome = "/usr/bin/google-chrome";
if (fs.existsSync(chrome)) {
  console.log("Offline build in a real (headless) browser");
  const { default: puppeteer } = await import("puppeteer-core");
  const br = await puppeteer.launch({ executablePath: chrome, headless: "new", args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const pg = await br.newPage(); await pg.setViewport({ width: 960, height: 600 });
  const errs = []; pg.on("pageerror", (e) => errs.push(String(e)));
  const reqs = []; pg.on("request", (r) => { if (!r.url().startsWith("file:") && !r.url().startsWith("data:")) reqs.push(r.url()); });
  await pg.goto("file://" + fs.realpathSync(snap) + "?capture=1&seed=3", { waitUntil: "load", timeout: 180000 }); pg.setDefaultTimeout(600000);
  await pg.waitForFunction("window.__chop && window.__chop.ready", { timeout: 180000 });
  const st = await pg.evaluate(() => { const C = window.__chop; C.until((a) => a.sim.s.phase !== "flight"); return C.state(); });
  ok(st.phase === "caught", `attract demo in the offline file ends in a catch (t=${st.t.toFixed(1)} s, cam=${st.cam})`);
  // keyboard path + synthesized audio graph: Enter starts a Booster Catch, Space lights the engines, A steers
  await pg.keyboard.press("Enter");
  await pg.evaluate(() => window.__chop.advance(1, 30));
  await pg.keyboard.press("Space");
  await pg.keyboard.down("KeyA");
  const kb = await pg.evaluate(() => { window.__chop.advance(1.5, 30); const a = window.__chop.app; return { state: a.state, lit: a.sim.s.lit, thr: a.sim.s.thr, steer: a.input.steer, audio: !!(window.__chop.app && document.querySelector("#hud:not(.hidden)")), cue: document.getElementById("h-cue").textContent }; });
  await pg.keyboard.up("KeyA");
  ok(kb.state === "play" && kb.lit && kb.thr > 0.1, `keyboard: Enter starts, Space lights engines (throttle ${(kb.thr * 100).toFixed(0)}%)`);
  ok(kb.steer < -0.5, `keyboard: A steers (input ${kb.steer.toFixed(2)})`);
  ok(kb.audio && kb.cue.length > 0, `HUD live (ignition cue: "${kb.cue}")`);
  ok(errs.length === 0, `no page errors ${errs.slice(0, 2).join(" | ")}`);
  ok(reqs.length === 0, `no network requests from the offline file ${reqs.slice(0, 2).join(" ")}`);
  await br.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
