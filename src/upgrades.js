// Per-run upgrade levels (roguelike: everything resets on death).

export const UPGRADE_DEFS = [
  { key: 'armor', name: 'ARMOR', desc: 'Each level shrugs off 1 crash', base: 500, growth: 1.6, max: 5 },
  { key: 'accel', name: 'ACCELERATION', desc: '+15% acceleration per level', base: 400, growth: 1.5, max: 5 },
  { key: 'top', name: 'TOP SPEED', desc: '+8% top speed per level', base: 450, growth: 1.5, max: 5 },
  { key: 'brakes', name: 'BRAKES', desc: '+20% braking per level', base: 250, growth: 1.5, max: 5 },
  { key: 'boost', name: 'BOOST', desc: '+1s boost [SPACE], 2x accel · 1s regens in 5s', base: 600, growth: 1.5, max: 5 },
];

export class Upgrades {
  constructor() { this.reset(); }

  reset() {
    this.levels = { armor: 0, accel: 0, top: 0, brakes: 0, boost: 0 };
    this.armorUsed = 0;
  }

  def(key) { return UPGRADE_DEFS.find(d => d.key === key); }

  cost(key) {
    const d = this.def(key);
    return Math.round(d.base * Math.pow(d.growth, this.levels[key]) / 10) * 10;
  }

  maxed(key) { return this.levels[key] >= this.def(key).max; }

  buy(key, cash) {
    if (this.maxed(key)) return -1;
    const c = this.cost(key);
    if (cash < c) return -1;
    this.levels[key]++;
    return c;
  }

  armorLeft() { return Math.max(0, this.levels.armor - this.armorUsed); }
  useArmor() { this.armorUsed++; }

  accelMul() { return 1 + 0.15 * this.levels.accel; }
  topMul() { return 1 + 0.08 * this.levels.top; }
  brakeMul() { return 1 + 0.2 * this.levels.brakes; }
  boostCap() { return this.levels.boost; } // seconds
}
