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
    speedEl.textContent = player.kmh;
    distEl.textContent = (player.distance / 1000).toFixed(2) + ' KM';
    timeEl.textContent = formatTime(timeAlive);
  }

  showDeath(score) {
    localStorage.setItem(HS_KEY, String(Math.floor(this.highScore)));
    overlay.querySelector('h1').innerHTML = 'GAME<br>OVER';
    overlaySub.textContent = 'YOU RODE INTO THE GRID';
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
