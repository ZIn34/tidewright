// Tidewright - hand-made levels. Grid is 20 x 28, ocean is row 27.
// Structure rects: x,y,w,h in cells; req = required sand height.
(function (root) {
  'use strict';

  const LEVELS = [
    {
      name: 'First Tower',
      desc: 'Dig wet sand near the water and pile it onto the outline. Keep the tower standing through two waves.',
      hint: 'Wet sand holds. Dry sand crumbles.',
      prep: 25, gap: 12,
      waves: [{ s: 1.8 }, { s: 2.2 }],
      structs: [{ name: 'Tower', x: 9, y: 19, w: 2, h: 2, req: 2 }],
    },
    {
      name: 'Sea Wall',
      desc: 'A long wall takes more sand than you think. Fill your bucket from the wet zone and paint it along the line.',
      hint: 'Hold on a cell to pile sand higher.',
      prep: 26, gap: 12,
      waves: [{ s: 2.0 }, { s: 2.4 }, { s: 2.8 }],
      structs: [{ name: 'Wall', x: 6, y: 19, w: 8, h: 1, req: 2 }],
    },
    {
      name: 'Dig a Moat',
      desc: 'This tower needs to be tall, and the waves are bigger. A trench dug in front will swallow the surge before it hits.',
      hint: 'Dig below the beach to make a moat.',
      prep: 28, gap: 12,
      waves: [{ s: 2.5 }, { s: 3.0 }, { s: 3.5 }],
      structs: [{ name: 'Tower', x: 9, y: 18, w: 2, h: 2, req: 3 }],
    },
    {
      name: 'Twin Towers',
      desc: 'Two towers, one bucket. Split your time and repair whichever one the sea picks on.',
      hint: 'Build a little higher than required for a buffer.',
      prep: 30, gap: 12,
      waves: [{ s: 2.6 }, { s: 3.0 }, { s: 3.4 }],
      structs: [
        { name: 'West Tower', x: 5, y: 18, w: 2, h: 2, req: 3 },
        { name: 'East Tower', x: 13, y: 18, w: 2, h: 2, req: 3 },
      ],
    },
    {
      name: 'Rocky Cove',
      desc: 'Rocks funnel the whole sea through one gap. Whatever you build behind it gets the full force. Redirect it.',
      hint: 'Water follows the lowest path. Give it one.',
      prep: 30, gap: 13,
      rocks: [{ x: 0, y: 21, w: 8, h: 2 }, { x: 12, y: 21, w: 8, h: 2 }],
      waves: [{ s: 3.0, focus: 9.5, width: 3 }, { s: 3.5, focus: 9.5, width: 3 }, { s: 4.0, focus: 9.5, width: 3 }, { s: 4.0, focus: 9.5, width: 3 }],
      structs: [{ name: 'Keep', x: 8, y: 16, w: 3, h: 2, req: 2 }],
    },
    {
      name: 'Sandbar',
      desc: 'The waves alternate: big, small, bigger, small. Use the quiet ones to rebuild the outer wall that shields the tower.',
      hint: 'A wall in front takes the hit for what is behind it.',
      prep: 30, gap: 12,
      waves: [{ s: 4.0 }, { s: 2.0 }, { s: 4.5 }, { s: 2.5 }],
      structs: [
        { name: 'Outer Wall', x: 7, y: 20, w: 6, h: 1, req: 2 },
        { name: 'Tower', x: 9, y: 16, w: 2, h: 2, req: 3 },
      ],
    },
    {
      name: 'Tidal Flat',
      desc: 'A flat, soaked beach. Every grain is wet right now, but the sun here is brutal and the water runs a long way.',
      hint: 'Wet sand dries. Rewet your walls or rebuild them.',
      prep: 28, gap: 14,
      sim: { allWet: true, dryRate: 0.035, slope: 0.9 },
      waves: [{ s: 2.5 }, { s: 3.0 }, { s: 3.5 }, { s: 4.0 }],
      structs: [{ name: 'Keep', x: 8, y: 17, w: 3, h: 3, req: 2 }],
    },
    {
      name: 'The Castle',
      desc: 'A keep and two towers. Five waves, each bigger than the last. Plan your moats before the first one lands.',
      hint: 'Moats around the whole works, not just the front.',
      prep: 36, gap: 14,
      waves: [{ s: 3.0 }, { s: 3.5 }, { s: 4.0 }, { s: 4.5 }, { s: 5.0 }],
      structs: [
        { name: 'Keep', x: 8, y: 17, w: 3, h: 3, req: 2 },
        { name: 'West Tower', x: 5, y: 17, w: 2, h: 2, req: 3 },
        { name: 'East Tower', x: 13, y: 17, w: 2, h: 2, req: 3 },
      ],
    },
    {
      name: 'Storm Surge',
      desc: 'The sea is coming in sideways. Watch the ripples on the water before each wave to see which side it hits.',
      hint: 'Ripples show where the surge will land.',
      prep: 32, gap: 14,
      waves: [
        { s: 4.0, focus: 4, width: 4 },
        { s: 4.0, focus: 15, width: 4 },
        { s: 5.0, focus: 9.5, width: 5 },
        { s: 5.5, focus: 4, width: 6 },
        { s: 5.5, focus: 15, width: 6 },
      ],
      structs: [
        { name: 'Tower', x: 9, y: 17, w: 2, h: 2, req: 3 },
        { name: 'West Wall', x: 2, y: 19, w: 5, h: 1, req: 2 },
        { name: 'East Wall', x: 13, y: 19, w: 5, h: 1, req: 2 },
      ],
    },
    {
      name: 'High Tide',
      desc: 'The full castle. Six waves, and the last one is the biggest the sea has thrown at you. Hold everything.',
      hint: 'Overbuild the towers. Keep the bucket full between waves.',
      prep: 45, gap: 15,
      waves: [{ s: 3.0 }, { s: 3.5 }, { s: 4.0 }, { s: 4.5 }, { s: 5.0 }, { s: 6.0 }],
      structs: [
        { name: 'Keep', x: 8, y: 16, w: 3, h: 3, req: 2 },
        { name: 'NW Tower', x: 4, y: 16, w: 2, h: 2, req: 3 },
        { name: 'NE Tower', x: 14, y: 16, w: 2, h: 2, req: 3 },
        { name: 'SW Tower', x: 4, y: 20, w: 2, h: 2, req: 3 },
        { name: 'SE Tower', x: 14, y: 20, w: 2, h: 2, req: 3 },
        { name: 'Front Wall', x: 7, y: 21, w: 6, h: 1, req: 2 },
      ],
    },
  ];

  const api = { LEVELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Tidewright = Object.assign(root.Tidewright || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
