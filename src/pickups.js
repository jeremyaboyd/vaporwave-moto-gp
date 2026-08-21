import * as THREE from 'three';

// Cash pickups: glowing $ sprites in rows on the tarmac, or arced over ramps
// so only a jump collects them.

const VALUE = 25;

function makeCashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = '900 96px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#3fff8f';
  ctx.shadowBlur = 24;
  ctx.fillStyle = '#b8ffd9';
  ctx.fillText('$', 64, 68);
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#3fff8f';
  ctx.fillText('$', 64, 68);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

const cashMat = new THREE.SpriteMaterial({
  map: makeCashTexture(),
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

export class Pickups {
  constructor(scene, world, road, obstacles) {
    this.world = world;
    this.obstacles = obstacles;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.items = [];
    this.t = 0;
    road.onSegment((seg, r) => this.populateSegment(seg, r));
  }

  spawnOne(x, y, z) {
    const s = new THREE.Sprite(cashMat);
    s.scale.set(1.5, 1.5, 1);
    s.position.set(x, y, z);
    this.group.add(s);
    this.items.push({ mesh: s, x, baseY: y, z, phase: Math.random() * 6 });
  }

  populateSegment(seg, road) {
    if (road.state.tutorial) return; // riding school spawns its own cash
    const d = road.dist(seg.z0);
    if (d < 200) return;
    const { laneXs, segmentLength } = this.world;

    // arc over any ramp in this segment: rewards the jump line
    const ramps = this.obstacles.ramps.filter(rp => rp.z <= seg.z0 && rp.z > seg.z0 - segmentLength);
    for (const rp of ramps) {
      const top = rp.z - 5.5; // ramp top edge
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const z = top - 4 - t * 22;
        const y = 3.2 + Math.sin(t * Math.PI) * 1.8; // follows the flight arc
        this.spawnOne(rp.x, y, z);
      }
      return; // ramp segments get the arc only
    }

    // otherwise: occasional row along a lane
    if (Math.random() < 0.3) {
      const x = laneXs[Math.floor(Math.random() * laneXs.length)];
      const z0 = seg.z0 - 8 - Math.random() * (segmentLength - 30);
      for (let i = 0; i < 4; i++) {
        const z = z0 - i * 5;
        // don't bury cash inside a killer obstacle
        if (this.obstacles.killers.some(o => Math.abs(o.x - x) < 2 && Math.abs(o.z - z) < 3)) continue;
        this.spawnOne(x, 1.2, z);
      }
    }
  }

  update(dt, player, alive, addCash) {
    this.t += dt;
    const behind = player.z + 30;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.mesh.position.y = it.baseY + Math.sin(this.t * 3 + it.phase) * 0.22;
      if (it.z > behind) {
        this.group.remove(it.mesh);
        this.items.splice(i, 1);
        continue;
      }
      if (!alive) continue;
      if (Math.abs(player.z - it.z) < 2.8 &&
          Math.abs(player.x - it.x) < 1.7 &&
          Math.abs((player.y + 1.2) - it.baseY) < 1.8) {
        this.group.remove(it.mesh);
        this.items.splice(i, 1);
        addCash(VALUE, 'pickup');
      }
    }
  }

  rebase(shift) { for (const it of this.items) { it.z += shift; it.mesh.position.z = it.z; } }

  reset() {
    for (const it of this.items) this.group.remove(it.mesh);
    this.items = [];
  }
}
