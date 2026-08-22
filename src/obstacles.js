import * as THREE from 'three';
import { neonMesh, edgeMaterial, glowQuad } from './assets.js';

// Static hazards (barrels, crates, barriers — one touch kills) and ramps
// (safe: ride up, launch, clear traffic).

const RAMP_W = 5.2;
const RAMP_LEN = 11;
const RAMP_H = 2.7;

function buildRampTemplate() {
  const g = new THREE.Group();
  const pos = [];
  const halfW = RAMP_W / 2;
  // slope grid: player enters at +z end (h=0), leaves at -z end (h=RAMP_H)
  const cols = 6, rows = 8;
  for (let i = 0; i <= cols; i++) {
    const x = -halfW + (i / cols) * RAMP_W;
    pos.push(x, 0, RAMP_LEN / 2, x, RAMP_H, -RAMP_LEN / 2);
  }
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    const z = RAMP_LEN / 2 - t * RAMP_LEN;
    const y = t * RAMP_H;
    pos.push(-halfW, y, z, halfW, y, z);
  }
  // back face + side outlines
  pos.push(-halfW, RAMP_H, -RAMP_LEN / 2, -halfW, 0, -RAMP_LEN / 2);
  pos.push(halfW, RAMP_H, -RAMP_LEN / 2, halfW, 0, -RAMP_LEN / 2);
  pos.push(-halfW, 0, -RAMP_LEN / 2, -halfW, 0, RAMP_LEN / 2);
  pos.push(halfW, 0, -RAMP_LEN / 2, halfW, 0, RAMP_LEN / 2);
  pos.push(-halfW, 0, -RAMP_LEN / 2, halfW, 0, -RAMP_LEN / 2);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.add(new THREE.LineSegments(geo, edgeMaterial('#2fe9ff')));

  // black fill so the ramp occludes what's behind it
  const fillGeo = new THREE.BufferGeometry();
  const v = [
    -halfW, 0, RAMP_LEN / 2,  halfW, 0, RAMP_LEN / 2,  halfW, RAMP_H, -RAMP_LEN / 2,
    -halfW, 0, RAMP_LEN / 2,  halfW, RAMP_H, -RAMP_LEN / 2,  -halfW, RAMP_H, -RAMP_LEN / 2,
  ];
  fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  fillGeo.computeVertexNormals();
  const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({
    color: '#05010d', polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, side: THREE.DoubleSide,
  }));
  g.add(fill);
  return g;
}

function buildBarrelTemplate() {
  const b = neonMesh(new THREE.CylinderGeometry(0.6, 0.6, 1.0, 8), '#ffd23f', 1);
  b.position.y = 0.5;
  const g = new THREE.Group();
  g.add(b);
  return g;
}
function buildCrateTemplate() {
  const c = neonMesh(new THREE.BoxGeometry(1.3, 1.3, 1.3), '#ff5ecb');
  c.position.y = 0.65;
  const g = new THREE.Group();
  g.add(c);
  return g;
}
function buildBarrierTemplate() {
  const g = new THREE.Group();
  const bar = neonMesh(new THREE.BoxGeometry(3.4, 0.5, 0.4), '#ff2fd6');
  bar.position.y = 0.95;
  const bar2 = neonMesh(new THREE.BoxGeometry(3.4, 0.5, 0.4), '#ffffff');
  bar2.position.y = 0.35;
  g.add(bar, bar2);
  return g;
}

// Jersey barrier filling one segment of the median — spawned in multi-segment
// runs so the center strip can't be ridden forever.
function buildMedianTemplate(len) {
  const g = new THREE.Group();
  const wall = neonMesh(new THREE.BoxGeometry(0.75, 1.05, len), '#b9c8ff');
  wall.position.set(0, 0.525, -len / 2);
  g.add(wall);
  // hot warning line along the top so it reads from a distance
  const topGeo = new THREE.BufferGeometry();
  topGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.08, 0, 0, 1.08, -len], 3));
  g.add(new THREE.LineSegments(topGeo, edgeMaterial('#ff2fd6')));
  // amber reflectors facing up and down the road
  for (let z = -6; z > -len; z -= 15) {
    const r = glowQuad(0.55, 0.18, '#ffb02f', 0.85);
    r.position.set(0, 0.8, z);
    g.add(r);
  }
  g.traverse(o => { o.userData.noDispose = true; });
  return g;
}
let medianTpl = null;

const rampTpl = buildRampTemplate();
const killerTpls = [
  { tpl: buildBarrelTemplate(), halfW: 0.75, halfL: 0.75, height: 1.1 },
  { tpl: buildCrateTemplate(), halfW: 0.8, halfL: 0.8, height: 1.4 },
  { tpl: buildBarrierTemplate(), halfW: 1.8, halfL: 0.35, height: 1.3 },
];

export class Obstacles {
  constructor(scene, world, road) {
    this.world = world;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.ramps = [];
    this.killers = [];
    this.medians = [];      // { z0, len, mesh } — solid wall down the center strip
    this.medianRun = 0;     // segments left in the current divider run
    road.onSegment((seg, r) => this.populateSegment(seg, r));
  }

