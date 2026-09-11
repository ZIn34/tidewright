// Headless tuning harness for the Tidewright sim.
const { Sim } = require('./sim.js');
const COLS = 20, ROWS = 28;

function run(strength, setup, seconds, opts) {
  const sim = new Sim(COLS, ROWS, Object.assign({ seed: 7 }, opts || {}));
  if (setup) setup(sim);
  sim.startWave({ s: strength });
  let minY = ROWS, maxDepth = 0;
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    sim.step(dt);
    for (let y = 0; y < ROWS - 1; y++) for (let x = 0; x < COLS; x++) {
      const wv = sim.w[sim.idx(x, y)];
      if (wv > 0.03 && y < minY) minY = y;
      if (wv > maxDepth) maxDepth = wv;
    }
  }
  return { sim, reachRows: (ROWS - 1) - minY, maxDepth };
}

console.log('--- reach on empty beach (rows up from ocean) ---');
for (const s of [1, 1.5, 2, 2.5, 3, 4, 5, 6]) {
  const r = run(s, null, 8);
  console.log(`s=${s}: reach=${r.reachRows} rows, maxDepth=${r.maxDepth.toFixed(2)}`);
}

function wallSetup(y, h, moist) {
  return sim => {
    for (let x = 6; x < 14; x++) {
      const i = sim.idx(x, y);
      sim.h[i] = h; sim.m[i] = moist;
    }
  };
}
function wallState(sim, y) {
  let sum = 0, min = 9;
  for (let x = 6; x < 14; x++) { const v = sim.h[sim.idx(x, y)]; sum += v; if (v < min) min = v; }
  return `avg=${(sum / 8).toFixed(2)} min=${min.toFixed(2)}`;
}

console.log('--- wall at row 20 (7 rows up), height 2, after one wave, 8s ---');
for (const s of [2, 3, 4]) {
  for (const m of [1.0, 0.5, 0.1]) {
    const r = run(s, wallSetup(20, 2, m), 8);
    console.log(`s=${s} moist=${m}: ${wallState(r.sim, 20)}`);
  }
}
console.log('--- tower 2x2 h=3 at row 18, wet, waves s=3 x3 with 10s gaps ---');
{
  const sim = new Sim(COLS, ROWS, { seed: 3 });
  for (let y = 18; y < 20; y++) for (let x = 9; x < 11; x++) { sim.h[sim.idx(x, y)] = 3; sim.m[sim.idx(x, y)] = 1; }
  const dt = 1 / 60;
  for (let k = 0; k < 3; k++) {
    sim.startWave({ s: 3 });
    for (let t = 0; t < 10; t += dt) sim.step(dt);
    let mn = 9; for (let y = 18; y < 20; y++) for (let x = 9; x < 11; x++) mn = Math.min(mn, sim.h[sim.idx(x, y)]);
    console.log(`after wave ${k + 1}: min tower h=${mn.toFixed(2)} moist=${sim.m[sim.idx(9, 18)].toFixed(2)}`);
  }
}
console.log('--- dry tower slump: 2x2 h=3, moist 0.1, 10s no waves ---');
{
  const sim = new Sim(COLS, ROWS, { seed: 3 });
  for (let y = 12; y < 14; y++) for (let x = 9; x < 11; x++) { sim.h[sim.idx(x, y)] = 3; sim.m[sim.idx(x, y)] = 0.1; }
  const dt = 1 / 60;
  for (let t = 0; t < 10; t += dt) sim.step(dt);
  let mn = 9; for (let y = 12; y < 14; y++) for (let x = 9; x < 11; x++) mn = Math.min(mn, sim.h[sim.idx(x, y)]);
  console.log(`dry tower min h after 10s: ${mn.toFixed(2)}`);
}
console.log('--- moat test: wall h=2 at row 20 with moat h=-2 at row 21, s=4 ---');
{
  const r = run(4, sim => {
    for (let x = 6; x < 14; x++) {
      sim.h[sim.idx(x, 20)] = 2; sim.m[sim.idx(x, 20)] = 1;
      sim.h[sim.idx(x, 21)] = -2; sim.m[sim.idx(x, 21)] = 1;
    }
  }, 8);
  console.log(`with moat: ${wallState(r.sim, 20)}`);
  const r2 = run(4, wallSetup(20, 2, 1), 8);
  console.log(`no moat:   ${wallState(r2.sim, 20)}`);
}
// perf
{
  const sim = new Sim(COLS, ROWS, {});
  sim.startWave({ s: 3 });
  const t0 = Date.now();
  for (let k = 0; k < 600; k++) sim.step(1 / 60);
  console.log(`perf: 600 steps in ${Date.now() - t0}ms`);
}
