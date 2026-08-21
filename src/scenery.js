import * as THREE from 'three';
import { neonMesh, edgeMaterial, glowQuad } from './assets.js';
import { biomeMixAt, sceneryDensity, lerpNum } from './biomes.js';
import { terrainHeight } from './road.js';

// Static roadside props, spawned per segment from blended biome densities and
// parented to the segment group so they're recycled with it. Template
// geometries are shared between clones (userData.noDispose keeps the road
// recycler from disposing them).

function shared(group) {
  group.traverse(o => { o.userData.noDispose = true; });
  return group;
}

function linesFrom(points, color) {
  const geo = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
  return new THREE.Line(geo, edgeMaterial(color));
}

// --- Palm tree: leaning trunk strip + arced fronds ---
function buildPalm() {
  const g = new THREE.Group();
  const trunk = [];
  const H = 7 + Math.random() * 2;
  const leanDir = Math.random() * Math.PI * 2;
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const lean = t * t * 1.6;
    trunk.push([Math.cos(leanDir) * lean, t * H, Math.sin(leanDir) * lean]);
  }
  g.add(linesFrom(trunk, '#ff2fd6'));
  const top = trunk[6];
  for (let f = 0; f < 7; f++) {
    const a = (f / 7) * Math.PI * 2;
    const pts = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      const r = t * 3.2;
      const droop = t * t * 2.0;
      pts.push([top[0] + Math.cos(a) * r, top[1] + 0.4 + t * 0.8 - droop, top[2] + Math.sin(a) * r]);
    }
    g.add(linesFrom(pts, '#2fe9ff'));
  }
  return shared(g);
}

// --- Saguaro cactus ---
function buildCactus() {
  const g = new THREE.Group();
  const H = 4 + Math.random() * 3;
  const body = neonMesh(new THREE.CylinderGeometry(0.45, 0.55, H, 6), '#3fff8f', 1);
  body.position.y = H / 2;
  g.add(body);
  for (const side of [-1, 1]) {
    if (Math.random() < 0.25) continue;
    const ay = H * (0.4 + Math.random() * 0.25);
    const arm = neonMesh(new THREE.CylinderGeometry(0.3, 0.3, 2.2, 6), '#3fff8f', 1);
    arm.position.set(side * 1.0, ay + 1.0, 0);
    const elbow = neonMesh(new THREE.CylinderGeometry(0.3, 0.3, 1.2, 6), '#3fff8f', 1);
    elbow.rotation.z = Math.PI / 2;
    elbow.position.set(side * 0.6, ay, 0);
    g.add(arm, elbow);
  }
  return shared(g);
}

// --- Building: black slab + edge outline + floor rings ---
function buildBuilding(w, h, d, color) {
  const g = new THREE.Group();
  const box = neonMesh(new THREE.BoxGeometry(w, h, d), color);
  box.position.y = h / 2;
  g.add(box);
  const pos = [];
  const floors = Math.max(2, Math.round(h / 4));
  for (let f = 1; f < floors; f++) {
    const y = (f / floors) * h;
    const hw = w / 2, hd = d / 2;
    pos.push(-hw, y, hd, hw, y, hd,   hw, y, hd, hw, y, -hd,
             hw, y, -hd, -hw, y, -hd,  -hw, y, -hd, -hw, y, hd);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const rings = new THREE.LineSegments(geo, edgeMaterial(color));
  rings.material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.35 });
  g.add(rings);
  return shared(g);
}

// --- Street light ---
function buildStreetlight(side) {
  const g = new THREE.Group();
  g.add(linesFrom([[0, 0, 0], [0, 7.5, 0], [-side * 2.6, 8.2, 0]], '#9b30ff'));
  const lamp = glowQuad(0.9, 0.28, '#fff3b0');
  lamp.position.set(-side * 2.6, 8.1, 0);
  g.add(lamp);
  return shared(g);
}

// --- Radio tower ---
function buildTower() {
  const g = new THREE.Group();
  const H = 26 + Math.random() * 18;
  for (const [ox, oz] of [[-1.6, -1.6], [1.6, -1.6], [1.6, 1.6], [-1.6, 1.6]]) {
    g.add(linesFrom([[ox, 0, oz], [0, H, 0]], '#ff2fd6'));
  }
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    const r = 1.6 * (1 - t);
    g.add(linesFrom([[-r, H * t, -r], [r, H * t, -r], [r, H * t, r], [-r, H * t, r], [-r, H * t, -r]], '#ff2fd6'));
  }
  const beacon = glowQuad(0.7, 0.7, '#ff2050');
  beacon.position.y = H + 0.5;
  g.add(beacon);
  return shared(g);
}

