// Gameplay GIF: autopilot-flown Booster Catch (seed 110) from the landing burn to the catch, HUD on, ~2x speed.
import { open } from "./capture.mjs";
import fs from "fs";
import { execSync } from "child_process";
const dir = "/tmp/chop-gif"; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
const { browser, page, errors } = await open("&seed=3", 960, 600);
await page.evaluate(() => { const C = window.__chop; C.startGame("catch", 110); C.ap(true); C.until((a) => a.sim.s.y < 1250); document.getElementById("hint").style.display = "none"; });
let i = 0, after = 0;
for (; i < 400; i++) {
  const st = await page.evaluate(() => { window.__chop.advance(0.2, 50); const a = window.__chop.app; return { done: !!a.sim.result, t: a.sim.s.t }; });
  await page.screenshot({ path: `${dir}/f${String(i).padStart(4, "0")}.png` });
  if (st.done && ++after > 20) break;
}
console.log("frames", i + 1, errors);
await browser.close();
execSync(`ffmpeg -y -loglevel error -framerate 12 -i ${dir}/f%04d.png -vf "scale=560:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" screenshots/gameplay.gif`);
console.log("screenshots/gameplay.gif", fs.statSync("screenshots/gameplay.gif").size);
