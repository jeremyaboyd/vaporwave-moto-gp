import * as THREE from 'three';
import { neonMesh, glowQuad } from './assets.js';

// Procedural traffic. Lanes 0,1 (x<0) are oncoming; lanes 2,3 run the
// player's direction. Vehicles spawn attached to newly created road segments
// and are simulated until they fall out of the active window.

const CAR_COLORS = ['#2fe9ff', '#ff2fd6', '#ffd23f', '#9b30ff', '#3fff8f'];

function buildCarTemplate(color) {
  const g = new THREE.Group();
  const body = neonMesh(new THREE.BoxGeometry(2.2, 1.0, 4.6), color);
  body.position.y = 0.85;
  const cabin = neonMesh(new THREE.BoxGeometry(1.9, 0.75, 2.2), color);
  cabin.position.set(0, 1.7, 0.25);
  g.add(body, cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 8);
  for (const [x, z] of [[1.05, 1.5], [-1.05, 1.5], [1.05, -1.5], [-1.05, -1.5]]) {
    const w = neonMesh(wheelGeo, '#2fe9ff', 1);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.42, z);
    g.add(w);
  }
  const tail = glowQuad(1.8, 0.25, '#ff2050');
  tail.position.set(0, 1.0, 2.32);
  const head = glowQuad(1.8, 0.22, '#cffcff');
  head.position.set(0, 0.85, -2.32);
  g.add(tail, head);
  return g;
}

function buildTruckTemplate(color) {
  const g = new THREE.Group();
  const cab = neonMesh(new THREE.BoxGeometry(2.5, 2.4, 2.8), '#2fe9ff');
  cab.position.set(0, 1.5, -3.6);
  const trailer = neonMesh(new THREE.BoxGeometry(2.7, 3.0, 7.6), color);
  trailer.position.set(0, 1.85, 1.6);
  g.add(cab, trailer);
  const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.35, 8);
  for (const [x, z] of [[1.2, -4.2], [-1.2, -4.2], [1.2, 3.6], [-1.2, 3.6], [1.2, 4.8], [-1.2, 4.8]]) {
    const w = neonMesh(wheelGeo, '#2fe9ff', 1);
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.5, z);
    g.add(w);
  }
  const tail = glowQuad(2.2, 0.3, '#ff2050');
  tail.position.set(0, 1.2, 5.42);
  const head = glowQuad(2.0, 0.25, '#cffcff');
  head.position.set(0, 1.0, -5.02);
  g.add(tail, head);
  return g;
}

const carTemplates = CAR_COLORS.map(buildCarTemplate);
const truckTemplates = ['#9b30ff', '#ff2fd6'].map(buildTruckTemplate);

export class Traffic {
  constructor(scene, world, road) {
    this.world = world;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.vehicles = [];
    this.nearMisses = 0;
    road.onSegment((seg, r) => this.populateSegment(seg, r));
  }

  densityAt(d) {
    return Math.min(0.85, 0.28 + d / 14000); // ramps up over ~8 km
  }

  populateSegment(seg, road) {
    if (road.state.tutorial) return; // riding school: empty road
    const d = road.dist(seg.z0);
    if (d < 150) return; // clear runway at the start
    const density = this.densityAt(d);
    const { laneXs, segmentLength } = this.world;
    for (let lane = 0; lane < laneXs.length; lane++) {
      if (Math.random() > density * 0.55) continue;
      const isTruck = Math.random() < 0.22;
      const oncoming = lane < 2;
      const tpl = isTruck
        ? truckTemplates[Math.floor(Math.random() * truckTemplates.length)]
        : carTemplates[Math.floor(Math.random() * carTemplates.length)];
      const mesh = tpl.clone();
      const z = seg.z0 - Math.random() * segmentLength;
      const x = laneXs[lane] + (Math.random() - 0.5) * 0.8;
      // don't stack two vehicles in the same lane too close together
      const tooClose = this.vehicles.some(v =>
        Math.abs(v.x - x) < 3 && Math.abs(v.z - z) < (isTruck ? 22 : 14));
      if (tooClose) continue;
      mesh.position.set(x, 0, z);
      if (oncoming) mesh.rotation.y = Math.PI;
      this.group.add(mesh);
      this.vehicles.push({
        mesh, x, z,
        dir: oncoming ? 1 : -1,
        speed: oncoming ? 20 + Math.random() * 14 : 17 + Math.random() * 13,
        halfW: isTruck ? 1.5 : 1.25,
        halfL: isTruck ? 5.6 : 2.5,
        height: isTruck ? 3.4 : 1.9,
        missed: false,
      });
    }
  }

  update(dt, player, alive, onCollide) {
    const keepBehind = player.z + 220;
    const keepAhead = player.z - this.world.segmentLength * (this.world.segmentsAhead + 4);
    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      v.z += v.dir * v.speed * dt;
      v.mesh.position.z = v.z;
      if (v.z > keepBehind || v.z < keepAhead) {
        this.group.remove(v.mesh);
        this.vehicles.splice(i, 1);
        continue;
      }
      if (!alive) continue;
      const dx = Math.abs(player.x - v.x);
      const dz = Math.abs(player.z - v.z);
      // collision (jumping clears vehicles below you)
      if (dx < v.halfW + 0.7 && dz < v.halfL + 1.0 && player.y < v.height) {
        onCollide(v);
      } else if (!v.missed && dz < 2.5 && dx >= v.halfW + 0.7 && dx < v.halfW + 2.2 && player.speed > 30) {
        v.missed = true;
        this.nearMisses++;
      }
    }
  }

  remove(v) {
    const i = this.vehicles.indexOf(v);
    if (i >= 0) { this.group.remove(v.mesh); this.vehicles.splice(i, 1); }
  }

  rebase(shift) { for (const v of this.vehicles) { v.z += shift; v.mesh.position.z = v.z; } }

  reset() {
    for (const v of this.vehicles) this.group.remove(v.mesh);
    this.vehicles = [];
    this.nearMisses = 0;
  }
}
