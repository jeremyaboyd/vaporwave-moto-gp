# NEON NIGHTRIDER

Infinite moto-GP street runner in a vaporwave wireframe world. Ride forever,
weave through traffic, hit ramps for big air, and survive as long as you can —
the score only stops when you do.

## Run it

Any static file server works (ES modules need HTTP, not `file://`):

```bash
npx http-server -p 8123 -c-1 .
```

Then open http://localhost:8123. Three.js loads from a CDN — no build step, no
dependencies to install.

## Controls

| Input | Action |
|---|---|
| **W** / ↑ | Accelerate |
| **S** / ↓ | Brake |
| **A** / **D** (← / →) | Lean left / right |
| **Space** | Boost (needs the Boost upgrade) |
| **Mouse** | Look around |
| **Enter** / click | Start |
| **R** | Restart after a crash |
| **1–5 / Enter / Esc** | Buy / leave, inside the shop |

On touch devices, on-screen GAS / BRK / arrows appear automatically; tap
anywhere to start or restart.

## How it works

- **Infinite road** — `road.js` spawns 60 m segments ahead of the player and
  recycles them behind. The world rebases every 4 km to keep float precision.
- **Biomes** — `biomes.js` defines Neon City, Desert Highway, Coastal Road,
  Downtown, and Night Bridge as parameter sets (colors, terrain amplitude,
  scenery densities). Blocks are ~1.5 km with a 300 m **linear blend** between
  them, sampled per-vertex so transitions sweep smoothly along the road.
- **Traffic** — `traffic.js` spawns wireframe cars and trucks; left lanes are
  oncoming. Density ramps with distance. Near misses at speed score bonus
  points; contact is death (unless you're in the air above the roof line).
- **Obstacles & ramps** — `obstacles.js` places barrels, crates, and barriers
  (one touch kills) plus ramps that launch you with speed-dependent air.
- **Scoring** — distance × speed multiplier, +150 per near miss, +400/s
  airborne. High score persists in `localStorage`.
- **Checkpoints** — the road is cut into 600 m sections; reach each checkpoint
  before the clock hits zero (limits tighten as you go). Sections grade you:
  avg speed over 150 km/h, 5+ near misses, and 1.5 s+ of air each pay cash.
- **Cash & upgrades** — grab `$` pickups on the road and arced over ramps.
  Every 2.4 km a **Neon Garage** appears on the right shoulder; drive through
  its gate to pause the clock and buy: Armor (each level eats one crash),
  Acceleration, Top Speed, Brakes, and Boost (Space: 2x accel, 1 s of burn per
  level, 1 s regenerates every 5 s). Everything resets on death — it's a
  roguelike.
- **Look** — everything is black-filled meshes with neon edge lines, a striped
  synthwave sun, vertex-colored terrain grid, and (on desktop) bloom.
