import * as THREE from 'three';
import { createSky } from './sky.js';
import { RoadManager } from './road.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { Obstacles } from './obstacles.js';
import { attachScenery } from './scenery.js';
import { Hud } from './hud.js';
import { Upgrades } from './upgrades.js';
import { Checkpoints } from './checkpoints.js';
import { Pickups } from './pickups.js';
import { Shop } from './shop.js';
import { School } from './school.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { biomeMixAt, lerpColor } from './biomes.js';
import { onStart, onRestart, calibrateTilt, onTiltStatus, getControlMode, setControlMode, enableTilt } from './input.js';

export const WORLD = {
  roadWidth: 26,
  laneXs: [-9.5, -4, 4, 9.5], // lanes 0,1 oncoming; 2,3 with traffic
  segmentLength: 60,
  segmentsAhead: 22,
  segmentsBehind: 3,
};

const REBASE_AT = -4000;
const REBASE_SHIFT = 4000;

const app = document.getElementById('app');

export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color('#05010d');
scene.fog = new THREE.Fog('#0a0318', 120, 620);

export const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 2200);
camera.position.set(0, 4.2, 10);

const updaters = [];
export function onUpdate(fn) { updaters.push(fn); }
const rebasers = [];
export function onRebase(fn) { rebasers.push(fn); }
const resetHandlers = [];
export function onReset(fn) { resetHandlers.push(fn); }

const sky = createSky(scene);

// World-space rebase bookkeeping: distance travelled d = zShift - z.
export const state = {
  zShift: 0,
  phase: 'menu',       // 'menu' | 'run' | 'shop' | 'school' | 'dead'
  timeAlive: 0,
  deadAt: 0,
  cash: 0,
  tutorial: false,     // suppresses traffic/hazard/shop spawning
};

export const hud = new Hud();
export const upgrades = new Upgrades();
export const checkpoints = new Checkpoints(hud);

export const road = new RoadManager(scene, WORLD, state);
export const player = new Player(scene);
export const traffic = new Traffic(scene, WORLD, road);
player.upgrades = upgrades;
onRebase((s) => traffic.rebase(s));
onReset(() => traffic.reset());
onUpdate((dt, alive) => traffic.update(dt, player, alive, (v) => damage(() => traffic.remove(v))));

export const obstacles = new Obstacles(scene, WORLD, road);
player.groundHeightAt = (x, z) => obstacles.groundHeightAt(x, z);
onRebase((s) => obstacles.rebase(s));
onReset(() => obstacles.reset());
onUpdate((dt, alive) => {
  obstacles.update(player, alive, (o) => damage(() => {
    if (o.median) player.x = player.x < 0 ? -2.8 : 2.8; // armor bounces you off the wall
    else obstacles.remove(o);
  }));
  obstacles.prune(player.z);
});

export const pickups = new Pickups(scene, WORLD, road, obstacles);
onRebase((s) => pickups.rebase(s));
onReset(() => pickups.reset());
onUpdate((dt, alive) => pickups.update(dt, player, alive, addCash));

export const shop = new Shop(scene, road, hud);
shop.hooks = {
  upgrades,
  getCash: () => state.cash,
  spend: (n) => { state.cash -= n; hud.setCash(state.cash, true); },
  onLeave: () => {
    if (state.phase === 'shop') {
      state.phase = 'run';
      player.speed = 25; // rolling start back onto the road
    }
  },
};
onRebase((s) => shop.rebase(s));
onReset(() => shop.reset());
onUpdate(() => {
  shop.update(player, state.phase === 'run');
  if (state.phase === 'run' && shop.open) state.phase = 'shop';
});

// checkpoint clock (only ticks in a real run — shop and school freeze it)
onUpdate((dt) => {
  if (state.phase === 'run') {
    const ok = checkpoints.update(dt, player, traffic, addCash);
    if (!ok) die('THE CLOCK RAN OUT');
  }
  hud.setTimer(checkpoints.timeLeft, state.phase === 'run' || state.phase === 'shop');
  hud.setBoost(player.boostMeter, upgrades.boostCap(), player.boosting);
  hud.setArmor(upgrades.armorLeft());
});

export const school = new School({
  player, obstacles, pickups, upgrades, hud, state, shop,
  onExit: () => {
    state.tutorial = false;
    resetWorld();
    player.reset();
    state.phase = 'menu';
    hud.showMenu();
  },
  // garage finale: straight into the real game (startRun opens the free pick)
  onGraduate: () => {
    state.tutorial = false;
    resetWorld();
    startRun();
  },
});
onUpdate((dt) => { if (state.phase === 'school') school.update(dt); });

attachScenery(road, WORLD);

// Fog / background follow the blended biome at the player's position.
const biomeNameEl = document.getElementById('biome-name');
onUpdate(() => {
  const mix = biomeMixAt(state.zShift - player.z);
  lerpColor(scene.fog.color, mix.a.fog, mix.b.fog, mix.t);
  scene.background.copy(scene.fog.color).multiplyScalar(0.55);
  if (biomeNameEl.textContent !== mix.name) biomeNameEl.textContent = mix.name;
});

onUpdate((dt) => hud.update(dt, player, traffic, state.phase === 'run', state.timeAlive));

export function addCash(n, source) {
  state.cash += n;
  hud.setCash(state.cash, true);
  if (source !== 'pickup' && source != null) hud.toast(`+$${n}`, 'money');
}

export function die(reason) {
  if (state.phase !== 'run') return;
  state.phase = 'dead';
  state.deadAt = performance.now();
  hud.showDeath(hud.score, reason);
}

