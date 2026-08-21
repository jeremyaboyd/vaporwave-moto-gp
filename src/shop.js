import * as THREE from 'three';
import { neonMesh, edgeMaterial, glowQuad } from './assets.js';
import { UPGRADE_DEFS } from './upgrades.js';

// Roadside upgrade shop. One spawns every SHOP_EVERY metres on the right
// shoulder; drive through its gate to open the menu. The checkpoint clock is
// frozen while shopping (main.js skips world updates in the 'shop' phase).

const SHOP_EVERY = 2400;
const GATE_X_MIN = 10.8; // ride the right shoulder to enter

function makeSignTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = '900 64px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#ff2fd6';
  ctx.shadowBlur = 26;
  ctx.fillStyle = '#ffd1f4';
  ctx.fillText('SHOP', 128, 64);
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#ff2fd6';
  ctx.fillText('SHOP', 128, 64);
  return new THREE.CanvasTexture(c);
}
const signMat = new THREE.SpriteMaterial({
  map: makeSignTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});

function buildShopTemplate() {
  const g = new THREE.Group();
  // garage building just off the shoulder
  const hall = neonMesh(new THREE.BoxGeometry(10, 6, 14), '#ff2fd6');
  hall.position.set(22, 3, 0);
  g.add(hall);
  const door = neonMesh(new THREE.BoxGeometry(0.4, 4.5, 9), '#2fe9ff');
  door.position.set(16.9, 2.25, 0);
  g.add(door);
  const sign = new THREE.Sprite(signMat);
  sign.scale.set(9, 4.5, 1);
  sign.position.set(22, 8.6, 0);
  g.add(sign);
  // gate arch over the shoulder
  const pos = [
    11, 0, 0, 11, 5, 0,
    14.5, 0, 0, 14.5, 5, 0,
    11, 5, 0, 14.5, 5, 0,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.add(new THREE.LineSegments(geo, edgeMaterial('#3fff8f')));
  const beam = glowQuad(3.5, 0.35, '#3fff8f', 0.7);
  beam.position.set(12.75, 5, 0);
  g.add(beam);
  // chevrons on the shoulder leading in
  for (let i = 1; i <= 4; i++) {
    const ch = new THREE.BufferGeometry();
    ch.setAttribute('position', new THREE.Float32BufferAttribute([
      11.4, 0.06, i * 9 + 4, 12.75, 0.06, i * 9, 12.75, 0.06, i * 9, 14.1, 0.06, i * 9 + 4,
    ], 3));
    g.add(new THREE.LineSegments(ch, edgeMaterial('#3fff8f')));
  }
  g.traverse(o => { o.userData.noDispose = true; });
  return g;
}
const shopTpl = buildShopTemplate();

const shopEl = document.getElementById('shop');
const shopListEl = document.getElementById('shop-list');
const shopCashEl = document.getElementById('shop-cash');
const leaveBtn = document.getElementById('shop-leave');

export class Shop {
  constructor(scene, road, hud) {
    this.hud = hud;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.shops = [];       // { z, used, warned, mesh }
    this.nextShopD = SHOP_EVERY;
    this.open = false;
    this.hooks = { getCash: () => 0, spend: () => {}, upgrades: null, onLeave: () => {} };

    road.onSegment((seg, r) => {
      if (r.state.tutorial) return;
      const len = 60;
      const dStart = r.dist(seg.z0);
      const dEnd = r.dist(seg.z0 - len);
      if (dStart <= this.nextShopD && dEnd > this.nextShopD) {
        const z = seg.z0 - (this.nextShopD - dStart);
        const mesh = shopTpl.clone();
        mesh.position.z = z;
        this.group.add(mesh);
        this.shops.push({ z, used: false, warned: false, mesh });
        this.nextShopD += SHOP_EVERY;
      }
    });

    leaveBtn.addEventListener('click', () => this.leave());
    window.addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code === 'Enter' || e.code === 'Escape') { this.leave(); e.preventDefault(); return; }
      const n = Number(e.key);
      if (n >= 1 && n <= UPGRADE_DEFS.length) this.buy(UPGRADE_DEFS[n - 1].key);
      else if (n === UPGRADE_DEFS.length + 1) this.buy('repair');
    });
  }

  update(player, alive) {
    for (let i = this.shops.length - 1; i >= 0; i--) {
      const s = this.shops[i];
      if (s.z > player.z + 100) {
        this.group.remove(s.mesh);
        this.shops.splice(i, 1);
        continue;
      }
      if (!alive) continue;
      if (!s.warned && s.z < player.z - 40 && s.z > player.z - 420) {
        s.warned = true;
        this.hud.toast('NEON GARAGE AHEAD — RIGHT SHOULDER', 'warn');
      }
      if (!s.used && Math.abs(player.z - s.z) < 5 && player.x > GATE_X_MIN) {
        s.used = true;
        this.enter(player);
      }
    }
  }

  // manually place a garage (riding school finale)
  spawnAt(z) {
    const mesh = shopTpl.clone();
    mesh.position.z = z;
    this.group.add(mesh);
    const s = { z, used: false, warned: true, mesh };
    this.shops.push(s);
    return s;
  }

  enter(player) {
    this.open = true;
    player.speed = 0;
    this.render();
    shopEl.classList.add('open');
  }

  // graduation gift: menu opens with every upgrade free — one pick, then ride
  enterFree() {
    this.freeMode = true;
    this.open = true;
    this.render();
    shopEl.classList.add('open');
  }

  leave() {
    if (!this.open) return;
    this.open = false;
    this.freeMode = false;
    shopEl.classList.remove('open');
    this.hooks.onLeave();
  }

  buy(key) {
    const up = this.hooks.upgrades;
    if (key === 'repair') {
      const cost = up.repairCost();
      if (!up.canRepair() || this.hooks.getCash() < cost) return;
      this.hooks.spend(cost);
      up.repairArmor();
      this.hud.toast(`ARMOR PATCHED — ${up.armorLeft()} CHARGE${up.armorLeft() === 1 ? '' : 'S'}`, 'money');
      this.render();
      return;
    }
    if (this.freeMode) {
      if (up.maxed(key)) return;
      up.levels[key]++;
      this.freeMode = false;
      this.hud.toast(`${up.def(key).name} LV1 — ON THE HOUSE`, 'money');
      this.leave();
      return;
    }
    const cost = up.buy(key, this.hooks.getCash());
    if (cost < 0) return;
    this.hooks.spend(cost);
    this.hud.toast(`${up.def(key).name} LV${up.levels[key]}`, 'money');
    this.render();
  }

  render() {
    const up = this.hooks.upgrades;
    const cash = this.hooks.getCash();
    shopCashEl.textContent = this.freeMode
      ? 'STARTING GIFT — PICK 1 UPGRADE, FREE'
      : `CASH $${cash.toLocaleString()} — CLOCK PAUSED`;
    shopListEl.innerHTML = '';
    UPGRADE_DEFS.forEach((d, i) => {
      const lvl = up.levels[d.key];
      const maxed = up.maxed(d.key);
      const cost = maxed ? 0 : up.cost(d.key);
      const afford = !maxed && (this.freeMode || cash >= cost);
      const row = document.createElement('button');
      row.className = 'upgrade-row' + (afford ? '' : ' disabled');
      row.innerHTML = `
        <span class="num">${i + 1}</span>
        <span class="info">
          <div class="uname">${d.name} <span class="pips">${'▮'.repeat(lvl)}${'▯'.repeat(d.max - lvl)}</span></div>
          <div class="udesc">${d.desc}</div>
        </span>
        <span class="cost">${maxed ? 'MAX' : (this.freeMode ? 'FREE' : '$' + cost.toLocaleString())}</span>`;
      if (afford) row.addEventListener('click', () => this.buy(d.key));
      shopListEl.appendChild(row);
    });

    // repair row: only offered once armor has actually taken a hit
    if (!this.freeMode && up.canRepair()) {
      const cost = up.repairCost();
      const afford = cash >= cost;
      const row = document.createElement('button');
      row.className = 'upgrade-row' + (afford ? '' : ' disabled');
      row.innerHTML = `
        <span class="num">6</span>
        <span class="info">
          <div class="uname">REPAIR ARMOR <span class="pips">${'▮'.repeat(up.armorLeft())}${'▯'.repeat(up.armorUsed)}</span></div>
          <div class="udesc">Restore 1 spent armor charge</div>
        </span>
        <span class="cost">$${cost.toLocaleString()}</span>`;
      if (afford) row.addEventListener('click', () => this.buy('repair'));
      shopListEl.appendChild(row);
    }
  }

  rebase(shift) {
    for (const s of this.shops) { s.z += shift; s.mesh.position.z = s.z; }
  }

  reset() {
    for (const s of this.shops) this.group.remove(s.mesh);
    this.shops = [];
    this.nextShopD = SHOP_EVERY;
    this.leaveSilently();
  }

  leaveSilently() {
    this.open = false;
    this.freeMode = false;
    shopEl.classList.remove('open');
  }
}
