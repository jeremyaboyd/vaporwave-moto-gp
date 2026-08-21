// HUD + scoring + arcade high-score table.
// Score = distance + speed bonus + near misses + air time; riding the
// oncoming carriageway multiplies the rolling score by 1.2.

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
const wrongEl = el('wrongway');
const hsPanel = el('hs-panel');
const hsBody = document.querySelector('#hs-table tbody');
const initialsEntry = el('initials-entry');
const initialsInput = el('initials-input');
const menuBtns = document.querySelector('.menu-btns');

const HS_KEY = 'neon-nightrider-highscore';        // legacy single value
const HS_LIST_KEY = 'neon-nightrider-highscores';  // [{initials, score, date}]
const MAX_SCORES = 5;

function loadScores() {
  try {
    const raw = localStorage.getItem(HS_LIST_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* corrupted storage — start fresh */ }
  // migrate the old single high score into the table
  const legacy = Number(localStorage.getItem(HS_KEY) || 0);
  return legacy > 0 ? [{ initials: '---', score: legacy, date: Date.now() }] : [];
}

export class Hud {
  constructor() {
    this.score = 0;
    this.scores = loadScores();
    this.lastNearMisses = 0;
    this.sortKey = 'score';
    this.enteringInitials = false;
    this.pendingScore = 0;
    this.latestDate = 0;
    this.refreshBest();

    document.querySelectorAll('#hs-table th[data-k]').forEach(th => {
      th.addEventListener('click', () => {
        this.sortKey = th.dataset.k;
        document.querySelectorAll('#hs-table th').forEach(t => t.classList.toggle('sorted', t === th));
        this.renderScores();
      });
    });
    el('initials-ok').addEventListener('click', () => this.commitInitials());
    initialsInput.addEventListener('keydown', (e) => {
      e.stopPropagation(); // typing must never trigger game keys (R restart!)
      if (e.key === 'Enter') this.commitInitials();
    });
  }

  refreshBest() {
    this.best = this.scores.reduce((m, s) => Math.max(m, s.score), 0);
    highEl.textContent = Math.floor(this.best).toLocaleString();
  }

  reset() {
    this.score = 0;
    this.lastNearMisses = 0;
  }

  update(dt, player, traffic, scoring, timeAlive) {
    const wrongWay = scoring && player.x < -1.35 && player.y < 2;
    if (scoring) {
      const mult = wrongWay ? 1.2 : 1;
      this.score += player.speed * dt * (1 + player.speed / 60) * mult;
      if (traffic.nearMisses > this.lastNearMisses) {
        this.score += (traffic.nearMisses - this.lastNearMisses) * 150 * mult;
        this.lastNearMisses = traffic.nearMisses;
      }
      if (player.airborne) this.score += dt * 400 * mult;
      if (this.score > this.best) {
        this.best = this.score;
        highEl.textContent = Math.floor(this.best).toLocaleString();
      }
    }
    wrongEl.style.display = wrongWay ? 'block' : 'none';
    scoreEl.textContent = Math.floor(this.score).toLocaleString();
    speedEl.textContent = player.kmh;
    distEl.textContent = (player.distance / 1000).toFixed(2) + ' KM';
    timeEl.textContent = formatTime(timeAlive);
  }

  // --- high score table ---

  qualifies(score) {
    if (score < 100) return false;
    if (this.scores.length < MAX_SCORES) return true;
    return score > Math.min(...this.scores.map(s => s.score));
  }

  insertScore(initials, score) {
    this.latestDate = Date.now();
    this.scores.push({ initials, score: Math.floor(score), date: this.latestDate });
    this.scores.sort((a, b) => b.score - a.score);
    this.scores = this.scores.slice(0, MAX_SCORES);
    localStorage.setItem(HS_LIST_KEY, JSON.stringify(this.scores));
    this.refreshBest();
  }

  renderScores() {
    hsPanel.style.display = this.scores.length ? 'block' : 'none';
    const sorted = [...this.scores].sort((a, b) => {
      if (this.sortKey === 'initials') return a.initials.localeCompare(b.initials);
      if (this.sortKey === 'date') return b.date - a.date;
      return b.score - a.score;
    });
    hsBody.innerHTML = '';
    sorted.forEach((s, i) => {
      const tr = document.createElement('tr');
      if (s.date === this.latestDate) tr.className = 'latest';
      tr.innerHTML = `<td>${i + 1}</td><td>${s.initials}</td>` +
        `<td>${s.score.toLocaleString()}</td>` +
        `<td>${new Date(s.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>`;
      hsBody.appendChild(tr);
    });
  }

  commitInitials() {
    if (!this.enteringInitials) return;
    const initials = (initialsInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'AAA').padEnd(3, '·').slice(0, 3);
    this.insertScore(initials, this.pendingScore);
    this.enteringInitials = false;
    initialsEntry.style.display = 'none';
    overlayPrompt.style.display = '';
    this.renderScores();
    initialsInput.blur();
  }

  // --- overlay modes ---

  showMenu() {
    overlay.querySelector('h1').innerHTML = 'NEON<br>NIGHTRIDER';
    overlaySub.textContent = 'INFINITE MOTO-GP STREET RUNNER';
    overlayScore.style.display = 'none';
    overlayPrompt.textContent = 'PRESS ENTER / TAP PLAY';
    overlayPrompt.style.display = '';
    menuBtns.style.display = 'flex';
    initialsEntry.style.display = 'none';
    this.enteringInitials = false;
    this.renderScores();
    overlay.classList.remove('hidden');
    document.body.classList.add('overlay-open');
  }

  showDeath(score, reason = 'YOU RODE INTO THE GRID') {
    overlay.querySelector('h1').innerHTML = 'GAME<br>OVER';
    overlaySub.textContent = reason;
    overlayScore.style.display = 'block';
    overlayScore.textContent = 'SCORE ' + Math.floor(score).toLocaleString();
    menuBtns.style.display = 'flex';
    if (this.qualifies(score)) {
      this.pendingScore = score;
      this.enteringInitials = true;
      initialsInput.value = '';
      initialsEntry.style.display = 'flex';
      overlayPrompt.style.display = 'none';
      setTimeout(() => initialsInput.focus(), 50);
    } else {
      initialsEntry.style.display = 'none';
      overlayPrompt.textContent = 'PRESS R / TAP TO RESTART';
      overlayPrompt.style.display = '';
    }
    this.renderScores();
    overlay.classList.remove('hidden');
    document.body.classList.add('overlay-open');
  }

  hideOverlay() {
    overlay.classList.add('hidden');
    document.body.classList.remove('overlay-open');
  }

  // --- misc HUD ---

  setCash(cash, pulse) {
    cashEl.textContent = '$' + cash.toLocaleString();
    if (pulse) {
      cashEl.classList.remove('pulse');
      void cashEl.offsetWidth;
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
}

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
