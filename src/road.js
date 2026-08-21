import * as THREE from 'three';
import { biomeMixAt, lerpColor, lerpNum } from './biomes.js';

// Infinite road: fixed-length segments spawned ahead of the player and
// recycled behind. Each segment carries its own baked geometry (terrain grid,
// road markings) with vertex colors sampled from the blended biome at each
// vertex's distance — so biome transitions sweep smoothly along the road.

const GROUND_HALF = 240;   // how far the side grid extends
const CELL = 6;            // grid cell size
const ROAD_HALF = 13;      // paved half-width
const LINE_Y = 0.05;

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function noise2(x, z) {
  return Math.sin(x * 0.043 + Math.sin(z * 0.031) * 2.1)
       * Math.sin(z * 0.037 + Math.sin(x * 0.027) * 1.7);
}

// Terrain height in "distance space" (d = distance travelled at that row, so
// the shape survives world rebasing).
export function terrainHeight(x, d, mix) {
  const amp = x < 0
    ? lerpNum(mix.a.ampL, mix.b.ampL, mix.t)
    : lerpNum(mix.a.ampR, mix.b.ampR, mix.t);
  if (amp <= 0.01) return 0;
  const rise = smoothstep(24, 95, Math.abs(x));
  const n1 = 0.5 + 0.5 * noise2(x, d);
  const n2 = 0.5 + 0.5 * noise2(x * 2.7 + 40, d * 2.3);
  return amp * rise * (0.55 * n1 + 0.25 * n2 + 0.2);
}

