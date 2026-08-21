import * as THREE from 'three';
import { createSky } from './sky.js';
import { RoadManager } from './road.js';

export const WORLD = {
  forward: -1,          // player travels toward -Z
  roadWidth: 26,        // full paved width
  laneXs: [-9.5, -4, 4, 9.5], // lanes 0,1 oncoming; 2,3 with traffic
  segmentLength: 60,
  segmentsAhead: 22,
  segmentsBehind: 3,
};

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

const sky = createSky(scene);

// World-space rebase bookkeeping: distance travelled d = zShift - z.
export const state = { zShift: 0 };

export const road = new RoadManager(scene, WORLD, state);

// Temporary auto-drive until the player module lands.
let tempZ = 0;
onUpdate((dt) => {
  tempZ -= 40 * dt;
  camera.position.set(0, 4.2, tempZ + 10);
  camera.lookAt(0, 2, tempZ - 40);
  road.update(tempZ);
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Game loop ---
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 20); // clamp long tab-away frames
  for (const fn of updaters) fn(dt);
  sky.update(camera);
  renderer.render(scene, camera);
}
frame();
