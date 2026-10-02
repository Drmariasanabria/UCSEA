// Procedural sound effects (Web Audio). No audio files needed.
// All sounds are synthesised so the app works offline and loads instantly.

let ctx = null;
let master = null;
let enabled = true;
let ambientNodes = null;
const loops = new Map(); // alarm id -> { stop }

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setSoundEnabled(on) {
  enabled = !!on;
  if (!enabled) {
    stopAllAlarms();
    stopAmbient();
  }
}
export const soundEnabled = () => enabled;
export function setVolume(v) { ac(); if (master) master.gain.value = v; }

// Browsers require a user gesture before audio: unlock on first interaction.
export function unlockAudio() {
  const once = () => { ac(); window.removeEventListener('pointerdown', once); window.removeEventListener('keydown', once); };
  window.addEventListener('pointerdown', once);
  window.addEventListener('keydown', once);
}

function tone({ freq = 440, type = 'sine', dur = 0.15, vol = 0.3, at = 0, attack = 0.005, release = 0.08, slideTo, dest }) {
  const c = ac();
  if (!c || !enabled) return;
  const t0 = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.setValueAtTime(vol, t0 + Math.max(attack, dur - release));
  g.gain.linearRampToValueAtTime(0, t0 + dur);
  o.connect(g).connect(dest || master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noiseBuffer(c, seconds = 1) {
  const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function noise({ dur = 0.2, vol = 0.2, at = 0, freq = 2000, q = 0.8, type = 'bandpass' }) {
  const c = ac();
  if (!c || !enabled) return;
  const t0 = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, Math.max(0.1, dur));
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

// ---------- one-shot effects ----------
export const sfx = {
  click: () => tone({ freq: 1800, type: 'square', dur: 0.03, vol: 0.06 }),
  tick: () => tone({ freq: 2600, type: 'sine', dur: 0.02, vol: 0.04 }),
  hover: () => tone({ freq: 1200, type: 'sine', dur: 0.03, vol: 0.025 }),
  ping: () => { tone({ freq: 1300, dur: 0.9, vol: 0.12, release: 0.85, slideTo: 1100 }); },
  sonar: () => { tone({ freq: 880, dur: 1.4, vol: 0.14, release: 1.3 }); tone({ freq: 1760, dur: 0.6, vol: 0.04, release: 0.5 }); },
  squelch: () => noise({ dur: 0.22, vol: 0.18, freq: 2400, q: 0.4 }),
  // short noise burst + "roger beep" used when someone releases PTT
  radioOut: () => { noise({ dur: 0.12, vol: 0.12, freq: 2500, q: 0.5 }); tone({ freq: 1400, type: 'square', dur: 0.07, vol: 0.05, at: 0.12 }); },
  radioIn: () => { noise({ dur: 0.18, vol: 0.14, freq: 2200, q: 0.5 }); tone({ freq: 1000, type: 'sine', dur: 0.05, vol: 0.05, at: 0.05 }); },
  success: () => { [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.16, vol: 0.12, at: i * 0.07 })); },
  error: () => { tone({ freq: 180, type: 'sawtooth', dur: 0.22, vol: 0.12 }); tone({ freq: 140, type: 'sawtooth', dur: 0.28, vol: 0.1, at: 0.18 }); },
  notify: () => { tone({ freq: 988, dur: 0.12, vol: 0.1 }); tone({ freq: 1319, dur: 0.18, vol: 0.1, at: 0.1 }); },
  whoosh: () => noise({ dur: 0.45, vol: 0.08, freq: 600, q: 0.3, type: 'lowpass' }),
  bell: (strikes = 2) => {
    for (let i = 0; i < strikes; i++) {
      const at = Math.floor(i / 2) * 0.9 + (i % 2) * 0.32;
      [1, 2.76, 5.4].forEach((m, k) => tone({ freq: 620 * m, dur: 1.6, vol: 0.12 / (k + 1), at, attack: 0.002, release: 1.5 }));
    }
  },
  horn: (dur = 1.6) => {
    tone({ freq: 110, type: 'sawtooth', dur, vol: 0.18, attack: 0.08, release: 0.2 });
    tone({ freq: 165, type: 'sawtooth', dur, vol: 0.1, attack: 0.08, release: 0.2 });
  },
  typing: () => noise({ dur: 0.03, vol: 0.05, freq: 4000, q: 1.2 }),
  boot: () => { tone({ freq: 220, dur: 0.6, vol: 0.12, slideTo: 880 }); noise({ dur: 0.5, vol: 0.05, freq: 900, q: 0.2, at: 0.1 }); },
};

// ---------- looping alarms ----------
// Each pattern schedules one cycle; the loop repeats until stopped.
const PATTERNS = {
  // General emergency alarm: 7 short + 1 long
  general: { cycle: 5.2, play: () => { for (let i = 0; i < 7; i++) tone({ freq: 800, type: 'square', dur: 0.32, vol: 0.12, at: i * 0.5 }); tone({ freq: 800, type: 'square', dur: 1.4, vol: 0.12, at: 3.6 }); } },
  fire: { cycle: 1.0, play: () => { for (let i = 0; i < 8; i++) tone({ freq: 950, type: 'square', dur: 0.05, vol: 0.09, at: i * 0.06 }); } },
  engine: { cycle: 1.2, play: () => { tone({ freq: 660, type: 'triangle', dur: 0.4, vol: 0.12 }); tone({ freq: 495, type: 'triangle', dur: 0.4, vol: 0.12, at: 0.5 }); } },
  collision: { cycle: 0.6, play: () => { tone({ freq: 1500, type: 'square', dur: 0.12, vol: 0.09 }); tone({ freq: 1500, type: 'square', dur: 0.12, vol: 0.09, at: 0.22 }); } },
  bnwas: { cycle: 2.0, play: () => { tone({ freq: 2000, dur: 0.18, vol: 0.08 }); } },
  dsc: { cycle: 1.0, play: () => { for (let i = 0; i < 4; i++) tone({ freq: i % 2 ? 1300 : 2200, dur: 0.125, vol: 0.08, at: i * 0.125 }); } },
  manoverboard: { cycle: 4.0, play: () => { for (let i = 0; i < 3; i++) tone({ freq: 700, type: 'square', dur: 0.9, vol: 0.12, at: i * 1.2 }); } },
  abandon: { cycle: 6.0, play: () => { for (let i = 0; i < 7; i++) tone({ freq: 760, type: 'square', dur: 0.3, vol: 0.13, at: i * 0.45 }); tone({ freq: 760, type: 'square', dur: 2.2, vol: 0.13, at: 3.3 }); } },
  caution: { cycle: 3.0, play: () => { tone({ freq: 880, dur: 0.25, vol: 0.08 }); tone({ freq: 880, dur: 0.25, vol: 0.08, at: 0.35 }); } },
};

export function startAlarm(id, pattern = 'caution') {
  if (!enabled || loops.has(id)) return;
  const p = PATTERNS[pattern] || PATTERNS.caution;
  p.play();
  const timer = setInterval(() => enabled && p.play(), p.cycle * 1000);
  loops.set(id, { stop: () => clearInterval(timer), pattern });
}

export function stopAlarm(id) {
  loops.get(id)?.stop();
  loops.delete(id);
}

export function stopAllAlarms() {
  loops.forEach((l) => l.stop());
  loops.clear();
}

export const activeAlarmIds = () => Array.from(loops.keys());
export const ALARM_PATTERNS = Object.keys(PATTERNS);

// ---------- ambience (engine hum + sea wash) ----------
export function startAmbient(level = 0.5) {
  const c = ac();
  if (!c || !enabled || ambientNodes) return;
  const g = c.createGain();
  g.gain.value = 0.0;
  g.gain.linearRampToValueAtTime(0.09 * level, c.currentTime + 2);
  g.connect(master);
  const hum = c.createOscillator();
  hum.type = 'sawtooth';
  hum.frequency.value = 42;
  const humF = c.createBiquadFilter();
  humF.type = 'lowpass';
  humF.frequency.value = 160;
  const humG = c.createGain();
  humG.gain.value = 0.35;
  hum.connect(humF).connect(humG).connect(g);
  const sea = c.createBufferSource();
  sea.buffer = noiseBuffer(c, 4);
  sea.loop = true;
  const seaF = c.createBiquadFilter();
  seaF.type = 'lowpass';
  seaF.frequency.value = 500;
  const seaG = c.createGain();
  seaG.gain.value = 0.5;
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.12;
  const lfoG = c.createGain();
  lfoG.gain.value = 0.35;
  lfo.connect(lfoG).connect(seaG.gain);
  sea.connect(seaF).connect(seaG).connect(g);
  hum.start(); sea.start(); lfo.start();
  ambientNodes = { g, stop: () => { try { hum.stop(); sea.stop(); lfo.stop(); } catch { /* already stopped */ } g.disconnect(); } };
}

export function setAmbientWeather(seaState = 3) {
  if (!ambientNodes || !ctx) return;
  ambientNodes.g.gain.linearRampToValueAtTime(0.05 + seaState * 0.012, ctx.currentTime + 1.5);
}

export function stopAmbient() {
  ambientNodes?.stop();
  ambientNodes = null;
}

// ---------- voice playback (AI voice) with an optional VHF radio chain ----------
let voiceOut = null;
export function audioContext() { return ac(); }
export function playVoiceBuffer(buffer, { radio = true } = {}) {
  const c = ac();
  if (!c) return { done: Promise.resolve(), stop() {} };
  if (!voiceOut) { voiceOut = c.createGain(); voiceOut.gain.value = 1; voiceOut.connect(c.destination); }
  const src = c.createBufferSource();
  src.buffer = buffer;
  const nodes = [];
  let last = src;
  const chain = (n) => { last.connect(n); last = n; nodes.push(n); return n; };
  let noise = null;
  if (radio) {
    // VHF voice band (~300–3200 Hz), presence peak, gentle saturation and compression
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 320; hp.Q.value = 0.8; chain(hp);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200; lp.Q.value = 0.8; chain(lp);
    const pk = c.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1800; pk.gain.value = 4; chain(pk);
    const ws = c.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 512) - 1; curve[i] = Math.tanh(2.2 * x) / Math.tanh(2.2); }
    ws.curve = curve; chain(ws);
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -24; comp.ratio.value = 4; chain(comp);
    const g = c.createGain(); g.gain.value = 0.9; chain(g);
    // background carrier hiss while transmitting
    const nb = c.createBuffer(1, c.sampleRate * 1, c.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    noise = c.createBufferSource(); noise.buffer = nb; noise.loop = true;
    const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 2200; nf.Q.value = 0.6;
    const ng = c.createGain(); ng.gain.value = 0.018;
    noise.connect(nf).connect(ng).connect(voiceOut);
  }
  last.connect(voiceOut);
  const done = new Promise((resolve) => { src.onended = () => { try { noise?.stop(); } catch {} resolve(); }; });
  noise?.start();
  src.start();
  return { done, stop() { try { src.stop(); } catch {} try { noise?.stop(); } catch {} } };
}
