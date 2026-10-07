import { open } from "./capture.mjs";
const [seed, cam, extra, out] = process.argv.slice(2);
const { browser, page, errors } = await open(`&seed=${seed}`);
const t0 = Date.now();
await page.evaluate((cam, extra) => { const C = window.__chop; C.until((a) => a.sim.s.phase !== "flight"); if (cam) C.setCam(cam); C.advance(+extra, 60); }, cam, extra);
await page.screenshot({ path: out });
console.log(JSON.stringify(await page.evaluate(() => window.__chop.state())), errors, Date.now() - t0, "ms");
await browser.close();
