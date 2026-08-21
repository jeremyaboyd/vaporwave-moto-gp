// Riding School: an empty road (spawners are suppressed by state.tutorial)
// where prompts teach each control. A lesson completes when the player
// actually performs it.

const isTouchUI = () => document.body.classList.contains('tilt-on') || document.body.classList.contains('touch');
// which control scheme is actually live right now
const uiMode = () => document.body.classList.contains('tilt-on') ? 'tilt'
  : (document.body.classList.contains('touch') ? 'touch' : 'desk');
const byMode = (tilt, touch, desk) => ({ tilt, touch, desk })[uiMode()];

const lessonEl = () => document.getElementById('school-lesson');
const stepEl = () => document.getElementById('school-step');
const promptEl = () => document.getElementById('school-prompt');

export class School {
  // deps: { player, obstacles, pickups, upgrades, hud, state, onExit }
  constructor(deps) {
    this.d = deps;
    this.running = false;

    this.lessons = [
      {
        text: () => byMode('TILT FORWARD TO ACCELERATE', 'HOLD GAS TO ACCELERATE', 'HOLD W TO ACCELERATE'),
        done: () => this.d.player.speed > 30,
      },
      {
        text: () => byMode('TILT BACK TO BRAKE', 'HOLD BRK TO BRAKE', 'HOLD S TO BRAKE'),
        done: () => {
          if (this.d.player.speed > 25) this.f.wasFast = true;
          return this.f.wasFast && this.d.player.speed < 8;
        },
      },
      {
        text: () => byMode('TILT LEFT AND RIGHT TO LEAN', 'USE THE ARROWS TO LEAN BOTH WAYS', 'TAP A AND D TO LEAN LEFT AND RIGHT'),
        done: () => {
          if (this.d.player.lean < -0.4) this.f.leanL = true;
          if (this.d.player.lean > 0.4) this.f.leanR = true;
          return this.f.leanL && this.f.leanR;
        },
      },
      {
        text: () => 'HIT THE RAMP FOR BIG AIR',
        setup: () => this.spawnLessonRamp(),
        done: () => {
          if (this.d.player.airborne) return true;
          // missed it — put another one ahead
          if (this.ramp && this.d.player.z < this.ramp.z - 40) this.spawnLessonRamp();
          return false;
        },
      },
      {
        text: () => byMode('HOLD THE BST BUTTON TO BOOST', 'HOLD THE BST BUTTON TO BOOST', 'HOLD SPACE TO BOOST'),
        setup: () => {
          this.d.upgrades.levels.boost = Math.max(1, this.d.upgrades.levels.boost);
          this.d.player.boostMeter = 1;
        },
        done: (dt) => {
          if (this.d.player.boosting) this.f.boostT = (this.f.boostT || 0) + dt;
          return (this.f.boostT || 0) > 0.4;
        },
      },
      {
        text: () => 'GRAB THE CASH AHEAD',
        setup: () => this.spawnLessonCash(),
        done: () => {
          if (this.d.state.cash > this.f.cashStart) return true;
          if (this.cashZ && this.d.player.z < this.cashZ - 40) this.spawnLessonCash();
          return false;
        },
      },
      {
        text: () => 'GRADUATION: PULL INTO THE NEON GARAGE — RIGHT SHOULDER',
        setup: () => this.spawnLessonGarage(),
        done: () => {
          const s = this.garage;
          if (!s) return false;
          if (Math.abs(this.d.player.z - s.z) < 5 && this.d.player.x > 10.8) return true;
          if (this.d.player.z < s.z - 40) this.spawnLessonGarage(); // missed — another ahead
          return false;
        },
      },
    ];

    window.addEventListener('keydown', (e) => {
      if (this.running && e.code === 'Escape') this.exit();
    });
    document.getElementById('school-quit').addEventListener('click', () => {
      if (this.running) this.exit();
    });
  }

  start() {
    this.running = true;
    this.completed = false;
    this.idx = 0;
    this.f = {};
    promptEl().style.display = 'block';
    document.getElementById('school-quit').style.display = 'block';
    this.applyLesson();
  }

  applyLesson() {
    this.f = { cashStart: this.d.state.cash };
    const L = this.lessons[this.idx];
    if (L.setup) L.setup();
    lessonEl().textContent = L.text();
    stepEl().textContent = `LESSON ${this.idx + 1} / ${this.lessons.length}` + (isTouchUI() ? '' : ' — ESC TO QUIT');
  }

  spawnLessonRamp() {
    const x = Math.min(9.5, Math.max(4, this.d.player.x));
    this.ramp = this.d.obstacles.spawnRamp(x, this.d.player.z - 160);
  }

  spawnLessonCash() {
    const x = Math.min(9.5, Math.max(-9.5, this.d.player.x));
    this.cashZ = this.d.player.z - 140;
    for (let i = 0; i < 5; i++) this.d.pickups.spawnOne(x, 1.2, this.cashZ - i * 5);
  }

  spawnLessonGarage() {
    this.garage = this.d.shop.spawnAt(this.d.player.z - 240);
  }

  update(dt) {
    if (!this.running || this.completed) return;
    const L = this.lessons[this.idx];
    if (L.done(dt)) {
      this.idx++;
      if (this.idx >= this.lessons.length) {
        // graduation: entering the garage drops you into the real game
        this.completed = true;
        this.running = false;
        promptEl().style.display = 'none';
        document.getElementById('school-quit').style.display = 'none';
        this.d.onGraduate();
      } else {
        this.d.hud.toast('NICE!', 'money');
        this.applyLesson();
      }
    }
  }

  exit() {
    if (!this.running) return;
    this.running = false;
    promptEl().style.display = 'none';
    document.getElementById('school-quit').style.display = 'none';
    this.d.onExit();
  }
}
