// Bundle src/ -> web/game.js (IIFE, three.js vendored from node_modules) and inline everything into dist/chopsticks-snapshot.html
import { build } from "esbuild";
import fs from "fs";
await build({ entryPoints: ["src/main.js"], bundle: true, format: "iife", minify: true, target: "es2020", outfile: "web/game.js", legalComments: "eof", logLevel: "warning" });
const html = fs.readFileSync("web/index.html", "utf8");
const css = fs.readFileSync("web/style.css", "utf8");
const js = fs.readFileSync("web/game.js", "utf8").replace(/<\/script/gi, "<\\/script");
const out = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>${css}</style>`).replace('<script src="game.js"></script>', () => `<script>${js}</script>`);  // function replacers: minified JS contains "$&"
fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync("dist/chopsticks-snapshot.html", out);
console.log("web/game.js", fs.statSync("web/game.js").size, "bytes; dist/chopsticks-snapshot.html", fs.statSync("dist/chopsticks-snapshot.html").size, "bytes");
