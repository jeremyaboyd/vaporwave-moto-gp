import * as THREE from 'three';
import { createSky } from './sky.js';
import { RoadManager } from './road.js';
import { Player } from './player.js';
import { Traffic } from './traffic.js';
import { Obstacles } from './obstacles.js';
import { attachScenery } from './scenery.js';
import { Hud } from './hud.js';
import { biomeMixAt, lerpColor } from './biomes.js';
import { onStart, onRestart } from './input.js';

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
  phase: 'menu',       // 'menu' | 'run' | 'dead'
  timeAlive: 0,
  deadAt: 0,
};

export const road = new RoadManager(scene, WORLD, state);
export const player = new Player(scene);
export const traffic = new Traffic(scene, WORLD, road);
onRebase((s) => traffic.rebase(s));
onReset(() => traffic.reset());
onUpdate((dt, alive) => traffic.update(dt, player, alive, () => die()));

export const obstacles = new Obstacles(scene, WORLD, road);
player.groundHeightAt = (x, z) => obstacles.groundHeightAt(x, z);
onRebase((s) => obstacles.rebase(s));
onReset(() => obstacles.reset());
onUpdate((dt, alive) => {
  obstacles.update(player, alive, () => die());
  obstacles.prune(player.z);
});

attachScenery(road, WORLD);

// Fog / background follow the blended biome at the player's position.
const biomeNameEl = document.getElementById('biome-name');
onUpdate(() => {
  const mix = biomeMixAt(state.zShift - player.z);
  lerpColor(scene.fog.color, mix.a.fog, mix.b.fog, mix.t);
  scene.background.copy(scene.fog.color).multiplyScalar(0.55);
  if (biomeNameEl.textContent !== mix.name) biomeNameEl.textContent = mix.name;
});

onUpdate((dt, alive) => hud.update(dt, player, traffic, alive, state.timeAlive));

export const hud = new Hud();

export function die() {
  if (state.phase !== 'run') return;
  state.phase = 'dead';
  state.deadAt = performance.now();
  hud.showDeath(hud.score);
}

function startRun() {
  player.reset();
  hud.reset();
  state.zShift = 0;
  state.timeAlive = 0;
  state.phase = 'run';
  hud.hideOverlay();
}

onStart(() => { if (state.phase === 'menu') startRun(); });
onRestart(() => {
  // small delay so a panicked R/tap at the moment of death doesn't skip the score screen
  if (state.phase === 'dead' && performance.now() - state.deadAt > 700) {
    resetWorld();
    startRun();
  }
});

// Full world rebuild on restart: nuke all segments so traffic/obstacles respawn.
function resetWorld() {
  while (road.segments.length) road.disposeSegment(road.segments.shift());
  road.nextZ0 = WORLD.segmentLength * WORLD.segmentsBehind;
  for (const fn of resetHandlers) fn();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Game loop ---
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 20);

  const alive = state.phase === 'run';
  if (alive) state.timeAlive += dt;

  if (state.phase !== 'menu') {
    player.update(dt, alive);
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

  for (const fn of updaters) fn(dt, alive);
  sky.update(camera);
  renderer.render(scene, camera);
}
frame();
