# Tidewright

A one-thumb mobile puzzle game about building sandcastles against a rising tide.

Every level is a beach that floods on a timer. Your castle starts built. Dig moats, raise outer walls, and patch the damage between waves to keep every tower, keep, and wall standing through a set number of waves. Wet sand holds its shape; dry sand crumbles and washes away. Moats swallow the surge before it hits your walls, as long as you leave a gap so they don't undermine them.

**Play it:** open `Tidewright.html` in any browser. It is a single self-contained file. On a phone it plays in portrait with one thumb.

## Controls

- **Dig** mode: drag over sand to fill your bucket. The bucket remembers how wet the sand was.
- **Build** mode: drag over the beach to place sand. Hold on a cell to pile it higher.
- **Wave**: call the next wave early instead of waiting out the timer.
- Keyboard: `D` dig, `B` build, `Space` call the wave.

Structures are checked when each wave arrives and again after the last one settles. A breached piece shows an amber outline with the height to rebuild it to. Overbuild for a buffer.

## With friends

No server anywhere. Every mode works on the GitHub Pages site and in the standalone file.

- **Daily Beach.** Everyone gets the same layout and the same waves for the day. Score is sand still standing, scaled by waves survived, minus sand moved. Your best is kept on your device; friends' results you open land on your board.
- **Ghost Tide.** After any solo or daily run, Share ghost makes a link that carries your inputs (a few hundred bytes). A friend who opens it plays the same beach with the same waves while your moves appear as outlines, and sees your score to beat.
- **Shared Beach (co-op).** Host picks a level and sends an invite link. The friend opens it and sends back a reply, which the host pastes in. From then on the two phones talk directly and both play on one beach with their own buckets.
- **Opposing Tides (versus).** Same hand-off, on a mirrored beach with the sea in the middle and a castle on each shore. Either player can call the next wave early. A castle that is down when a wave arrives loses; if both hold to the end, the one with more sand wins.

How it works: the simulation is deterministic (fixed 60 Hz tick, integer PRNG, no engine-specific math), so only inputs are ever shared. Live play is delay-based lockstep over a WebRTC data channel with manual signaling through the invite and reply codes, and peers compare sand checksums every two seconds to flag a desync.

## Project layout

| File | Purpose |
| --- | --- |
| `sim.js` | Beach simulation: cellular water flow, moisture, erosion, slumping. No DOM. |
| `levels.js` | The ten hand-made levels plus the mirrored versus beach. |
| `game.js` | Match engine (fixed tick, input log, replay), rendering, touch input, HUD, modes, networking UI. |
| `net.js` | Serverless WebRTC peer link, code packing, action log codec. |
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
