import * as THREE from 'three';

// Biome definitions + linear blending between them along distance travelled.
// Everything that varies per-biome is a parameter here; road/scenery sample
// blended params at a given world z.

export const BIOMES = [
  {
    name: 'NEON CITY',
    ground: '#3a0d6e', grid: '#b02fff', lane: '#2fe9ff', edge: '#ff2fd6',
    fog: '#0a0318',
    ampL: 0, ampR: 0,
    scenery: { palm: 0.25, cactus: 0, building: 0.9, streetlight: 0.8, tower: 0.15, bldH: 26 },
  },
  {
    name: 'DESERT HIGHWAY',
    ground: '#5e1470', grid: '#ff5ecb', lane: '#ffd23f', edge: '#ff2fd6',
    fog: '#140420',
    ampL: 26, ampR: 34,
    scenery: { palm: 0, cactus: 0.85, building: 0, streetlight: 0.12, tower: 0 },
  },
  {
    name: 'COASTAL ROAD',
    ground: '#082b4a', grid: '#2fe9ff', lane: '#2fe9ff', edge: '#ff2fd6',
    fog: '#051325',
    ampL: 0, ampR: 46,
    scenery: { palm: 0.9, cactus: 0, building: 0, streetlight: 0.3, tower: 0 },
  },
  {
    name: 'DOWNTOWN',
    ground: '#1c0b3d', grid: '#7a5cff', lane: '#ff5ecb', edge: '#2fe9ff',
    fog: '#0b0520',
    ampL: 0, ampR: 0,
    scenery: { palm: 0.1, cactus: 0, building: 1.0, streetlight: 0.9, tower: 0.5, bldH: 50 },
  },
  {
    name: 'NIGHT BRIDGE',
    ground: '#041629', grid: '#1fb6d8', lane: '#2fe9ff', edge: '#ff2fd6',
    fog: '#04101f',
    ampL: 0, ampR: 0,
    scenery: { palm: 0, cactus: 0, building: 0.05, streetlight: 0, tower: 0, bridge: 1 },
  },
];

const BIOME_LEN = 1500;   // metres per biome block
const TRANS_LEN = 300;    // linear blend zone at the end of each block

// Deterministic pseudo-random biome order (never repeats back-to-back).
function hash(n) {
  let x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
const blockCache = new Map();
function biomeIndexForBlockRaw(block) {
  if (block <= 0) return 0;
  if (blockCache.has(block)) return blockCache.get(block);
  const prev = biomeIndexForBlockRaw(block - 1);
  let idx = Math.floor(hash(block) * BIOMES.length);
  if (idx === prev) idx = (idx + 1) % BIOMES.length;
  blockCache.set(block, idx);
  return idx;
}

// Returns { a, b, t, name } — biomes a→b with linear blend factor t at distance d.
export function biomeMixAt(d) {
  if (d < 0) d = 0;
  const block = Math.floor(d / BIOME_LEN);
  const local = d - block * BIOME_LEN;
  const a = BIOMES[biomeIndexForBlockRaw(block)];
  const b = BIOMES[biomeIndexForBlockRaw(block + 1)];
  const t = local > BIOME_LEN - TRANS_LEN
    ? (local - (BIOME_LEN - TRANS_LEN)) / TRANS_LEN
    : 0;
  return { a, b, t, name: t < 0.5 ? a.name : b.name };
}

const _ca = new THREE.Color();
const _cb = new THREE.Color();
export function lerpColor(target, hexA, hexB, t) {
  _ca.set(hexA); _cb.set(hexB);
  target.copy(_ca).lerp(_cb, t);
  return target;
}
export function lerpNum(a, b, t) { return a + (b - a) * t; }

export function sceneryDensity(mix, key) {
  return lerpNum(mix.a.scenery[key] ?? 0, mix.b.scenery[key] ?? 0, mix.t);
}
