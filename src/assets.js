import * as THREE from 'three';

// Neon wireframe construction kit: every solid is a black fill (occluder)
// plus glowing edge lines.

const fillMat = new THREE.MeshBasicMaterial({
  color: '#05010d',
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});

const edgeMatCache = new Map();
export function edgeMaterial(color) {
  if (!edgeMatCache.has(color)) {
    edgeMatCache.set(color, new THREE.LineBasicMaterial({ color }));
  }
  return edgeMatCache.get(color);
}

// A solid black shape with neon edges. Shares geometry-derived edges per call
// site (callers should reuse geometries when instancing many).
export function neonMesh(geometry, color, edgesThreshold = 12) {
  const g = new THREE.Group();
  const fill = new THREE.Mesh(geometry, fillMat);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, edgesThreshold),
    edgeMaterial(color),
  );
  g.add(fill, edges);
  return g;
}

// Pure wireframe (no fill) for open shapes like ramps' grid faces.
export function wireMesh(geometry, color) {
  return new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 1), edgeMaterial(color));
}

// Small glowing quad (tail lights, headlights, powerup cores).
export function glowQuad(w, h, color, opacity = 0.9) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  return m;
}
