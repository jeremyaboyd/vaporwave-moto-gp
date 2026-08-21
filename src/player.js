import * as THREE from 'three';
import { controls } from './input.js';
import { neonMesh, glowQuad } from './assets.js';

// Player bike: arcade physics along -Z with lateral lean steering, plus a
// vertical channel (vy/gravity) so ramps can throw the bike into the air.

const MAX_SPEED = 86;        // world units/s (~310 km/h on the HUD)
const ACCEL = 26;
const BRAKE = 55;
const DRAG = 6;
const LATERAL = 34;          // lateral speed at full lean, scaled by speed
const ROAD_EDGE = 12.2;
const GRAVITY = -34;

function buildBikeMesh() {
  const bike = new THREE.Group();
  const pink = '#ff2fd6';
  const cyan = '#2fe9ff';

  const wheelGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.28, 10);
  const front = neonMesh(wheelGeo, cyan, 1);
  front.rotation.z = Math.PI / 2;
  front.position.set(0, 0.55, -1.05);
  const rear = neonMesh(wheelGeo, cyan, 1);
  rear.rotation.z = Math.PI / 2;
  rear.position.set(0, 0.55, 0.95);
  bike.add(front, rear);

  const bodyGeo = new THREE.BoxGeometry(0.55, 0.55, 2.1);
  const body = neonMesh(bodyGeo, pink);
  body.position.set(0, 0.95, 0);
  bike.add(body);

  const tankGeo = new THREE.BoxGeometry(0.5, 0.35, 0.8);
  const tank = neonMesh(tankGeo, pink);
  tank.position.set(0, 1.28, -0.15);
  bike.add(tank);

  const forkGeo = new THREE.BoxGeometry(0.16, 0.9, 0.16);
  const forkL = neonMesh(forkGeo, cyan);
  forkL.position.set(0.22, 0.85, -1.0);
  forkL.rotation.x = 0.4;
  const forkR = neonMesh(forkGeo, cyan);
  forkR.position.set(-0.22, 0.85, -1.0);
  forkR.rotation.x = 0.4;
  bike.add(forkL, forkR);

  const barGeo = new THREE.BoxGeometry(0.9, 0.1, 0.1);
  const bars = neonMesh(barGeo, cyan);
  bars.position.set(0, 1.35, -0.72);
  bike.add(bars);

  // rider
  const torso = neonMesh(new THREE.BoxGeometry(0.5, 0.7, 0.9), cyan);
  torso.position.set(0, 1.62, 0.28);
  torso.rotation.x = -0.75;
  const helmet = neonMesh(new THREE.SphereGeometry(0.26, 8, 6), pink, 30);
  helmet.position.set(0, 1.95, -0.18);
  const legL = neonMesh(new THREE.BoxGeometry(0.18, 0.7, 0.3), cyan);
  legL.position.set(0.33, 1.05, 0.35);
  legL.rotation.x = 0.5;
  const legR = legL.clone();
  legR.position.x = -0.33;
  bike.add(torso, helmet, legL, legR);

  const tail = glowQuad(0.4, 0.16, '#ff2050');
  tail.position.set(0, 1.0, 1.06);
  bike.add(tail);
  const head = glowQuad(0.3, 0.2, '#aefcff');
  head.position.set(0, 1.0, -1.25);
  bike.add(head);

  return bike;
}

export class Player {
  constructor(scene) {
    this.mesh = buildBikeMesh();
    scene.add(this.mesh);
    // groundHeightAt(x, z) -> ramp/road surface height under the bike;
    // installed by the obstacles module.
    this.groundHeightAt = () => 0;
    this.reset();
  }

  reset() {
    this.x = 6.75;            // start in the right carriageway
    this.z = 0;
    this.y = 0;
    this.vy = 0;
    this.speed = 0;
    this.lean = 0;            // -1..1 smoothed
    this.airborne = false;
    this.airTime = 0;
    this.distance = 0;
    this.mesh.position.set(this.x, 0, 0);
    this.mesh.rotation.set(0, 0, 0);
  }

  get kmh() { return Math.round(this.speed * 3.6); }

  update(dt, alive) {
    // --- longitudinal ---
    if (alive && controls.accel) this.speed += ACCEL * dt;
    else if (alive && controls.brake) this.speed -= BRAKE * dt;
    else this.speed -= DRAG * dt;
    this.speed = Math.max(0, Math.min(MAX_SPEED, this.speed));

    // --- lateral (lean) ---
    const target = alive ? ((controls.right ? 1 : 0) - (controls.left ? 1 : 0)) : 0;
    this.lean += (target - this.lean) * Math.min(1, dt * 7);
    const speedFactor = Math.min(1, this.speed / 22);
    if (!this.airborne) {
      this.x += this.lean * LATERAL * speedFactor * dt;
    } else {
      this.x += this.lean * LATERAL * 0.35 * speedFactor * dt; // less authority mid-air
    }
    // soft barrier at the road edge
    if (this.x > ROAD_EDGE) { this.x = ROAD_EDGE; this.speed *= (1 - 1.5 * dt); }
    if (this.x < -ROAD_EDGE) { this.x = -ROAD_EDGE; this.speed *= (1 - 1.5 * dt); }

    // --- forward ---
    this.z -= this.speed * dt;
    this.distance += this.speed * dt;

    // --- vertical / ramps ---
    const ground = this.groundHeightAt(this.x, this.z);
    if (this.airborne) {
      this.vy += GRAVITY * dt;
      this.y += this.vy * dt;
      this.airTime += dt;
      if (this.y <= ground) {
        this.y = ground;
        this.airborne = false;
        this.vy = 0;
      }
    } else {
      if (ground > this.y + 0.01) {
        // riding up a ramp face
        const climb = (ground - this.y);
        this.y = ground;
        this.vy = climb / Math.max(dt, 1e-4) * 0.6; // convert slope into launch speed
      } else if (ground < this.y - 0.4) {
        // rode off an edge
        this.airborne = true;
        this.airTime = 0;
      } else {
        this.y = ground;
        this.vy = Math.max(0, this.vy);
      }
      // launch once we leave a ramp with upward velocity
      if (this.vy > 4 && ground < this.y - 0.01) {
        this.airborne = true;
        this.airTime = 0;
      }
    }
    // takeoff check: if we have big vy and ground dropped away
    if (!this.airborne && this.vy > 5) {
      this.airborne = true;
      this.airTime = 0;
    }

    // --- visuals ---
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.z = -this.lean * 0.55;
    this.mesh.rotation.x = this.airborne ? Math.min(0.35, this.vy * -0.02) : 0;
    this.mesh.rotation.y = -this.lean * 0.18;
  }

  updateCamera(camera, dt) {
    const lookX = controls.lookX;
    const lookY = controls.lookY;
    const yaw = lookX * 0.55;
    const dist = 8.8;
    const height = 4.0 + lookY * 1.4;
    const tx = this.x + Math.sin(yaw) * dist + this.lean * 1.2;
    const tz = this.z + Math.cos(yaw) * dist;
    const ty = this.y + height;
    camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 6);
    camera.position.y += (ty - camera.position.y) * Math.min(1, dt * 6);
    camera.position.z = tz; // hard-lock forward axis so the bike never drifts out of frame
    camera.lookAt(this.x * 0.6, this.y + 1.6 - lookY * 2.2, this.z - 26);
  }
}
