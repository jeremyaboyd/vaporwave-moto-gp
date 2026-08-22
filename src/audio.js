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

// --- music: one song per biome, crossfaded on the biome blend ---------------
// All songs share one 96 BPM sixteenth-note grid so handoffs stay beat-aligned.
// Each song plays into its own gain bus; the outgoing song fades to silence by
// the transition midpoint before the incoming one fades up, so the keys never
// clash out loud.

const BPM = 96;
const STEP = 60 / BPM / 4; // sixteenth
const SONGS = {
  'NEON CITY': { // the original tune: bouncy Am–F–C–G with an A/B arp
    chords: [
      { root: 45, triad: [57, 60, 64] }, // Am
      { root: 41, triad: [57, 60, 65] }, // F
      { root: 48, triad: [55, 60, 64] }, // C
      { root: 43, triad: [55, 59, 62] }, // G
    ],
    bassEvery: 2, pad: 0.1, arp: { wave: 'square', gain: 0.13, mode: 'ab' }, drums: 'full',
  },
  'DESERT HIGHWAY': { // slower-feeling Dm–Bb–F–A with a raised-third tinge
    chords: [
      { root: 38, triad: [57, 62, 65] }, // Dm
      { root: 46, triad: [58, 62, 65] }, // Bb
      { root: 41, triad: [57, 60, 65] }, // F
      { root: 45, triad: [57, 61, 64] }, // A
    ],
    bassEvery: 4, pad: 0.13, arp: { wave: 'square', gain: 0.1, mode: 'ab' }, drums: 'half',
  },
  'COASTAL ROAD': { // sunny C–G–Am–F, triangle lead, brushed hats
    chords: [
      { root: 48, triad: [55, 60, 64] }, // C
      { root: 43, triad: [55, 59, 62] }, // G
      { root: 45, triad: [57, 60, 64] }, // Am
      { root: 41, triad: [57, 60, 65] }, // F
    ],
    bassEvery: 2, pad: 0.12, arp: { wave: 'triangle', gain: 0.22, mode: 'eighths' }, drums: 'soft',
  },
  'DOWNTOWN': { // driving Bm–G–D–A, sixteenth arps the whole way
    chords: [
      { root: 47, triad: [59, 62, 66] }, // Bm
      { root: 43, triad: [55, 59, 62] }, // G
      { root: 38, triad: [57, 62, 66] }, // D
      { root: 45, triad: [57, 61, 64] }, // A
    ],
    bassEvery: 2, pad: 0.08, arp: { wave: 'square', gain: 0.12, mode: 'drive' }, drums: 'full',
  },
  'NIGHT BRIDGE': { // sparse Em–C–G–D, long pads, no percussion
    chords: [
      { root: 40, triad: [55, 59, 64] }, // Em
      { root: 48, triad: [55, 60, 64] }, // C
      { root: 43, triad: [55, 59, 62] }, // G
      { root: 38, triad: [54, 57, 62] }, // D
    ],
    bassEvery: 8, pad: 0.16, arp: { wave: 'triangle', gain: 0.18, mode: 'sparse' }, drums: 'none',
  },
};
const DEFAULT_SONG = 'NEON CITY';

let step = 0, nextT = 0;
let biomeA = DEFAULT_SONG, biomeB = DEFAULT_SONG, biomeT = 0;

const songBuses = new Map();
function songBus(name) {
  let bus = songBuses.get(name);
  if (!bus) {
    bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(musicBus);
    songBuses.set(name, bus);
  }
  return bus;
}

// driven from the biome blend every frame (fog and music fade together)
export function setBiome(a, b, t) {
  biomeA = SONGS[a] ? a : DEFAULT_SONG;
  biomeB = SONGS[b] ? b : DEFAULT_SONG;
  biomeT = t;
  if (!ctx) return;
  // sequential fade: A is gone by t=0.5, B rises after
  const gA = Math.min(1, Math.max(0, 1 - biomeT * 2));
  const gB = Math.min(1, Math.max(0, biomeT * 2 - 1));
  for (const [name, bus] of songBuses) {
    const g = name === biomeA ? gA : name === biomeB ? gB : 0;
    bus.gain.setTargetAtTime(g, ctx.currentTime, 0.35);
  }
}

function scheduleSongStep(song, step, t, bus) {
  const bar = Math.floor(step / 16) % song.chords.length;
  const phrase = Math.floor(step / 64) % 2; // 4-bar A/B alternation
  const s = step % 16;
  const { root, triad } = song.chords[bar];

  // bass: root notes bouncing up an octave mid-pattern
  if (s % song.bassEvery === 0) {
    const up = song.bassEvery <= 2 ? (s % 4 === 2 ? 12 : 0) : (s % 8 === 4 ? 12 : 0);
    voice('triangle', midi(root + up), t, STEP * song.bassEvery * 0.9, 0.5, bus);
  }
  // pad: one soft sustained triad per bar
  if (s === 0) {
    for (const n of triad) voice('triangle', midi(n), t, STEP * 15, song.pad, bus, 0.35);
  }
  // arp lead
  const a = song.arp;
  const drive = a.mode === 'drive' || (a.mode === 'ab' && phrase === 1);
  const every = a.mode === 'sparse' ? 4 : drive ? 1 : 2;
  if (s % every === 0) {
    const idx = [0, 1, 2, 1][(s / every) % 4];
    const oct = drive && s >= 8 ? 24 : 12;
    voice(a.wave, midi(triad[idx] + oct), t, STEP * every * 0.9, a.gain, bus);
  }
  // percussion
  if (song.drums === 'full') {
    if (s % 2 === 0) noise(t, 0.03, 0.05, 7000, bus);
    if (s === 4 || s === 12) noise(t, 0.09, 0.14, 1800, bus);
  } else if (song.drums === 'half') {
    if (s % 4 === 0) noise(t, 0.03, 0.04, 6000, bus);
    if (s === 8) noise(t, 0.09, 0.13, 1600, bus);
  } else if (song.drums === 'soft') {
    if (s % 4 === 0) noise(t, 0.025, 0.035, 7500, bus);
  }
}

function startMusic() {
  step = 0;
  nextT = ctx.currentTime + 0.05;
  setInterval(() => {
    if (ctx.state !== 'running') { nextT = ctx.currentTime + 0.05; return; }
    while (nextT < ctx.currentTime + 0.12) {
      // only songs whose bus is (becoming) audible get scheduled
      if (biomeT < 0.55) scheduleSongStep(SONGS[biomeA], step, nextT, songBus(biomeA));
      if (biomeT > 0.45) scheduleSongStep(SONGS[biomeB], step, nextT, songBus(biomeB));
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
