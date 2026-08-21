// HUD + scoring. Score = distance + speed bonus + near misses + air time.

const el = (id) => document.getElementById(id);
const scoreEl = el('score');
const highEl = el('high-score');
const speedEl = el('speed');
const distEl = el('distance');
const timeEl = el('time-alive');
const overlay = el('overlay');
const overlaySub = el('overlay-sub');
const overlayScore = el('overlay-score');
const overlayPrompt = el('overlay-prompt');

const cashEl = el('cash');
const timerEl = el('timer');
const armorEl = el('hud-armor');
const boostWrap = el('hud-boost');
const boostFill = el('boost-fill');
const toastsEl = el('toasts');

const HS_KEY = 'neon-nightrider-highscore';

export class Hud {
  constructor() {
    this.score = 0;
    this.airBonusShown = 0;
    this.highScore = Number(localStorage.getItem(HS_KEY) || 0);
    this.lastNearMisses = 0;
    highEl.textContent = Math.floor(this.highScore).toLocaleString();
  }

  reset() {
    this.score = 0;
    this.lastNearMisses = 0;
  }

  update(dt, player, traffic, alive, timeAlive) {
    if (alive) {
      // distance is the backbone; riding fast multiplies it
      this.score += player.speed * dt * (1 + player.speed / 60);
      // near-miss bonus
      if (traffic.nearMisses > this.lastNearMisses) {
        this.score += (traffic.nearMisses - this.lastNearMisses) * 150;
        this.lastNearMisses = traffic.nearMisses;
      }
      // air time bonus
      if (player.airborne) this.score += dt * 400;

      if (this.score > this.highScore) {
        this.highScore = this.score;
        highEl.textContent = Math.floor(this.highScore).toLocaleString();
      }
    }
    scoreEl.textContent = Math.floor(this.score).toLocaleString();
    if (!alive && overlayScore.style.display === 'block') {
      overlayScore.textContent = 'SCORE ' + Math.floor(this.score).toLocaleString();
    }
    speedEl.textContent = player.kmh;
    distEl.textContent = (player.distance / 1000).toFixed(2) + ' KM';
    timeEl.textContent = formatTime(timeAlive);
  }

  setCash(cash, pulse) {
    cashEl.textContent = '$' + cash.toLocaleString();
    if (pulse) {
      cashEl.classList.remove('pulse');
      void cashEl.offsetWidth; // restart the transition
      cashEl.classList.add('pulse');
      clearTimeout(this._pulseT);
      this._pulseT = setTimeout(() => cashEl.classList.remove('pulse'), 140);
    }
  }

  setTimer(t, active) {
    if (!active) { timerEl.textContent = '--'; timerEl.classList.remove('low'); return; }
    timerEl.textContent = Math.max(0, t).toFixed(1);
    timerEl.classList.toggle('low', t < 5);
  }

  setArmor(n) {
    const txt = n > 0 ? '▮'.repeat(n) : '';
    if (armorEl.textContent !== txt) armorEl.textContent = txt;
  }

  setBoost(meter, cap, boosting) {
    boostWrap.style.display = cap > 0 ? '' : 'none';
    if (cap > 0) {
      boostFill.style.width = (meter / cap * 100).toFixed(1) + '%';
      boostWrap.classList.toggle('boosting', boosting);
    }
  }

  toast(text, kind = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.textContent = text;
    toastsEl.appendChild(t);
    setTimeout(() => t.remove(), 2700);
  }

  showDeath(score, reason = 'YOU RODE INTO THE GRID') {
    localStorage.setItem(HS_KEY, String(Math.floor(this.highScore)));
    overlay.querySelector('h1').innerHTML = 'GAME<br>OVER';
    overlaySub.textContent = reason;
    overlayScore.style.display = 'block';
    overlayScore.textContent = 'SCORE ' + Math.floor(score).toLocaleString();
    overlayPrompt.textContent = 'PRESS R / TAP TO RESTART';
    overlay.classList.remove('hidden');
  }

  hideOverlay() { overlay.classList.add('hidden'); }
}

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