export class RoadManager {
  constructor(scene, world, state) {
    this.world = world;
    this.state = state; // { zShift }
    this.group = new THREE.Group();
    scene.add(this.group);
    this.segments = [];
    this.nextZ0 = world.segmentLength * world.segmentsBehind; // first segment starts behind origin
    this.spawnHooks = [];

    this.groundMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 });
    this.markMat = new THREE.LineBasicMaterial({ vertexColors: true });
    this.faintMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.22 });
    this.fillMat = new THREE.MeshBasicMaterial({ color: '#05010d' });
  }

  onSegment(fn) { this.spawnHooks.push(fn); }

  dist(z) { return this.state.zShift - z; }

  update(playerZ) {
    const { segmentLength, segmentsAhead, segmentsBehind } = this.world;
    // spawn ahead
    while (this.nextZ0 > playerZ - segmentLength * segmentsAhead) {
      this.spawnSegment(this.nextZ0);
      this.nextZ0 -= segmentLength;
    }
    // recycle behind
    while (this.segments.length && this.segments[0].z0 - segmentLength > playerZ + segmentLength * segmentsBehind) {
      this.disposeSegment(this.segments.shift());
    }
  }

  rebase(shift) {
    this.nextZ0 += shift;
    for (const s of this.segments) {
      s.z0 += shift;
      s.group.position.z += shift;
    }
  }

  spawnSegment(z0) {
    const len = this.world.segmentLength;
    const group = new THREE.Group();
    group.position.z = z0;                       // geometry is local: z in [0, -len]
    const midMix = biomeMixAt(this.dist(z0 - len / 2));

    group.add(this.buildGround(z0, len));
    group.add(this.buildRoad(z0, len));

    this.group.add(group);
    const seg = { z0, group, mix: midMix };
    this.segments.push(seg);
    for (const fn of this.spawnHooks) fn(seg, this);
    return seg;
  }

  disposeSegment(seg) {
    seg.group.traverse(o => { if (o.geometry && !o.userData.noDispose) o.geometry.dispose(); });
    this.group.remove(seg.group);
  }

  // Side terrain grid (classic vaporwave wireframe ground + mountains).
  buildGround(z0, len) {
    const pos = [];
    const col = [];
    const cols = Math.round(GROUND_HALF * 2 / CELL) + 1;
    const rows = Math.round(len / CELL) + 1;
    const c = new THREE.Color();

    const H = (x, zLocal) => {
      const d = this.dist(z0 + zLocal);
      return terrainHeight(x, d, biomeMixAt(d));
    };
    const C = (zLocal) => {
      const d = this.dist(z0 + zLocal);
      const mix = biomeMixAt(d);
      return lerpColor(c, mix.a.grid, mix.b.grid, mix.t);
    };

    for (let i = 0; i < cols; i++) {
      const x = -GROUND_HALF + i * CELL;
      if (Math.abs(x) < ROAD_HALF + 0.5) continue;
      for (let j = 0; j < rows - 1; j++) {
        const za = -j * CELL, zb = -(j + 1) * CELL;
        pos.push(x, H(x, za), za, x, H(x, zb), zb);
        const ca = C(za), cb2 = C(zb);
        col.push(ca.r, ca.g, ca.b);
        col.push(cb2.r, cb2.g, cb2.b);
      }
    }
    for (let j = 0; j < rows; j++) {
      const z = -j * CELL;
      const rc = C(z);
      for (let i = 0; i < cols - 1; i++) {
        const xa = -GROUND_HALF + i * CELL;
        const xb = xa + CELL;
        // skip spans that cross the road
        if (xb > -(ROAD_HALF + 0.5) && xa < ROAD_HALF + 0.5) continue;
        pos.push(xa, H(xa, z), z, xb, H(xb, z), z);
        col.push(rc.r, rc.g, rc.b, rc.r, rc.g, rc.b);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return new THREE.LineSegments(geo, this.groundMat);
  }

  // Paved surface: black fill + neon markings.
  buildRoad(z0, len) {
    const sub = new THREE.Group();

    const fill = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, len), this.fillMat);
    fill.rotation.x = -Math.PI / 2;
    fill.position.set(0, 0, -len / 2);
    sub.add(fill);

    const c = new THREE.Color();
    const edgeC = (zLocal) => {
      const d = this.dist(z0 + zLocal);
      const mix = biomeMixAt(d);
      return lerpColor(c, mix.a.edge, mix.b.edge, mix.t);
    };
    const laneC = (zLocal) => {
      const d = this.dist(z0 + zLocal);
      const mix = biomeMixAt(d);
      return lerpColor(c, mix.a.lane, mix.b.lane, mix.t);
    };

    // bright markings (vertex-colored)
    const pos = [];
    const col = [];
    const pushLine = (x, za, zb, colorFn) => {
      const ca = colorFn(za).clone(); const cb2 = colorFn(zb);
      pos.push(x, LINE_Y, za, x, LINE_Y, zb);
      col.push(ca.r, ca.g, ca.b, cb2.r, cb2.g, cb2.b);
    };
    // solid edges
    pushLine(-ROAD_HALF, 0, -len, edgeC);
    pushLine(ROAD_HALF, 0, -len, edgeC);
    // center median double line
    pushLine(-1.0, 0, -len, edgeC);
    pushLine(1.0, 0, -len, edgeC);
    // dashed lane boundaries (3m on / 3m off)
    for (const x of [-6.75, 6.75]) {
      for (let z = 0; z > -len; z -= 6) {
        pushLine(x, z, z - 3, laneC);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    sub.add(new THREE.LineSegments(geo, this.markMat));

    // faint transverse scanlines across the tarmac
    const fpos = [];
    const fcol = [];
    for (let z = 0; z >= -len; z -= CELL) {
      const rc = laneC(z);
      fpos.push(-ROAD_HALF, 0.02, z, ROAD_HALF, 0.02, z);
      fcol.push(rc.r, rc.g, rc.b, rc.r, rc.g, rc.b);
    }
    const fgeo = new THREE.BufferGeometry();
    fgeo.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
    fgeo.setAttribute('color', new THREE.Float32BufferAttribute(fcol, 3));
    sub.add(new THREE.LineSegments(fgeo, this.faintMat));

    return sub;
  }
}
