import { createSim, step } from "../src/sim.js";
for (const mode of ["catch","ship"]) for (const st of [1,-1]) {
  const sim = createSim(mode, 5, {windScale:0}); sim.s.x=0; sim.s.vx=0;
  for (let i=0;i<120*6;i++) step(sim,{throttle:0,steer:st});
  console.log(mode,"coast steer",st,"vx",sim.s.vx.toFixed(2),"x",sim.s.x.toFixed(1),"th",(sim.s.th*57.3).toFixed(1),"vy",sim.s.vy.toFixed(1),"y",sim.s.y.toFixed(0));
  const s2 = createSim(mode, 5, {windScale:0}); s2.s.x=0; s2.s.vx=0; s2.s.y=800; s2.s.vy=-10; s2.s.th=0;
  for (let i=0;i<120*4;i++) step(s2,{throttle:0.25,steer:st});
  console.log(mode,"powered steer",st,"vx",s2.s.vx.toFixed(2),"th",(s2.s.th*57.3).toFixed(1),"gimbal",(s2.s.gimbal*57.3).toFixed(1),"vy",s2.s.vy.toFixed(1));
}
