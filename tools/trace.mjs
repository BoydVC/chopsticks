import { createSim, step, autopilot, refHeight, refX } from "../src/sim.js";
const sim = createSim(process.argv[2]||"catch", +(process.argv[3]||1)); let k=0;
while (sim.s.phase==="flight" && sim.s.t<150) { const c=autopilot(sim); if (k++%60===0) { const s=sim.s; console.log(s.t.toFixed(1),"h",refHeight(sim).toFixed(0),"x",refX(sim).toFixed(1),"vx",s.vx.toFixed(1),"vy",s.vy.toFixed(1),"th",(s.th*57.3).toFixed(1),"thr",s.thr.toFixed(2),"cmd",c.throttle.toFixed(2),c.steer.toFixed(2),"w",sim.windNow.toFixed(1),"burn",!!sim._ap?.burning);} step(sim,c); }
console.log(sim.result);
