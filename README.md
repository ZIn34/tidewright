# Tidewright

A one-thumb mobile puzzle game about building sandcastles against a rising tide.

Every level is a beach that floods on a timer. Dig wet sand from near the water, pile it onto the blueprint outlines, and keep every structure standing through a set number of waves. Wet sand holds its shape; dry sand crumbles and washes away. Moats swallow the surge before it hits your walls, as long as you leave a gap so they don't undermine them.

**Play it:** open `Tidewright.html` in any browser. It is a single self-contained file. On a phone it plays in portrait with one thumb.

## Controls

- **Dig** mode: drag over sand to fill your bucket. The bucket remembers how wet the sand was.
- **Build** mode: drag over the beach to place sand. Hold on a cell to pile it higher.
- **Wave**: call the next wave early instead of waiting out the timer.
- Keyboard: `D` dig, `B` build, `Space` call the wave.

Structures are checked when each wave arrives and again after the last one settles. Build to at least the number on each outline, and overbuild for a buffer.

## Project layout

| File | Purpose |
| --- | --- |
| `sim.js` | Beach simulation: cellular water flow, moisture, erosion, slumping. No DOM. |
| `levels.js` | The ten hand-made levels: blueprints, rocks, wave sequences. |
| `game.js` | Rendering, touch input, HUD, level flow, wave animation. |
| `index.html` | Page shell and styles. Loads the three scripts. |
| `build.js` | Inlines everything into `dist/tidewright.html` (artifact fragment) and `Tidewright.html` (standalone). |
| `tune.js` | Headless harness: wave reach, wall erosion, moat effect, perf. |
| `devserver.js` | Dev-only static server that also accepts frame uploads for headless render checks. |

## Working on it

```bash
node build.js
```

rebuilds both output files. Run `node tune.js` after changing simulation constants to see how far each wave strength reaches and how walls hold up.

## Sim in one paragraph

Each cell has a base ground height (the beach slopes up from the sea), a sand height the player changes, a moisture value, and a water depth. Waves inject water into the sea row with a sine envelope; water flows to neighbours by surface height and drains back to sea. Water soaks into sand as moisture, which decays in the sun. Built sand erodes when water rushes past or presses against it, faster when dry. Sand taller than its moisture allows slumps into lower neighbours. Only the part of a neighbouring water column above a wall's base counts as touching it, which is why moats work.
