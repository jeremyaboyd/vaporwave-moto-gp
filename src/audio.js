// 8-bit synth audio — Web Audio only, no samples. A PC-speaker-style square/
// triangle chiptune loop over a vaporwave turnaround, an engine hum tied to
// speed, and one-shot SFX. Everything waits for the first user gesture (iOS).

let ctx = null;
let master, musicBus, sfxBus;
let engine = null;
let started = false;
let muted = localStorage.getItem('nn-muted') === '1';

const MASTER_LEVEL = 0.5;
const MUSIC_LEVEL = 0.4;

const muteHandlers = [];
export function onMuteChange(fn) { muteHandlers.push(fn); }
export function isMuted() { return muted; }
export function toggleMute() {
  muted = !muted;
  localStorage.setItem('nn-muted', muted ? '1' : '0');
  if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER_LEVEL, ctx.currentTime, 0.02);
  for (const fn of muteHandlers) fn(muted);
}

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

function ensureCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_LEVEL;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_LEVEL;
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.8;
    sfxBus.connect(master);
    buildEngine();
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export function unlock() {
  ensureCtx();
  if (!started) { started = true; startMusic(); }
}

// any first gesture arms the audio stack; later gestures just re-resume iOS
for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
  window.addEventListener(ev, () => unlock(), { passive: true });
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM' && e.target.tagName !== 'INPUT') toggleMute();
});

// --- tiny synth voices ------------------------------------------------------

function voice(type, freq, t, dur, peak, bus = musicBus, attack = 0.008) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

let noiseBuf = null;
function noise(t, dur, peak, cutoff, bus = musicBus) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(bus);
  s.start(t);
  s.stop(t + dur + 0.05);
}

// --- music: lookahead sequencer over an Am–F–C–G turnaround -----------------

const BPM = 96;
const STEP = 60 / BPM / 4; // sixteenth
const CHORDS = [
  { root: 45, triad: [57, 60, 64] }, // Am
  { root: 41, triad: [57, 60, 65] }, // F
  { root: 48, triad: [55, 60, 64] }, // C
  { root: 43, triad: [55, 59, 62] }, // G
];
let step = 0, nextT = 0;

function scheduleStep(step, t) {
  const bar = Math.floor(step / 16) % 4;
  const phrase = Math.floor(step / 64) % 2; // 4-bar A/B alternation
  const s = step % 16;
  const { root, triad } = CHORDS[bar];

  // bass: eighth notes bouncing between root octaves
  if (s % 2 === 0) {
    voice('triangle', midi(s % 4 === 2 ? root + 12 : root), t, STEP * 1.8, 0.5);
  }
  // pad: one soft sustained triad per bar
  if (s === 0) {
    for (const n of triad) voice('triangle', midi(n), t, STEP * 15, 0.1, musicBus, 0.35);
  }
  // arp lead: sparse eighths in the A phrase, driving sixteenths in the B phrase
  if (phrase === 1 || s % 2 === 0) {
    const idx = [0, 1, 2, 1][Math.floor(s / (phrase ? 1 : 2)) % 4];
    const oct = phrase && s >= 8 ? 24 : 12;
    voice('square', midi(triad[idx] + oct), t, STEP * 0.9, 0.13);
  }
  // percussion: noise hats on eighths, snare thump on the backbeats
  if (s % 2 === 0) noise(t, 0.03, 0.05, 7000);
  if (s === 4 || s === 12) noise(t, 0.09, 0.14, 1800);
}

function startMusic() {
  step = 0;
  nextT = ctx.currentTime + 0.05;
  setInterval(() => {
    if (ctx.state !== 'running') { nextT = ctx.currentTime + 0.05; return; }
    while (nextT < ctx.currentTime + 0.12) {
      scheduleStep(step, nextT);
      step++;
      nextT += STEP;
    }
  }, 25);
}

// dip the music under a big moment, then ease back in
function duck(depth = 0.2, hold = 0.5) {
  const g = musicBus.gain;
  g.cancelScheduledValues(ctx.currentTime);
  g.setValueAtTime(MUSIC_LEVEL * depth, ctx.currentTime);
  g.setTargetAtTime(MUSIC_LEVEL, ctx.currentTime + hold, 0.6);
}

// --- engine hum -------------------------------------------------------------

function buildEngine() {
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.value = 34;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 260;
  lp.Q.value = 2;
  const g = ctx.createGain();
  g.gain.value = 0;
  o.connect(lp).connect(g).connect(master);
  o.start();
  engine = { o, lp, g };
}

let wasBoosting = false;
export function setEngine(speed01, boosting, riding) {
  if (!engine) return;
  const t = ctx.currentTime;
  const on = riding && speed01 > 0.01;
  engine.g.gain.setTargetAtTime(on ? 0.03 + speed01 * 0.03 + (boosting ? 0.02 : 0) : 0, t, 0.08);
  engine.o.frequency.setTargetAtTime(34 + speed01 * 96 + (boosting ? 22 : 0), t, 0.06);
  engine.lp.frequency.setTargetAtTime(240 + speed01 * 520, t, 0.1);
  if (boosting && !wasBoosting && ctx) {
    const o = voice('square', 220, t, 0.32, 0.18, sfxBus);
    o.frequency.exponentialRampToValueAtTime(880, t + 0.3);
  }
  wasBoosting = boosting;
}

// --- one-shot SFX -----------------------------------------------------------

export function coin() {
  if (!ctx) return;
  const t = ctx.currentTime;
  voice('square', midi(83), t, 0.06, 0.22, sfxBus);
  voice('square', midi(88), t + 0.06, 0.14, 0.22, sfxBus);
}

export function fanfare() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [76, 80, 83, 88].forEach((n, i) => voice('square', midi(n), t + i * 0.09, 0.16, 0.2, sfxBus));
}

export function armorHit() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = voice('square', 160, t, 0.25, 0.28, sfxBus);
  o.frequency.exponentialRampToValueAtTime(55, t + 0.22);
  noise(t, 0.15, 0.2, 2500, sfxBus);
}

export function crash() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(t, 0.55, 0.5, 3200, sfxBus);
  const o = voice('square', 220, t, 0.6, 0.3, sfxBus);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.55);
  duck(0.12, 1.2);
}
