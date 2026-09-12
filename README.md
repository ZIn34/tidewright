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

During prep a dashed tide line shows how far the next wave will reach on open sand. The undo button (or `Z`) reverses your last drag, once per wave; it is an input like any other, so ghosts and live matches replay it. The first play of level one is a short guided walkthrough.

## Endless Tide and upgrades

**Endless Tide** never stops: every wave is bigger than the last, and from the third wave on the sea starts aiming at one side. Score is waves held, best is kept on your device, and the run can be shared as a ghost.

**Shells** are earned by holding the tide: a level win pays 15 plus 5 per wave, a loss 3 per wave survived, Endless 3 per wave held, the Daily Beach by score. The **Upgrades** shop spends them on a bigger bucket, quicker hands, packed sand that erodes slower, a head start of sand, a deeper scoop, and a longer first tide. Upgrades apply to solo and Endless play only; Daily and live matches use the base castle so everyone plays the same beach. Ghost links carry the upgrades their run used.

## With friends

Daily and ghost links need no server at all. Room codes and matchmaking use the free public PeerJS signaling service only to introduce the two phones; after that they talk directly. The manual invite link works with no service.

- **Daily Beach.** Everyone gets the same layout and the same waves for the day. Score is sand still standing, scaled by waves survived, minus sand moved. Your best is kept on your device; friends' results you open land on your board.
- **Ghost Tide.** After any solo or daily run, Share ghost makes a link that carries your inputs (a few hundred bytes). A friend who opens it plays the same beach with the same waves while your moves appear as outlines, and sees your score to beat.
- **Shared Beach (co-op) and Opposing Tides (versus).** Pick the mode, then either Host (you get a four-digit room code your friend types under Join), Find anyone (matches you with whoever is waiting, or parks you first in line), or a manual invite link for when the room service is unreachable. Co-op plays any level together with separate buckets. Versus is a mirrored beach with the sea in the middle and a castle on each shore; either player can call the next wave early, a castle that is down when a wave arrives loses, and if both hold to the end the one with more sand wins.

How it works: the simulation is deterministic (fixed 60 Hz tick, integer PRNG, no engine-specific math), so only inputs are ever shared. Live play is delay-based lockstep over a WebRTC data channel, and peers compare sand checksums every two seconds to flag a desync.

## Sound

`theme.mp3` loops as the theme at low volume and ducks under each surge; the Theme music box on the menu turns it off. Effects are synthesized in `audio.js`. The speaker button mutes everything.

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
| `theme.mp3` | Theme music loop, fetched from the site by the standalone file. |

## Working on it

```bash
node build.js
```

rebuilds both output files. Run `node tune.js` after changing simulation constants to see how far each wave strength reaches and how walls hold up.

## Sim in one paragraph

Each cell has a base ground height (the beach slopes up from the sea), a sand height the player changes, a moisture value, and a water depth. Waves inject water into the sea row with a sine envelope; water flows to neighbours by surface height and drains back to sea. Water soaks into sand as moisture, which decays in the sun. Built sand erodes when water rushes past or presses against it, faster when dry. Sand taller than its moisture allows slumps into lower neighbours. Only the part of a neighbouring water column above a wall's base counts as touching it, which is why moats work.
