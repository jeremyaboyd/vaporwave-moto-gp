// Checkpoint timer + per-section bonuses. The road is carved into fixed
// sections; reach the next checkpoint before the clock hits zero or the run
// ends. Section stats are graded at each checkpoint and pay out cash.

export const SECTION_LEN = 600; // metres

function timeLimitAt(d) {
  // 24s for the first sections, tightening to 16s deep into a run
  return Math.max(16, 24 - d / 1500);
}

export class Checkpoints {
  constructor(hud) {
    this.hud = hud;
    this.reset();
  }

  reset() {
    this.nextAt = SECTION_LEN;
    this.timeLeft = timeLimitAt(0);
    this.secTime = 0;
    this.secAir = 0;
    this.secNearMissBase = 0;
    this.section = 1;
  }

  // returns false when the clock ran out
  update(dt, player, traffic, addCash) {
    this.timeLeft -= dt;
    this.secTime += dt;
    if (player.airborne) this.secAir += dt;

    if (player.distance >= this.nextAt) {
      const avgKmh = (SECTION_LEN / this.secTime) * 3.6;
      let payout = 100; // base checkpoint reward
      const notes = [];
      if (avgKmh > 150) { payout += 250; notes.push(`AVG ${Math.round(avgKmh)} KM/H +$250`); }
      const misses = traffic.nearMisses - this.secNearMissBase;
      if (misses >= 5) { payout += 200; notes.push(`${misses} NEAR MISSES +$200`); }
      if (this.secAir > 1.5) { payout += 150; notes.push(`${this.secAir.toFixed(1)}s AIR TIME +$150`); }

      const limit = timeLimitAt(player.distance);
      this.timeLeft = limit + Math.min(Math.max(this.timeLeft, 0), 6); // carry up to 6s
      this.hud.toast(`CHECKPOINT ${this.section} — +${Math.round(limit)}s`, '');
      for (const n of notes) this.hud.toast(n, 'money');
      addCash(payout, null);

      this.section++;
      this.nextAt += SECTION_LEN;
      this.secTime = 0;
      this.secAir = 0;
      this.secNearMissBase = traffic.nearMisses;
    }

    return this.timeLeft > 0;
  }
}