  spawnRamp(x, z) {
    const mesh = rampTpl.clone();
    mesh.position.set(x, 0, z);
    this.group.add(mesh);
    const rp = { mesh, x, z };
    this.ramps.push(rp);
    return rp;
  }

  populateSegment(seg, road) {
    if (road.state.tutorial) return; // riding school: hazards off, ramps manual
    const d = road.dist(seg.z0);
    if (d < 400) return;
    const diff = Math.min(1, d / 12000);
    const { laneXs, segmentLength } = this.world;

    // median dividers: sometimes the center strip walls off for a stretch
    if (this.medianRun > 0 || Math.random() < 0.12 + diff * 0.1) {
      if (this.medianRun <= 0) this.medianRun = 3 + Math.floor(Math.random() * 5); // 180-420m runs
      this.medianRun--;
      if (!medianTpl) medianTpl = buildMedianTemplate(segmentLength);
      const mesh = medianTpl.clone();
      mesh.position.z = seg.z0;
      this.group.add(mesh);
      this.medians.push({ z0: seg.z0, len: segmentLength, mesh });
    }

    // ramps: only on the player's carriageway
    if (Math.random() < 0.16) {
      const x = laneXs[2 + Math.floor(Math.random() * 2)];
      const z = seg.z0 - 10 - Math.random() * (segmentLength - 20);
      const mesh = rampTpl.clone();
      mesh.position.set(x, 0, z);
      this.group.add(mesh);
      this.ramps.push({ mesh, x, z });
    }

    // killer obstacles
    const count = Math.random() < 0.25 + diff * 0.45 ? (Math.random() < diff * 0.35 ? 2 : 1) : 0;
    for (let k = 0; k < count; k++) {
      const kind = killerTpls[Math.floor(Math.random() * killerTpls.length)];
      const lane = Math.floor(Math.random() * laneXs.length);
      const x = laneXs[lane] + (Math.random() - 0.5) * 1.5;
      const z = seg.z0 - Math.random() * segmentLength;
      // keep clear of ramps so a jump never lands you inside a crate
      if (this.ramps.some(rp => Math.abs(rp.x - x) < 4 && z < rp.z + 14 && z > rp.z - 60)) continue;
      const mesh = kind.tpl.clone();
      mesh.position.set(x, 0, z);
      mesh.rotation.y = Math.random() * Math.PI;
      this.group.add(mesh);
      this.killers.push({ mesh, x, z, halfW: kind.halfW, halfL: kind.halfL, height: kind.height });
    }
  }

  // Surface height under the bike — ramps only (road is y=0).
  groundHeightAt(x, z) {
    for (const rp of this.ramps) {
      if (Math.abs(x - rp.x) > RAMP_W / 2) continue;
      const dz = z - (rp.z - RAMP_LEN / 2); // distance from the top edge
      if (dz < 0 || dz > RAMP_LEN) continue;
      const progress = 1 - dz / RAMP_LEN;
      return RAMP_H * progress;
    }
    return 0;
  }

  update(player, alive, onCollide) {
    if (!alive) return;
    // median wall: hitting it head-on at bike height is a crash
    for (const md of this.medians) {
      if (player.z <= md.z0 && player.z >= md.z0 - md.len &&
          Math.abs(player.x) < 0.7 && player.y < 1.1) {
        onCollide({ median: true });
        break;
      }
    }
    for (const o of this.killers) {
      if (Math.abs(player.z - o.z) > 6) continue;
      if (Math.abs(player.x - o.x) < o.halfW + 0.6 &&
          Math.abs(player.z - o.z) < o.halfL + 0.9 &&
          player.y < o.height) {
        onCollide(o);
        return;
      }
    }
  }

  remove(o) {
    const i = this.killers.indexOf(o);
    if (i >= 0) { this.group.remove(o.mesh); this.killers.splice(i, 1); }
  }

  prune(playerZ) {
    const behind = playerZ + 220;
    const drop = (arr) => {
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i].z > behind) { this.group.remove(arr[i].mesh); arr.splice(i, 1); }
      }
    };
    drop(this.ramps);
    drop(this.killers);
    for (let i = this.medians.length - 1; i >= 0; i--) {
      if (this.medians[i].z0 - this.medians[i].len > behind) {
        this.group.remove(this.medians[i].mesh);
        this.medians.splice(i, 1);
      }
    }
  }

  rebase(shift) {
    for (const arr of [this.ramps, this.killers]) {
      for (const o of arr) { o.z += shift; o.mesh.position.z = o.z; }
    }
    for (const md of this.medians) { md.z0 += shift; md.mesh.position.z = md.z0; }
  }

  reset() {
    for (const arr of [this.ramps, this.killers]) {
      for (const o of arr) this.group.remove(o.mesh);
    }
    for (const md of this.medians) this.group.remove(md.mesh);
    this.ramps = [];
    this.killers = [];
    this.medians = [];
    this.medianRun = 0;
  }
}
