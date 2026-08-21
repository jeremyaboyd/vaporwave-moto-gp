// Keyboard + mouse + touch input, normalized into a single control state.

export const controls = {
  accel: false,
  brake: false,
  left: false,
  right: false,
  boost: false,
  lookX: 0,   // -1..1, mouse position relative to screen center
  lookY: 0,
  steerAxis: null,     // analog -1..1 from tilt (null when tilt inactive)
  throttleAxis: null,  // analog -1..1 from tilt: + accelerates, - brakes
};

// --- Control mode preference (mobile): tilt sensing vs on-screen buttons ---
const MODE_KEY = 'neon-nightrider-controls';
export function getControlMode() { return localStorage.getItem(MODE_KEY) || 'tilt'; }
export function setControlMode(mode) {
  localStorage.setItem(MODE_KEY, mode);
  applyControlMode();
}
function applyControlMode() {
  if (getControlMode() === 'buttons') {
    document.body.classList.remove('tilt-on');
    controls.steerAxis = null;
    controls.throttleAxis = null;
  } else if (tilt.active) {
    document.body.classList.add('tilt-on');
    tilt.wantCalibrate = true;
  }
}

// --- Accelerometer tilt (mobile) ---
// Tilt right to steer right, tilt forward/back for throttle/brake.
export const tilt = {
  supported: typeof DeviceOrientationEvent !== 'undefined',
  active: false,
  status: 'idle',       // idle | waiting | active | denied | unavailable
  neutralPitch: null,   // captured at run start so the holding angle is neutral
  wantCalibrate: false,
};

const tiltStatusHandlers = [];
export function onTiltStatus(fn) { tiltStatusHandlers.push(fn); }
function setTiltStatus(s) {
  if (tilt.status === s) return;
  tilt.status = s;
  tiltStatusHandlers.forEach(f => f(s));
}

const STEER_FULL = 22;    // degrees of roll for full lean
const PITCH_FULL = 13;    // degrees from neutral for full throttle/brake

function onOrientation(e) {
  if (e.beta === null || e.gamma === null) return;
  if (getControlMode() === 'buttons') {
    // sensor stays warm but the player chose buttons — don't drive the bike
    if (!tilt.active) { tilt.active = true; clearTimeout(tiltWaitTimer); setTiltStatus('active'); }
    return;
  }
  if (!tilt.active) {
    tilt.active = true;
    clearTimeout(tiltWaitTimer);
    document.body.classList.add('tilt-on'); // swaps button UI for tilt UI
    setTiltStatus('active');
  }
  // remap device axes by screen rotation so landscape works too
  const angle = (screen.orientation && screen.orientation.angle) ?? (window.orientation || 0);
  let roll, pitch; // roll: screen-right-edge down = +; pitch: top-toward-face = +
  switch (angle) {
    case 90: roll = e.beta; pitch = -e.gamma; break;
    case 180: roll = -e.gamma; pitch = -e.beta; break;
    case 270: case -90: roll = -e.beta; pitch = e.gamma; break;
    default: roll = e.gamma; pitch = e.beta;
  }
  if (tilt.wantCalibrate || tilt.neutralPitch === null) {
    tilt.neutralPitch = pitch;
    tilt.wantCalibrate = false;
  }
  controls.steerAxis = Math.max(-1, Math.min(1, roll / STEER_FULL));
  // tilting the top away from you (pitch drops below neutral) accelerates
  controls.throttleAxis = Math.max(-1, Math.min(1, (tilt.neutralPitch - pitch) / PITCH_FULL));
}

let tiltListening = false;
let tiltAbsListening = false;
let tiltWaitTimer = null;

export async function enableTilt() {
  if (tilt.active) return true;
  if (!tilt.supported) { setTiltStatus('unavailable'); return false; }
  try {
    // iOS gates orientation events behind a permission prompt (needs a user gesture)
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      const res = await DeviceOrientationEvent.requestPermission();
      if (res !== 'granted') { setTiltStatus('denied'); return false; }
    }
  } catch {
    // thrown when called outside a clean user gesture — the next tap retries
    setTiltStatus('denied');
    return false;
  }
  if (!tiltListening) {
    tiltListening = true;
    window.addEventListener('deviceorientation', onOrientation);
  }
  setTiltStatus('waiting');
  // no events after a moment? try the absolute variant, then fall back to buttons
  clearTimeout(tiltWaitTimer);
  tiltWaitTimer = setTimeout(() => {
    if (tilt.active) return;
    if (!tiltAbsListening) {
      tiltAbsListening = true;
      window.addEventListener('deviceorientationabsolute', onOrientation);
    }
    tiltWaitTimer = setTimeout(() => {
      if (!tilt.active) setTiltStatus('unavailable');
    }, 1500);
  }, 1500);
  return true;
}

export function calibrateTilt() { tilt.wantCalibrate = true; }

const startHandlers = [];
const restartHandlers = [];
export function onStart(fn) { startHandlers.push(fn); }
export function onRestart(fn) { restartHandlers.push(fn); }

const KEYMAP = {
  KeyW: 'accel', ArrowUp: 'accel',
  KeyS: 'brake', ArrowDown: 'brake',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

window.addEventListener('keydown', (e) => {
  const c = KEYMAP[e.code];
  if (c) { controls[c] = true; e.preventDefault(); }
  if (e.code === 'Space') { controls.boost = true; e.preventDefault(); }
  if (e.code === 'Enter') startHandlers.forEach(f => f());
  if (e.code === 'KeyR') restartHandlers.forEach(f => f());
});
window.addEventListener('keyup', (e) => {
  const c = KEYMAP[e.code];
  if (c) controls[c] = false;
  if (e.code === 'Space') controls.boost = false;
});

window.addEventListener('mousemove', (e) => {
  // taps synthesize mousemove on phones, which would jerk the camera around —
  // mouse-look is desktop-only
  if (document.body.classList.contains('touch')) return;
  controls.lookX = (e.clientX / window.innerWidth) * 2 - 1;
  controls.lookY = (e.clientY / window.innerHeight) * 2 - 1;
});

// --- Touch ---
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');

function bindTouch(id, prop) {
  const el = document.getElementById(id);
  if (!el) return;
  const down = (e) => { e.preventDefault(); controls[prop] = true; el.classList.add('held'); };
  const up = (e) => { e.preventDefault(); controls[prop] = false; el.classList.remove('held'); };
  el.addEventListener('touchstart', down, { passive: false });
  el.addEventListener('touchend', up, { passive: false });
  el.addEventListener('touchcancel', up, { passive: false });
}
bindTouch('t-gas', 'accel');
bindTouch('t-boost', 'boost');
bindTouch('t-brake', 'brake');
bindTouch('t-left', 'left');
bindTouch('t-right', 'right');

// On touch devices start/restart is ONLY the PLAY button — and tilt permission
// is requested inside that button's gesture (see main.js), never on stray taps.
const INTERACTIVE = '.tbtn, .mbtn, #shop, #hs-panel, #initials-entry';

// Desktop click off the UI restarts after a crash. Touch devices skip this —
// taps synthesize mouse events, and mobile restarts only via the PLAY button.
window.addEventListener('mousedown', (e) => {
  if (document.body.classList.contains('touch')) return;
  if (e.target.closest && e.target.closest(INTERACTIVE)) return;
  restartHandlers.forEach(f => f());
});
