// Headless capture helper: screenshots (1440x900) + GIF frames, driven deterministically via window.__chop.advance
import puppeteer from "puppeteer-core";
import fs from "fs";
const BASE = process.env.BASE || "http://127.0.0.1:4242/";
export async function open(query = "", w = 1440, h = 900) {
  const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required", `--window-size=${w},${h}`] });
  const page = await browser.newPage(); await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  const errors = []; page.on("pageerror", (e) => errors.push(String(e))); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(BASE + "?capture=1" + query, { waitUntil: "load", timeout: 180000 });
  page.setDefaultTimeout(600000);
  await page.waitForFunction("window.__chop && window.__chop.ready", { timeout: 180000 });
  return { browser, page, errors };
}
if (process.argv[1].endsWith("capture.mjs")) {
  const { browser, page, errors } = await open(process.argv[2] || "");
  await page.evaluate(() => window.__chop.advance(+new URLSearchParams(location.search).get("adv") || 2));
  await page.screenshot({ path: "/tmp/chop-test.png" });
  console.log(JSON.stringify(await page.evaluate(() => window.__chop.state())), errors);
  await browser.close();
}
