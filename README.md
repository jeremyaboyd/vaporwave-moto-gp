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
| **Mouse** | Look around |
| **Enter** / click | Start |
| **R** | Restart after a crash |

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
- **Look** — everything is black-filled meshes with neon edge lines, a striped
  synthwave sun, vertex-colored terrain grid, and (on desktop) bloom.