// --- Bridge pylon + cables (night bridge) ---
function buildBridgeRib(segLen) {
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    const x = side * 15;
    // pylon
    g.add(linesFrom([[x, 0, 0], [x, 22, 0]], '#2fe9ff'));
    g.add(linesFrom([[x - 1, 14, 0], [x + 1, 14, 0]], '#2fe9ff'));
    // main cable: catenary dipping toward the middle of the span
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const z = -t * segLen;
      const y = 22 - Math.sin(t * Math.PI) * 12;
      pts.push([x, y, z]);
    }
    g.add(linesFrom(pts, '#ff2fd6'));
    // hangers
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      const y = 22 - Math.sin(t * Math.PI) * 12;
      g.add(linesFrom([[x, y, -t * segLen], [x, 1.2, -t * segLen]], '#9b30ff'));
    }
    // railing
    g.add(linesFrom([[x - side * 0.8, 1.2, 0], [x - side * 0.8, 1.2, -segLen]], '#2fe9ff'));
  }
  return shared(g);
}

const palmTpls = [buildPalm(), buildPalm(), buildPalm()];
const cactusTpls = [buildCactus(), buildCactus(), buildCactus()];
const towerTpl = buildTower();
const lightTplL = buildStreetlight(-1);
const lightTplR = buildStreetlight(1);
const buildingTpls = [
  buildBuilding(10, 18, 10, '#b02fff'),
  buildBuilding(12, 32, 9, '#2fe9ff'),
  buildBuilding(9, 46, 9, '#ff2fd6'),
  buildBuilding(14, 24, 12, '#7a5cff'),
];
const buildingTplHs = [18, 32, 46, 24];

export function attachScenery(road, world) {
  road.onSegment((seg, r) => {
    const len = world.segmentLength;
    const dMid = r.dist(seg.z0 - len / 2);
    const mix = biomeMixAt(dMid);
    const rand = Math.random;

    const groundY = (x, zLocal) => terrainHeight(x, r.dist(seg.z0 + zLocal), biomeMixAt(r.dist(seg.z0 + zLocal)));

    const place = (tpl, x, zLocal, scaleY = 1) => {
      const m = tpl.clone();
      m.position.set(x, Math.max(0, groundY(x, zLocal) - 0.3), zLocal);
      if (scaleY !== 1) m.scale.y = scaleY;
      m.rotation.y = rand() * Math.PI * 2;
      seg.group.add(m);
      return m;
    };

    // palms — lining the road
    const palmD = sceneryDensity(mix, 'palm');
    for (let i = 0; i < 4; i++) {
      if (rand() > palmD) continue;
      const side = rand() < 0.5 ? -1 : 1;
      place(palmTpls[(rand() * palmTpls.length) | 0], side * (16 + rand() * 6), -rand() * len);
    }

    // cacti — scattered wide
    const cacD = sceneryDensity(mix, 'cactus');
    for (let i = 0; i < 5; i++) {
      if (rand() > cacD) continue;
      const side = rand() < 0.5 ? -1 : 1;
      place(cactusTpls[(rand() * cactusTpls.length) | 0], side * (17 + rand() * 45), -rand() * len);
    }

    // buildings — skyline rows
    const bldD = sceneryDensity(mix, 'building');
    const bldH = lerpNum(mix.a.scenery.bldH ?? 0, mix.b.scenery.bldH ?? 0, mix.t);
    for (let i = 0; i < 3; i++) {
      if (rand() > bldD) continue;
      const side = rand() < 0.5 ? -1 : 1;
      const h = bldH * (0.5 + rand() * 0.9);
      if (h < 6) continue;
      const idx = (rand() * buildingTpls.length) | 0;
      const m = buildingTpls[idx].clone();
      m.position.set(side * (24 + rand() * 46), 0, -rand() * len);
      m.scale.y = h / buildingTplHs[idx];
      seg.group.add(m);
    }

    // street lights — regular posts at the road edge
    const lightD = sceneryDensity(mix, 'streetlight');
    if (rand() < lightD) {
      const side = ((seg.z0 / len) | 0) % 2 === 0 ? 1 : -1;
      const tpl = side > 0 ? lightTplR : lightTplL;
      const m = tpl.clone();
      m.position.set(side * 14.5, 0, -len * 0.5);
      seg.group.add(m);
    }

    // towers — far silhouettes
    if (rand() < sceneryDensity(mix, 'tower') * 0.5) {
      const side = rand() < 0.5 ? -1 : 1;
      place(towerTpl, side * (55 + rand() * 60), -rand() * len);
    }

    // bridge structure
    if (sceneryDensity(mix, 'bridge') > 0.55) {
      const rib = buildBridgeRib(len);
      rib.position.set(0, 0, 0);
      seg.group.add(rib);
    }
  });
}
