// All sound is synthesized with WebAudio at runtime: no audio files.
export class Sound {
  constructor() { this.ctx = null; this.muted = false; }
  init() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let b = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = b * 3.5 + w * 0.15; } // brown-ish noise
    this.noise = buf;
    // engine: rumble + roar + crackle
    this.eng = c.createGain(); this.eng.gain.value = 0; this.eng.connect(this.master);
    const n1 = this.loop(); this.engLP = c.createBiquadFilter(); this.engLP.type = "lowpass"; this.engLP.frequency.value = 300; n1.connect(this.engLP).connect(this.eng);
    const sub = c.createOscillator(); sub.type = "sawtooth"; sub.frequency.value = 38; const subLP = c.createBiquadFilter(); subLP.type = "lowpass"; subLP.frequency.value = 90; const sg = c.createGain(); sg.gain.value = 0.35; sub.connect(subLP).connect(sg).connect(this.eng); sub.start();
    const n2 = this.loop(); const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1800; this.crackle = c.createGain(); this.crackle.gain.value = 0; n2.connect(hp).connect(this.crackle).connect(this.eng);
    // wind
    const n3 = this.loop(); this.windBP = c.createBiquadFilter(); this.windBP.type = "bandpass"; this.windBP.Q.value = 0.7; this.windBP.frequency.value = 400;
    this.wind = c.createGain(); this.wind.gain.value = 0; n3.connect(this.windBP).connect(this.wind).connect(this.master);
  }
  loop() { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.loopStart = Math.random(); s.start(0, Math.random() * 1.5); return s; }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05); }
  update(thr, speed, q, slow = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this.eng.gain.setTargetAtTime(thr > 0.01 ? (0.25 + thr * 0.75) * slow : 0, t, 0.08);
    this.engLP.frequency.setTargetAtTime((180 + thr * 900) * (0.6 + 0.4 * slow), t, 0.1);
    this.crackle.gain.setTargetAtTime(thr > 0.01 ? (0.04 + 0.1 * thr) * (0.6 + 0.4 * Math.random()) : 0, t, 0.02);
    this.wind.gain.setTargetAtTime(Math.min(0.5, q / 40000) * slow + Math.min(0.08, speed / 300), t, 0.2);
    this.windBP.frequency.setTargetAtTime(250 + Math.min(1800, speed * 7), t, 0.2);
  }
  burst({ dur = 0.6, freq = 200, type = "lowpass", gain = 1, q = 0.8, delay = 0 }) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noise; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  tone(freq, dur, { type = "sine", gain = 0.3, delay = 0, slide = 0 } = {}) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  sonicBoom() { this.burst({ dur: 0.9, freq: 140, gain: 1.6 }); this.tone(55, 0.6, { gain: 0.6, slide: 0.5 }); this.burst({ dur: 0.9, freq: 160, gain: 1.4, delay: 0.32 }); this.tone(50, 0.6, { gain: 0.5, slide: 0.5, delay: 0.32 }); }
  ignition() { this.burst({ dur: 0.5, freq: 600, gain: 0.9 }); this.tone(90, 0.4, { type: "sawtooth", gain: 0.25, slide: 0.6 }); }
  clank() {
    this.burst({ dur: 0.25, freq: 2400, type: "bandpass", q: 3, gain: 1.2 });
    [196, 233, 311, 466].forEach((f, i) => this.tone(f, 1.4 - i * 0.2, { type: i % 2 ? "triangle" : "square", gain: 0.07, delay: 0.01 * i }));
    this.burst({ dur: 0.7, freq: 120, gain: 1.1, delay: 0.02 });
  }
  armsMove() { this.tone(70, 1.0, { type: "sawtooth", gain: 0.08, slide: 1.5 }); this.burst({ dur: 0.9, freq: 900, type: "bandpass", q: 6, gain: 0.25 }); }
  boom() { this.burst({ dur: 2.6, freq: 260, gain: 2.2 }); this.burst({ dur: 1.2, freq: 1200, gain: 0.6 }); this.tone(60, 1.8, { type: "sawtooth", gain: 0.5, slide: 0.3 }); }
  splash() { this.burst({ dur: 1.6, freq: 1400, type: "bandpass", q: 0.6, gain: 1.0 }); this.burst({ dur: 0.8, freq: 200, gain: 0.8 }); }
  win(score) { const notes = score >= 900 ? [523, 659, 784, 1047, 1319] : [523, 659, 784, 1047]; notes.forEach((f, i) => this.tone(f, 0.5, { type: "triangle", gain: 0.12, delay: 0.11 * i })); }
  beep(f = 880) { this.tone(f, 0.08, { type: "square", gain: 0.05 }); }
  gust() { this.burst({ dur: 1.4, freq: 700, type: "bandpass", q: 1.2, gain: 0.35 }); }
}
