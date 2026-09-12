// Tidewright - hand-made levels. Grid is 16 x 28, ocean is row 27.
// Structure rects: x,y,w,h in cells; req = required sand height; type = tower | keep | wall.
// Every structure starts built. The player defends it: moats, outer walls, repairs.
(function (root) {
  'use strict';

  const LEVELS = [
    {
      name: 'First Tower',
      desc: 'Your tower is built. Two small waves are coming. Watch what the water does to it, and patch any damage with wet sand from near the shore.',
      hint: 'Dig near the water. Wet sand holds, dry sand crumbles.',
      prep: 18, gap: 12,
      waves: [{ s: 1.8 }, { s: 2.2 }],
      structs: [{ name: 'Tower', type: 'tower', x: 7, y: 19, w: 2, h: 2, req: 2 }],
    },
    {
      name: 'Sea Wall',
      desc: 'A long wall takes the sea along its whole length. Repair the low spots between waves before they become gaps.',
      hint: 'Hold on a cell to pile sand higher.',
      prep: 18, gap: 12,
      waves: [{ s: 2.0 }, { s: 2.4 }, { s: 2.8 }],
      structs: [{ name: 'Wall', type: 'wall', x: 4, y: 19, w: 8, h: 1, req: 2 }],
    },
    {
      name: 'Dig a Moat',
      desc: 'Bigger waves now. A trench dug in front of the tower swallows the surge before it hits. Leave one cell of flat sand between trench and tower, or the tower slides into it.',
      hint: 'Dig below the beach to make a moat.',
      prep: 22, gap: 12,
      waves: [{ s: 2.5 }, { s: 3.0 }, { s: 3.5 }],
      structs: [{ name: 'Tower', type: 'tower', x: 7, y: 18, w: 2, h: 2, req: 3 }],
    },
    {
      name: 'Twin Towers',
      desc: 'Two towers, one bucket. Split your time and repair whichever one the sea picks on.',
      hint: 'Top the towers up higher than required for a buffer.',
      prep: 22, gap: 12,
      waves: [{ s: 2.6 }, { s: 3.0 }, { s: 3.4 }],
      structs: [
        { name: 'West Tower', type: 'tower', x: 4, y: 18, w: 2, h: 2, req: 3 },
        { name: 'East Tower', type: 'tower', x: 10, y: 18, w: 2, h: 2, req: 3 },
      ],
    },
    {
      name: 'Rocky Cove',
      desc: 'Rocks funnel the whole sea through one gap, straight at your keep. Redirect it.',
      hint: 'Water follows the lowest path. Give it one.',
      prep: 24, gap: 13,
      rocks: [{ x: 0, y: 21, w: 6, h: 2 }, { x: 10, y: 21, w: 6, h: 2 }],
      waves: [{ s: 3.0, focus: 7.5, width: 2.5 }, { s: 3.5, focus: 7.5, width: 2.5 }, { s: 4.0, focus: 7.5, width: 2.5 }, { s: 4.0, focus: 7.5, width: 2.5 }],
      structs: [{ name: 'Keep', type: 'keep', x: 7, y: 16, w: 3, h: 2, req: 2 }],
    },
    {
      name: 'Sandbar',
      desc: 'The waves alternate: big, small, bigger, small. Use the quiet ones to rebuild the outer wall that shields the tower.',
      hint: 'A wall in front takes the hit for what is behind it.',
      prep: 22, gap: 12,
      waves: [{ s: 4.0 }, { s: 2.0 }, { s: 4.5 }, { s: 2.5 }],
      structs: [
        { name: 'Outer Wall', type: 'wall', x: 5, y: 20, w: 6, h: 1, req: 2 },
        { name: 'Tower', type: 'tower', x: 7, y: 16, w: 2, h: 2, req: 3 },
      ],
    },
    {
      name: 'Tidal Flat',
      desc: 'A flat, soaked beach. Every grain is wet right now, but the sun here is brutal and the water runs a long way.',
      hint: 'Wet sand dries. Rewet your walls or rebuild them.',
      prep: 22, gap: 14,
      sim: { allWet: true, dryRate: 0.035, slope: 0.9 },
      waves: [{ s: 2.5 }, { s: 3.0 }, { s: 3.5 }, { s: 4.0 }],
      structs: [{ name: 'Keep', type: 'keep', x: 7, y: 17, w: 3, h: 3, req: 2 }],
    },
    {
      name: 'The Castle',
      desc: 'A keep and two towers. Five waves, each bigger than the last. Dig your moats before the first one lands.',
      hint: 'Moats around the whole works, not just the front.',
      prep: 28, gap: 14,
      waves: [{ s: 3.0 }, { s: 3.5 }, { s: 4.0 }, { s: 4.5 }, { s: 5.0 }],
      structs: [
        { name: 'Keep', type: 'keep', x: 7, y: 17, w: 3, h: 3, req: 2 },
        { name: 'West Tower', type: 'tower', x: 3, y: 17, w: 2, h: 2, req: 3 },
        { name: 'East Tower', type: 'tower', x: 12, y: 17, w: 2, h: 2, req: 3 },
      ],
    },
    {
      name: 'Storm Surge',
      desc: 'The sea is coming in sideways. Watch the ripples on the water before each wave to see which side it hits.',
      hint: 'Ripples show where the surge will land.',
      prep: 26, gap: 14,
      waves: [
        { s: 4.0, focus: 3, width: 3 },
        { s: 4.0, focus: 12, width: 3 },
        { s: 5.0, focus: 7.5, width: 4 },
        { s: 5.5, focus: 3, width: 5 },
        { s: 5.5, focus: 12, width: 5 },
      ],
      structs: [
        { name: 'Tower', type: 'tower', x: 7, y: 17, w: 2, h: 2, req: 3 },
        { name: 'West Wall', type: 'wall', x: 1, y: 19, w: 4, h: 1, req: 2 },
        { name: 'East Wall', type: 'wall', x: 11, y: 19, w: 4, h: 1, req: 2 },
      ],
    },
    {
      name: 'High Tide',
      desc: 'The full castle. Six waves, and the last one is the biggest the sea has thrown at you. Hold everything.',
      hint: 'Overbuild the towers. Keep the bucket full between waves.',
      prep: 34, gap: 15,
      waves: [{ s: 3.0 }, { s: 3.5 }, { s: 4.0 }, { s: 4.5 }, { s: 5.0 }, { s: 6.0 }],
      structs: [
        { name: 'Keep', type: 'keep', x: 7, y: 16, w: 3, h: 3, req: 2 },
        { name: 'NW Tower', type: 'tower', x: 3, y: 16, w: 2, h: 2, req: 3 },
        { name: 'NE Tower', type: 'tower', x: 12, y: 16, w: 2, h: 2, req: 3 },
        { name: 'SW Tower', type: 'tower', x: 3, y: 20, w: 2, h: 2, req: 3 },
        { name: 'SE Tower', type: 'tower', x: 12, y: 20, w: 2, h: 2, req: 3 },
        { name: 'Front Wall', type: 'wall', x: 5, y: 21, w: 6, h: 1, req: 2 },
      ],
    },
  ];

  // Opposing Tides: the sea runs through the middle, a castle on each shore.
  // Player 0 (host) holds the bottom shore, player 1 the top.
  const VERSUS_LEVEL = {
    name: 'Opposing Tides',
    versus: true,
    desc: 'Two castles, one sea between them. Defend yours. Either player can call the next wave early.',
    hint: 'Call the wave when you are ready and your rival is not.',
    prep: 24, gap: 13,
    sim: { oceanRows: [13, 14], slope: 0.65 },
    waves: [{ s: 3.0 }, { s: 3.5 }, { s: 4.0 }, { s: 4.5 }, { s: 5.0 }],
    structs: [
      { name: 'Keep', type: 'keep', owner: 0, x: 7, y: 22, w: 3, h: 3, req: 2 },
      { name: 'West Tower', type: 'tower', owner: 0, x: 3, y: 21, w: 2, h: 2, req: 3 },
      { name: 'East Tower', type: 'tower', owner: 0, x: 12, y: 21, w: 2, h: 2, req: 3 },
      { name: 'Keep', type: 'keep', owner: 1, x: 7, y: 3, w: 3, h: 3, req: 2 },
      { name: 'West Tower', type: 'tower', owner: 1, x: 3, y: 5, w: 2, h: 2, req: 3 },
      { name: 'East Tower', type: 'tower', owner: 1, x: 12, y: 5, w: 2, h: 2, req: 3 },
    ],
  };

  // Endless Tide: the castle layout, waves that never stop and keep growing.
  // Waves are generated from the match seed, so ghosts replay exactly.
  const ENDLESS_LEVEL = {
    name: 'Endless Tide',
    endless: true,
    desc: 'The tide never goes out. Every wave is bigger than the last, and the sea starts aiming. Hold as long as you can.',
    hint: 'Repair fast. Overbuild early, while the waves are small.',
    prep: 24, gap: 12,
    waves: [],
    structs: [
      { name: 'Keep', type: 'keep', x: 7, y: 17, w: 3, h: 3, req: 2 },
      { name: 'West Tower', type: 'tower', x: 3, y: 17, w: 2, h: 2, req: 3 },
      { name: 'East Tower', type: 'tower', x: 12, y: 17, w: 2, h: 2, req: 3 },
    ],
  };

  const api = { LEVELS, VERSUS_LEVEL, ENDLESS_LEVEL };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Tidewright = Object.assign(root.Tidewright || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
