// Capture the README screenshots at 1440x900 (deterministic: the sim is stepped via window.__chop, not wall-clock).
import { open } from "./capture.mjs";
const OUT = "screenshots/";
const { browser, page, errors } = await open("&seed=3");
const shot = async (name, fn, arg) => { await page.evaluate(fn, arg); await page.screenshot({ path: OUT + name }); console.log("  " + OUT + name, JSON.stringify(await page.evaluate(() => { const s = window.__chop.state(); return [s.state, s.phase, s.cam, +s.t.toFixed(1)]; }))); };
const only = process.argv[2];
const want = (n) => !only || n.includes(only);

if (want("01")) await shot("01-attract-catch.png", () => { const C = window.__chop; C.startDemo(3); C.until((a) => a.sim.s.phase !== "flight"); C.advance(0.6); });
if (want("02")) await shot("02-menu-attract.png", () => { const C = window.__chop; C.startDemo(3); C.setCam("chase"); C.advance(5, 30); });
if (want("03")) await shot("03-glide-grid-fins.png", () => { const C = window.__chop; C.startGame("catch", 110); C.ap(true); C.until((a) => a.sim.s.y < 1700); C.setCam("chase"); C.advance(0.5, 30); });
if (want("04")) await shot("04-onboard-landing-burn.png", () => { const C = window.__chop; C.startGame("catch", 110); C.ap(true); C.until((a) => a.sim.s.lit && a.sim.s.burnTime > 2.2); C.setCam("booster"); C.advance(0.3, 30); });
if (want("05")) await shot("05-tower-cam-final-approach.png", () => { const C = window.__chop; C.startGame("catch", 110); C.ap(true); C.until((a) => a.sim.s.lit && a.sim.s.y < 175); C.setCam("tower"); C.advance(0.3, 30); });
if (want("06")) await shot("06-result.png", () => { const C = window.__chop; C.startGame("catch", 110); C.ap(true); C.until((a) => a.state === "result"); C.ap(false); window.__chop.app.usedAP = false; document.getElementById("r-save").style.display = "flex"; document.getElementById("r-meas").textContent = document.getElementById("r-meas").textContent.replace(" · autopilot flew (unranked)", ""); C.advance(0.2, 30); });
if (want("07")) await shot("07-slowmo-replay.png", () => { const C = window.__chop; C.startReplay(); C.until((a) => a.replay && a.replay.t > a.outcomeAt - 0.25, 30); C.advance(0.1, 30); });
if (want("08")) await shot("08-ship-flip.png", () => { const C = window.__chop; C.startGame("ship", 12); C.ap(true); C.until((a) => a.sim.s.lit && a.sim.s.burnTime > 1.4); C.setCam("chase"); C.advance(0.2, 30); });
if (want("09")) await shot("09-ship-splashdown-buoy-cam.png", () => { const C = window.__chop; C.startGame("ship", 12); C.ap(true); C.until((a) => a.sim.s.phase !== "flight"); C.setCam("buoy"); C.advance(0.5, 30); });
if (want("10")) await shot("10-no-legs-crash.png", () => { const C = window.__chop; C.startGame("catch", 21); C.until((a) => a.sim.s.phase !== "flight"); C.setCam("tower"); C.advance(0.35, 30); });
console.log("errors:", errors);
await browser.close();