// A crash: armor eats it (destroying what you hit), otherwise it's fatal.
export function damage(removeEntity) {
  if (state.phase !== 'run' || player.invulnT > 0) return;
  if (upgrades.armorLeft() > 0) {
    upgrades.useArmor();
    removeEntity();
    player.invulnT = 1.6;
    player.speed *= 0.45;
    hud.toast(`ARMOR TOOK THE HIT — ${upgrades.armorLeft()} LEFT`, 'warn');
    hud.setArmor(upgrades.armorLeft());
  } else {
    die();
  }
}

function startRun() {
  state.tutorial = false;
  player.reset();
  hud.reset();
  upgrades.reset();
  checkpoints.reset();
  state.cash = 0;
  hud.setCash(0, false);
  hud.setArmor(0);
  state.zShift = 0;
  state.timeAlive = 0;
  state.phase = 'run';
  calibrateTilt(); // however the phone is held right now becomes neutral
  player.snapCamera(camera); // hard cut — no visible lerp across the reset
  hud.hideOverlay();
  // every run opens in the garage: pick your one free upgrade, then ride
  state.phase = 'shop';
  shop.enterFree();
}

// Controls toggle (touch only): tilt sensing vs on-screen buttons
const btnControls = document.getElementById('btn-controls');
function refreshControlsUI() {
  const buttons = getControlMode() === 'buttons';
  btnControls.textContent = 'CONTROLS: ' + (buttons ? 'BUTTONS' : 'TILT');
  document.getElementById('tilt-status').style.display = buttons ? 'none' : '';
}
btnControls.addEventListener('click', () => {
  const next = getControlMode() === 'tilt' ? 'buttons' : 'tilt';
  setControlMode(next);
  if (next === 'tilt') { enableTilt(); calibrateTilt(); } // click gesture satisfies iOS
  refreshControlsUI();
});
refreshControlsUI();

const tiltStatusEl = document.getElementById('tilt-status');
onTiltStatus((s) => {
  if (s === 'active') { hud.toast('TILT CONTROLS ACTIVE', 'money'); calibrateTilt(); }
  else if (s === 'denied') hud.toast('MOTION ACCESS DENIED — TAP TO RETRY', 'warn');
  else if (s === 'unavailable') hud.toast('NO TILT SENSOR — USING BUTTONS', 'warn');
  const label = { waiting: 'TILT: LISTENING…', active: 'TILT: ACTIVE', denied: 'TILT: DENIED — TAP TO RETRY', unavailable: 'TILT: NO SENSOR' }[s];
  if (tiltStatusEl && label) tiltStatusEl.textContent = label;
});

function startSchool() {
  state.tutorial = true;
  resetWorld();
  player.reset();
  hud.reset();
  upgrades.reset();
  checkpoints.reset();
  state.cash = 0;
  hud.setCash(0, false);
  state.zShift = 0;
  state.timeAlive = 0;
  state.phase = 'school';
  calibrateTilt();
  player.snapCamera(camera);
  hud.hideOverlay();
  school.start();
}

document.getElementById('btn-play').addEventListener('click', () => {
  if (state.phase === 'menu') { resetWorld(); startRun(); }
  else if (state.phase === 'dead' && !hud.enteringInitials) { resetWorld(); startRun(); }
});
document.getElementById('btn-school').addEventListener('click', () => {
  if (state.phase === 'menu' || (state.phase === 'dead' && !hud.enteringInitials)) startSchool();
});

onStart(() => { if (state.phase === 'menu') { resetWorld(); startRun(); } });
onRestart(() => {
  // small delay so a panicked R/tap at the moment of death doesn't skip the score screen
  if (state.phase === 'dead' && !hud.enteringInitials && performance.now() - state.deadAt > 700) {
    resetWorld();
    startRun();
  }
});

hud.showMenu();

// Full world rebuild on restart: nuke all segments so traffic/obstacles respawn.
function resetWorld() {
  while (road.segments.length) road.disposeSegment(road.segments.shift());
  road.nextZ0 = WORLD.segmentLength * WORLD.segmentsBehind;
  for (const fn of resetHandlers) fn();
}

// Neon bloom (desktop only — mobile GPUs get the raw render for 60fps)
const useBloom = !matchMedia('(pointer: coarse)').matches;
let composer = null;
if (useBloom) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 0.75, 0.55, 0.12);
  composer.addPass(bloom);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
});

// --- Game loop ---
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 20);

  const alive = state.phase === 'run';
  const riding = alive || state.phase === 'school';
  if (alive) state.timeAlive += dt;

  if (state.phase !== 'menu') {
    player.update(dt, riding);
    player.updateCamera(camera, dt);
  } else {
    // slow cinematic drift on the menu
    player.z -= 14 * dt;
    player.mesh.position.z = player.z;
    camera.position.set(Math.sin(clock.elapsedTime * 0.2) * 3, 4.5, player.z + 10);
    camera.lookAt(0, 2, player.z - 40);
  }

  road.update(player.z);

  // rebase far from origin to keep float precision healthy
  if (player.z < REBASE_AT) {
    player.z += REBASE_SHIFT;
    player.mesh.position.z = player.z;
    camera.position.z += REBASE_SHIFT;
    state.zShift += REBASE_SHIFT;
    road.rebase(REBASE_SHIFT);
    for (const fn of rebasers) fn(REBASE_SHIFT);
  }

  for (const fn of updaters) fn(dt, riding);
  sky.update(camera);
  if (composer) composer.render();
  else renderer.render(scene, camera);
}
frame();
