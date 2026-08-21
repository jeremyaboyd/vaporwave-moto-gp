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
    this.boostMeter = 0;
    this.boosting = false;
    this.invulnT = 0;
    this.mesh.position.set(this.x, 0, 0);
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.visible = true;
  }

  get kmh() { return Math.round(this.speed * 3.6); }

  update(dt, alive) {
    const up = this.upgrades;

    // --- boost (2x accel + a little overspeed while burning meter) ---
    const cap = up ? up.boostCap() : 0;
    this.boosting = alive && cap > 0 && controls.boost && this.boostMeter > 0.05;
    if (this.boosting) {
      this.boostMeter = Math.max(0, this.boostMeter - dt);
    } else if (cap > 0) {
      this.boostMeter = Math.min(cap, this.boostMeter + dt / 5); // 1s of boost per 5s
    }

    // --- longitudinal (digital keys or analog tilt) ---
    const accel = ACCEL * (up ? up.accelMul() : 1) * (this.boosting ? 2 : 1);
    const brake = BRAKE * (up ? up.brakeMul() : 1);
    const maxSpeed = MAX_SPEED * (up ? up.topMul() : 1) * (this.boosting ? 1.12 : 1);
    let throttle = controls.throttleAxis !== null
      ? controls.throttleAxis
      : (controls.accel ? 1 : 0) - (controls.brake ? 1 : 0);
    if (this.boosting) throttle = 1;
    if (alive && throttle > 0.06) {
      if (this.speed < maxSpeed) this.speed = Math.min(maxSpeed, this.speed + accel * throttle * dt);
    } else if (alive && throttle < -0.06) {
      this.speed -= brake * -throttle * dt;
    } else {
      this.speed -= DRAG * dt;
    }
    // over the cap (e.g. boost just ended): bleed off gently
    if (this.speed > maxSpeed) this.speed = Math.max(maxSpeed, this.speed - DRAG * 3 * dt);
    this.speed = Math.max(0, this.speed);

    // --- armor invulnerability flash ---
    if (this.invulnT > 0) {
      this.invulnT -= dt;
      this.mesh.visible = (this.invulnT * 12 | 0) % 2 === 0;
    } else if (!this.mesh.visible) {
      this.mesh.visible = true;
    }

    // --- lateral (lean) ---
    const steer = controls.steerAxis !== null
      ? controls.steerAxis
      : (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
    const target = alive ? Math.max(-1, Math.min(1, steer)) : 0;
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
    }

    // --- visuals ---
    this.mesh.position.set(this.x, this.y, this.z);
    if (alive) {
      this.mesh.rotation.z = -this.lean * 0.55;
      this.mesh.rotation.x = this.airborne ? Math.min(0.35, this.vy * -0.02) : 0;
      this.mesh.rotation.y = -this.lean * 0.18;
    } else if (this.speed > 1) {
      // crash tumble: slide and spin out while coasting to a stop
      this.mesh.rotation.z += dt * 9;
      this.mesh.rotation.y += dt * 4;
    }
  }

  // hard cut to the ideal chase pose — used on run start so the camera never
  // visibly lerps across the world reset
  snapCamera(camera) {
    camera.position.set(this.x + this.lean * 1.1, this.y + 4.0, this.z + 8.8);
    camera.lookAt(this.x, this.y + 1.6, this.z - 26);
  }

  updateCamera(camera, dt) {
    // camera is locked directly behind the bike; the mouse only turns your
    // head (shifts the gaze target), never swings the camera off-axis
    const lookX = controls.lookX;
    const lookY = controls.lookY;
    const dist = 8.8;
    const tx = this.x + this.lean * 1.1;
    const ty = this.y + 4.0 + lookY * 1.0;
    camera.position.x += (tx - camera.position.x) * Math.min(1, dt * 8);
    camera.position.y += (ty - camera.position.y) * Math.min(1, dt * 6);
    camera.position.z = this.z + dist; // hard-lock forward axis
    camera.lookAt(this.x + lookX * 9, this.y + 1.6 - lookY * 2.2, this.z - 26);
  }
}
