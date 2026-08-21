// Keyboard + mouse + touch input, normalized into a single control state.

export const controls = {
  accel: false,
  brake: false,
  left: false,
  right: false,
  boost: false,
  lookX: 0,   // -1..1, mouse position relative to screen center
  lookY: 0,
};

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

// Tap anywhere (not on a control button) starts / restarts on touch devices.
window.addEventListener('touchstart', (e) => {
  if (e.target.closest && e.target.closest('.tbtn')) return;
  startHandlers.forEach(f => f());
  restartHandlers.forEach(f => f());
}, { passive: true });

// Click also starts (desktop menu).
window.addEventListener('mousedown', () => startHandlers.forEach(f => f()));
