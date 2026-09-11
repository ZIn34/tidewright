// Tidewright - game shell: rendering, input, level flow. Depends on sim.js and levels.js.
(function () {
  'use strict';
  const { Sim, LEVELS } = window.Tidewright;

  const COLS = 20, ROWS = 28;
  const BUCKET_CAP = 10;
  const SETTLE = 3.5;

  const $ = id => document.getElementById(id);
  const canvas = $('beach');
  const ctx = canvas.getContext('2d');

  // ---------- persistent progress ----------
  function loadProgress() {
    try { return Math.max(0, Math.min(LEVELS.length - 1, parseInt(localStorage.getItem('tw_unlocked') || '0', 10) || 0)); }
    catch (e) { return 0; }
  }
  function saveProgress(n) {
    try { localStorage.setItem('tw_unlocked', String(n)); } catch (e) { /* ignore */ }
  }
  let unlocked = loadProgress();

  // ---------- game state ----------
  const G = {
    level: 0,
    sim: null,
    structs: [],
    phase: 'menu',   // menu | intro | build | wave | settle | won | lost
    waveIndex: 0,
    timer: 0,
    bucket: { sand: 0, moist: 0 },
    mode: 'dig',
    message: '',
    seedCounter: 1,
    lastWaveT: -99,
    shake: 0,
  };

  // ---------- layout ----------
  let cell = 16, ox = 0, oy = 0, dpr = 1, lastW = -1, lastH = -1;
  function layout() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    lastW = rect.width; lastH = rect.height;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    cell = Math.floor(Math.min(rect.width / COLS, rect.height / ROWS));
    ox = Math.floor((rect.width - cell * COLS) / 2);
    oy = Math.floor((rect.height - cell * ROWS) / 2);
  }
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', layout);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);

  // ---------- level setup ----------
  function startLevel(n) {
    G.level = n;
    const L = LEVELS[n];
    G.sim = new Sim(COLS, ROWS, Object.assign({ seed: 1000 * (n + 1) + (G.seedCounter++) }, L.sim || {}));
    (L.rocks || []).forEach(r => {
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) G.sim.setRock(x, y);
    });
    G.structs = L.structs.map(s => Object.assign({}, s));
    // The castle starts built and packed wet, with a little headroom above the
    // required height so the first nick of erosion does not fail it.
    G.structs.forEach(s => {
      for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) {
        if (!G.sim.inBounds(x, y)) continue;
        const i = G.sim.idx(x, y);
        if (G.sim.rock[i]) continue;
        G.sim.h[i] = Math.min(G.sim.maxH, s.req + 0.4);
        G.sim.m[i] = 1;
      }
    });
    G.waveIndex = 0;
    G.timer = L.prep;
    G.bucket = { sand: 4, moist: 1 };   // a starting bucket of wet sand for quick repairs
    G.mode = 'dig';
    G.phase = 'intro';
    G.message = '';
    G.lastWaveT = -99;
    setMode('dig');
    $('intro-title').textContent = `${n + 1}. ${L.name}`;
    $('intro-desc').textContent = L.desc;
    $('intro-hint').textContent = L.hint;
    $('intro-waves').textContent = `${L.waves.length} wave${L.waves.length > 1 ? 's' : ''}`;
    showOverlay('intro');
    $('hud-level').textContent = L.name;
    updateHud();
  }

  function showOverlay(name) {
    document.querySelectorAll('.overlay').forEach(el => { el.hidden = el.dataset.name !== name; });
    $('overlays').hidden = !name;
  }

  function buildMenu() {
    const grid = $('level-grid');
    grid.innerHTML = '';
    LEVELS.forEach((L, i) => {
      const b = document.createElement('button');
      b.className = 'lvl' + (i > unlocked ? ' locked' : '') + (i < unlocked ? ' done' : '');
      b.innerHTML = `<span class="num">${i + 1}</span><span class="nm">${L.name}</span>`;
      b.disabled = i > unlocked;
      b.addEventListener('click', () => startLevel(i));
      grid.appendChild(b);
    });
  }

  // ---------- flow ----------
  function callWave() {
    if (G.phase !== 'build') return;
    const L = LEVELS[G.level];
    const down = G.structs.filter(s => !G.sim.standing(s).standing);
    if (down.length) {
      lose(`${down[0].name} was not standing when wave ${G.waveIndex + 1} came in.`);
      return;
    }
    G.sim.startWave(L.waves[G.waveIndex]);
    G.phase = 'wave';
    G.lastWaveT = G.sim.time;
    G.shake = 0.5;
  }

  function lose(msg) {
    G.phase = 'lost';
    G.message = msg;
    $('lost-msg').textContent = msg;
    showOverlay('lost');
  }

  function win() {
    G.phase = 'won';
    if (G.level >= unlocked && G.level + 1 < LEVELS.length) { unlocked = G.level + 1; saveProgress(unlocked); }
    else if (G.level + 1 >= LEVELS.length) { unlocked = LEVELS.length - 1; saveProgress(unlocked); }
    $('won-msg').textContent = G.level + 1 < LEVELS.length
      ? `Everything held. The tide is out on ${LEVELS[G.level].name}.`
      : 'Everything held through the highest tide. That is the whole beach.';
    $('btn-next').hidden = G.level + 1 >= LEVELS.length;
    showOverlay('won');
  }

  function update(dt) {
    const L = LEVELS[G.level];
    if (G.phase === 'menu' || G.phase === 'intro') return;
    G.sim.step(dt);
    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt);
    applyHold(dt);

    if (G.phase === 'build') {
      G.timer -= dt;
      if (G.timer <= 0) { G.timer = 0; callWave(); }
    } else if (G.phase === 'wave') {
      if (!G.sim.waveActive) { G.phase = 'settle'; G.timer = SETTLE; }
    } else if (G.phase === 'settle') {
      G.timer -= dt;
      if (G.timer <= 0) {
        G.waveIndex++;
        if (G.waveIndex < L.waves.length) {
          G.phase = 'build';
          G.timer = L.gap;
        } else {
          const down = G.structs.filter(s => !G.sim.standing(s).standing);
          if (down.length) lose(`${down[0].name} did not survive the last wave.`);
          else win();
        }
      }
    }
    updateHud();
  }

  // ---------- HUD ----------
  const hudWave = $('hud-wave'), hudTimer = $('hud-timer'), hudBar = $('hud-bar'), hudStatus = $('hud-status');
  const bucketFill = $('bucket-fill'), bucketNum = $('bucket-num');
  const btnCall = $('btn-call');
  function updateHud() {
    const L = LEVELS[G.level];
    const total = L.waves.length;
    if (G.phase === 'build') {
      hudWave.textContent = `Wave ${G.waveIndex + 1} of ${total}`;
      hudTimer.textContent = `${Math.ceil(G.timer)}s`;
      const span = G.waveIndex === 0 ? L.prep : L.gap;
      hudBar.style.width = `${Math.max(0, 100 * (1 - G.timer / span))}%`;
      hudBar.className = 'bar' + (G.timer < 4 ? ' urgent' : '');
      btnCall.disabled = false;
    } else if (G.phase === 'wave') {
      hudWave.textContent = `Wave ${G.waveIndex + 1} of ${total}`;
      hudTimer.textContent = 'surge';
      hudBar.style.width = '100%';
      hudBar.className = 'bar surge';
      btnCall.disabled = true;
    } else if (G.phase === 'settle') {
      hudWave.textContent = `Wave ${G.waveIndex + 1} of ${total}`;
      hudTimer.textContent = 'settling';
      hudBar.style.width = '100%';
      hudBar.className = 'bar surge';
      btnCall.disabled = true;
    } else {
      hudWave.textContent = `${total} waves`;
      hudTimer.textContent = '';
      hudBar.style.width = '0%';
      btnCall.disabled = true;
    }
    const st = G.structs.map(s => G.sim.standing(s));
    const up = st.filter(s => s.standing).length;
    hudStatus.textContent = `${up}/${st.length} standing`;
    hudStatus.className = up === st.length ? 'ok' : 'bad';

    bucketFill.style.height = `${(G.bucket.sand / BUCKET_CAP) * 100}%`;
    const mo = G.bucket.moist;
    bucketFill.style.background = mo > 0.6 ? '#a8865a' : mo > 0.3 ? '#cdb182' : '#e9d7a8';
    bucketNum.textContent = `${Math.floor(G.bucket.sand)}`;
  }

  function setMode(m) {
    G.mode = m;
    $('btn-dig').classList.toggle('active', m === 'dig');
    $('btn-build').classList.toggle('active', m === 'build');
  }

  // ---------- input ----------
  const ptr = { down: false, cx: -1, cy: -1, hold: 0 };
  function cellAt(evt) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((evt.clientX - rect.left - ox) / cell);
    const y = Math.floor((evt.clientY - rect.top - oy) / cell);
    return { x, y };
  }
  function act(x, y) {
    if (G.phase !== 'build' && G.phase !== 'wave' && G.phase !== 'settle') return;
    if (!G.sim.inBounds(x, y)) return;
    if (G.mode === 'dig') {
      if (G.bucket.sand >= BUCKET_CAP - 0.01) return;
      const r = G.sim.dig(x, y, Math.min(1, BUCKET_CAP - G.bucket.sand));
      if (r.amount > 0) {
        const tot = G.bucket.sand + r.amount;
        G.bucket.moist = (G.bucket.moist * G.bucket.sand + r.moist * r.amount) / tot;
        G.bucket.sand = tot;
      }
    } else {
      if (G.bucket.sand < 0.05) return;
      const placed = G.sim.place(x, y, Math.min(1, G.bucket.sand), G.bucket.moist);
      G.bucket.sand = Math.max(0, G.bucket.sand - placed);
    }
  }
  function applyHold(dt) {
    if (!ptr.down) return;
    ptr.hold += dt;
    if (ptr.hold >= 0.22) { ptr.hold = 0; act(ptr.cx, ptr.cy); }
  }
  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already-captured pointer */ }
    const c = cellAt(e);
    ptr.down = true; ptr.cx = c.x; ptr.cy = c.y; ptr.hold = 0;
    act(c.x, c.y);
  });
  canvas.addEventListener('pointermove', e => {
    if (!ptr.down) return;
    e.preventDefault();
    const c = cellAt(e);
    if (c.x !== ptr.cx || c.y !== ptr.cy) {
      ptr.cx = c.x; ptr.cy = c.y; ptr.hold = 0;
      act(c.x, c.y);
    }
  });
  const stop = e => { ptr.down = false; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  canvas.addEventListener('lostpointercapture', stop);

  $('btn-dig').addEventListener('click', () => setMode('dig'));
  $('btn-build').addEventListener('click', () => setMode('build'));
  btnCall.addEventListener('click', callWave);
  $('btn-restart').addEventListener('click', () => startLevel(G.level));
  $('btn-menu').addEventListener('click', () => { G.phase = 'menu'; buildMenu(); showOverlay('menu'); });
  $('btn-go').addEventListener('click', () => { G.phase = 'build'; showOverlay(null); updateHud(); });
  $('btn-retry').addEventListener('click', () => startLevel(G.level));
  $('btn-next').addEventListener('click', () => startLevel(Math.min(LEVELS.length - 1, G.level + 1)));
  $('btn-lost-menu').addEventListener('click', () => { G.phase = 'menu'; buildMenu(); showOverlay('menu'); });
  $('btn-won-menu').addEventListener('click', () => { G.phase = 'menu'; buildMenu(); showOverlay('menu'); });
  $('btn-reset').addEventListener('click', () => { unlocked = 0; saveProgress(0); buildMenu(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'd' || e.key === 'D') setMode('dig');
    if (e.key === 'b' || e.key === 'B') setMode('build');
    if (e.key === ' ' && G.phase === 'build') { e.preventDefault(); callWave(); }
  });

  // ---------- rendering ----------
  const DRY = [236, 216, 168], WET = [166, 134, 88];
  function sandColor(h, m, out) {
    let r = DRY[0] + (WET[0] - DRY[0]) * m;
    let g = DRY[1] + (WET[1] - DRY[1]) * m;
    let b = DRY[2] + (WET[2] - DRY[2]) * m;
    let k = 1;
    if (h > 0) k = 1 + 0.075 * h; else if (h < 0) k = 1 + 0.11 * h;
    out[0] = Math.min(255, r * k); out[1] = Math.min(255, g * k); out[2] = Math.min(255, b * k);
  }
  const tmp = [0, 0, 0];
  // Stable per-cell noise for foam and spray placement (0..1)
  function hash(x, y, k) {
    let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(k | 0, 1274126177) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  // ---------- castle art ----------
  const INK = 'rgba(70,45,15,0.75)';
  function merlon(x, y, w, h) {
    ctx.fillStyle = 'rgba(255,248,225,0.6)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = INK; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  function flag(fx, fy) {
    ctx.strokeStyle = '#3b2a15'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy + cell * 0.9); ctx.stroke();
    ctx.fillStyle = '#e5484d';
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + cell * 0.55, fy + cell * 0.22); ctx.lineTo(fx, fy + cell * 0.44); ctx.closePath(); ctx.fill();
  }
  function drawTower(px, py, pw, ph) {
    const cx = px + pw / 2, cy = py + ph / 2, r = Math.min(pw, ph) / 2 - 1;
    ctx.fillStyle = 'rgba(255,240,205,0.35)';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(70,45,15,0.28)';
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.56, 0, 6.283); ctx.fill();
    const n = 10, mw = Math.max(3, r * 0.34);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283;
      merlon(cx + Math.cos(a) * r * 0.78 - mw / 2, cy + Math.sin(a) * r * 0.78 - mw / 2, mw, mw);
    }
    flag(cx, cy - cell * 0.55);
  }
  function drawKeep(px, py, pw, ph) {
    ctx.fillStyle = 'rgba(255,240,205,0.3)';
    ctx.fillRect(px + 1, py + 1, pw - 2, ph - 2);
    ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.strokeRect(px + 1.5, py + 1.5, pw - 3, ph - 3);
    const inset = cell * 0.45;
    ctx.fillStyle = 'rgba(70,45,15,0.22)';
    ctx.fillRect(px + inset, py + inset, pw - 2 * inset, ph - 2 * inset);
    const mw = cell * 0.3, step = cell * 0.5;
    for (let x = px + 2; x <= px + pw - mw - 2; x += step) { merlon(x, py + 2, mw, mw); merlon(x, py + ph - mw - 2, mw, mw); }
    for (let y = py + 2 + step; y <= py + ph - mw - 2 - step; y += step) { merlon(px + 2, y, mw, mw); merlon(px + pw - mw - 2, y, mw, mw); }
    // gate on the seaward face
    const gw = cell * 0.5, gh = cell * 0.55, gx = px + pw / 2, gy = py + ph - 2;
    ctx.fillStyle = 'rgba(40,25,10,0.85)';
    ctx.beginPath();
    ctx.moveTo(gx - gw / 2, gy);
    ctx.lineTo(gx - gw / 2, gy - gh + gw / 2);
    ctx.arc(gx, gy - gh + gw / 2, gw / 2, Math.PI, 0);
    ctx.lineTo(gx + gw / 2, gy);
    ctx.closePath(); ctx.fill();
    flag(gx, py + ph / 2 - cell * 0.55);
  }
  function drawWall(px, py, pw, ph, horizontal) {
    ctx.fillStyle = 'rgba(255,240,205,0.3)';
    ctx.fillRect(px + 1, py + 1, pw - 2, ph - 2);
    ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.strokeRect(px + 1.5, py + 1.5, pw - 3, ph - 3);
    const mw = cell * 0.3, step = cell * 0.5;
    ctx.save();
    ctx.strokeStyle = 'rgba(70,45,15,0.35)'; ctx.lineWidth = 1;
    if (horizontal) {
      for (let x = px + 2; x <= px + pw - mw - 2; x += step) merlon(x, py + 2, mw, mw);
      ctx.strokeStyle = 'rgba(70,45,15,0.35)';
      ctx.beginPath(); ctx.moveTo(px + 2, py + ph * 0.66); ctx.lineTo(px + pw - 2, py + ph * 0.66); ctx.stroke();
    } else {
      for (let y = py + 2; y <= py + ph - mw - 2; y += step) merlon(px + 2, y, mw, mw);
      ctx.strokeStyle = 'rgba(70,45,15,0.35)';
      ctx.beginPath(); ctx.moveTo(px + pw * 0.66, py + 2); ctx.lineTo(px + pw * 0.66, py + ph - 2); ctx.stroke();
    }
    ctx.restore();
  }
  function drawStructure(s) {
    const sim = G.sim;
    const px = s.x * cell, py = s.y * cell, pw = s.w * cell, ph = s.h * cell;
    const healthy = [];
    let all = true, any = false;
    for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) {
      const ok = sim.inBounds(x, y) && sim.h[sim.idx(x, y)] >= s.req - 0.5;
      healthy.push(ok); if (ok) any = true; else all = false;
    }
    // rubble where the sea broke through
    let k = 0;
    for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++, k++) {
      if (healthy[k]) continue;
      ctx.fillStyle = 'rgba(70,45,15,0.35)';
      for (let j = 0; j < 5; j++) {
        const rx = x * cell + (0.1 + 0.75 * hash(x, y, j)) * cell;
        const ry = y * cell + (0.1 + 0.75 * hash(y, x, j + 9)) * cell;
        const r = cell * (0.05 + 0.08 * hash(x + j, y, 4));
        ctx.fillRect(rx, ry, r * 2, r * 1.4);
      }
    }
    // castle art only over cells still holding their height
    if (any) {
      ctx.save();
      ctx.beginPath();
      k = 0;
      for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++, k++) if (healthy[k]) ctx.rect(x * cell, y * cell, cell, cell);
      ctx.clip();
      if (s.type === 'tower') drawTower(px, py, pw, ph);
      else if (s.type === 'keep') drawKeep(px, py, pw, ph);
      else drawWall(px, py, pw, ph, s.w >= s.h);
      ctx.restore();
    }
    // breach outline with the height to rebuild to
    if (!all) {
      ctx.strokeStyle = 'rgba(240,180,41,0.95)';
      ctx.lineWidth = 2; ctx.setLineDash([5, 3]);
      ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
      ctx.setLineDash([]);
      const bw = Math.max(12, cell * 0.7);
      ctx.fillStyle = 'rgba(240,180,41,0.95)';
      ctx.fillRect(px + pw - bw - 2, py + 2, bw, bw);
      ctx.fillStyle = '#0b1b2b';
      ctx.fillText(String(s.req), px + pw - bw / 2 - 2, py + 3);
    }
  }

  // Phones resize the viewport when the address bar shows or hides, and the
  // resize event is not always delivered, so re-measure whenever the canvas moves.
  function layoutIfNeeded() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width !== lastW || rect.height !== lastH) layout();
  }

  function render(t) {
    layoutIfNeeded();
    const sim = G.sim;
    const W = canvas.width / dpr, H = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b1b2b';
    ctx.fillRect(0, 0, W, H);
    if (!sim) return;

    let sx = 0, sy = 0;
    // whole-pixel shake only: sub-pixel offsets draw seams between cells
    if (G.shake > 0) { sx = Math.round((Math.random() - 0.5) * 4 * G.shake); sy = Math.round((Math.random() - 0.5) * 4 * G.shake); }
    ctx.save();
    ctx.translate(ox + sx, oy + sy);

    const L = LEVELS[G.level];
    // sand and rocks
    for (let y = 0; y < ROWS - 1; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = y * COLS + x;
        const px = x * cell, py = y * cell;
        if (sim.rock[i]) {
          ctx.fillStyle = '#5f666d';
          ctx.fillRect(px, py, cell, cell);
          ctx.fillStyle = '#7c848c';
          ctx.fillRect(px + 1, py + 1, cell - 2, Math.max(2, cell * 0.35));
          continue;
        }
        sandColor(sim.h[i], sim.m[i], tmp);
        ctx.fillStyle = `rgb(${tmp[0] | 0},${tmp[1] | 0},${tmp[2] | 0})`;
        ctx.fillRect(px, py, cell, cell);
      }
    }
    // cliff edges (a cell that stands above its right/bottom neighbour)
    const edge = Math.max(2, Math.floor(cell * 0.18));
    ctx.fillStyle = 'rgba(70,45,15,0.45)';
    for (let y = 0; y < ROWS - 1; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = y * COLS + x;
        if (sim.rock[i]) continue;
        const si = sim.g[i] + sim.h[i];
        const px = x * cell, py = y * cell;
        if (x + 1 < COLS) {
          const j = i + 1;
          if (!sim.rock[j] && si - (sim.g[j] + sim.h[j]) >= 0.8) ctx.fillRect(px + cell - edge, py, edge, cell);
        }
        if (y + 1 < ROWS - 1) {
          const j = i + COLS;
          if (!sim.rock[j] && si - (sim.g[j] + sim.h[j]) >= 0.8) ctx.fillRect(px, py + cell - edge, cell, edge);
        }
        // highlight on top edge of raised sand
        if (sim.h[i] >= 0.8) {
          ctx.fillStyle = 'rgba(255,250,230,0.35)';
          ctx.fillRect(px, py, cell, Math.max(1, Math.floor(cell * 0.12)));
          ctx.fillStyle = 'rgba(70,45,15,0.45)';
        }
      }
    }
    const now = t * 0.001;
    // wet sheen: sand the water just left keeps a mirror shine for a moment
    for (let y = 0; y < ROWS - 1; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = y * COLS + x;
        if (sim.rock[i] || sim.w[i] >= 0.012) continue;
        const sheen = (sim.m[i] - 0.972) / 0.028;
        if (sheen <= 0) continue;
        // soft-edged so neighbouring cells blend instead of reading as tiles
        const s = Math.min(1, sheen);
        const sg = ctx.createRadialGradient(x * cell + cell / 2, y * cell + cell / 2, 0, x * cell + cell / 2, y * cell + cell / 2, cell * 0.9);
        sg.addColorStop(0, `rgba(215,235,255,${(0.22 * s).toFixed(3)})`);
        sg.addColorStop(1, 'rgba(215,235,255,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(x * cell - cell * 0.4, y * cell - cell * 0.4, cell * 1.8, cell * 1.8);
      }
    }
    // water body
    const wet = i => sim.w[i] >= 0.012;
    for (let y = 0; y < ROWS - 1; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = y * COLS + x;
        const wv = sim.w[i];
        if (wv < 0.012) continue;
        const a = Math.min(0.85, 0.24 + wv * 0.38);
        // gentle shimmer so standing water is never a flat block
        const sh = Math.sin(now * 2.2 + x * 0.9 + y * 1.3) * 0.04;
        ctx.fillStyle = `rgba(${(36 + sh * 200) | 0},${(118 + sh * 200) | 0},${(196 + sh * 120) | 0},${a.toFixed(3)})`;
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    // foam: bubbles where the water rushes, crests along its leading edges
    const crestW = Math.max(1.5, cell * 0.16);
    ctx.lineCap = 'round';
    for (let y = 0; y < ROWS - 1; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = y * COLS + x;
        if (!wet(i)) continue;
        const f = sim.flow[i];
        const px = x * cell, py = y * cell;
        if (f > 0.015) {
          const fa = Math.min(0.8, f * 7);
          for (let k = 0; k < 3; k++) {
            const ph = hash(x, y, k);
            const tw = 0.5 + 0.5 * Math.sin(now * 9 + ph * 6.283);
            const bx = px + (0.15 + 0.7 * hash(x, y, k + 11)) * cell;
            const by = py + (0.15 + 0.7 * hash(y, x, k + 23)) * cell;
            const r = cell * (0.07 + 0.11 * hash(x + k, y, 5)) * (0.6 + 0.4 * tw);
            ctx.fillStyle = `rgba(245,252,255,${(fa * (0.35 + 0.65 * tw)).toFixed(3)})`;
            ctx.beginPath(); ctx.arc(bx, by, r, 0, 6.283); ctx.fill();
          }
        }
        const upDry = y === 0 || !wet(i - COLS);
        const leftDry = x === 0 || !wet(i - 1);
        const rightDry = x === COLS - 1 || !wet(i + 1);
        if (!upDry && !leftDry && !rightDry) continue;
        const ca = Math.min(0.95, 0.4 + f * 5);
        if (upDry) {
          ctx.strokeStyle = `rgba(255,255,255,${ca.toFixed(3)})`;
          ctx.lineWidth = crestW;
          ctx.beginPath();
          for (let s = 0; s <= cell; s += 3) {
            const yy = py + cell * 0.18 + Math.sin((px + s) * 0.45 + now * 11 + y) * cell * 0.1;
            if (s === 0) ctx.moveTo(px + s, yy); else ctx.lineTo(px + s, yy);
          }
          ctx.stroke();
        }
        if (leftDry || rightDry) {
          ctx.strokeStyle = `rgba(255,255,255,${(ca * 0.6).toFixed(3)})`;
          ctx.lineWidth = crestW * 0.7;
          ctx.beginPath();
          const ex = leftDry ? px + cell * 0.15 : px + cell * 0.85;
          for (let s = 0; s <= cell; s += 3) {
            const xx = ex + Math.sin((py + s) * 0.45 + now * 9 + x) * cell * 0.08;
            if (s === 0) ctx.moveTo(xx, py + s); else ctx.lineTo(xx, py + s);
          }
          ctx.stroke();
        }
      }
    }
    // ocean row
    const oyp = (ROWS - 1) * cell;
    const grad = ctx.createLinearGradient(0, oyp, 0, oyp + cell);
    grad.addColorStop(0, '#2b7fc9');
    grad.addColorStop(1, '#155a9c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, oyp, COLS * cell, cell);
    // breaker: a crest that swells up off the sea row and curls over as the surge starts
    if (sim.waveActive && sim.waveSpec) {
      const spec = sim.waveSpec;
      const dur = spec.duration || 1.6;
      const p = Math.min(1, sim.waveT / dur);
      const env = Math.sin(Math.PI * p);
      const lift = cell * (1.1 + 0.35 * spec.s);
      // dark swell under the crest
      ctx.beginPath();
      ctx.moveTo(0, oyp + cell);
      for (let x = 0; x <= COLS; x++) {
        const fac = sim.waveFactor(Math.min(COLS - 1, x));
        const yy = oyp + cell * 0.3 - env * fac * lift * 0.6 + Math.sin(x * 1.3 + now * 7) * cell * 0.1;
        ctx.lineTo(x * cell, yy);
      }
      ctx.lineTo(COLS * cell, oyp + cell);
      ctx.closePath();
      ctx.fillStyle = `rgba(16,62,120,${(0.35 + 0.4 * env).toFixed(3)})`;
      ctx.fill();
      // white crest, brightest at the peak of the surge
      ctx.beginPath();
      ctx.moveTo(0, oyp + cell * 0.6);
      for (let x = 0; x <= COLS; x++) {
        const fac = sim.waveFactor(Math.min(COLS - 1, x));
        const yy = oyp - env * fac * lift + Math.sin(x * 1.7 + now * 9) * cell * 0.15;
        ctx.lineTo(x * cell, yy);
      }
      ctx.lineTo(COLS * cell, oyp + cell * 0.6);
      ctx.closePath();
      const cg = ctx.createLinearGradient(0, oyp - lift, 0, oyp + cell);
      cg.addColorStop(0, `rgba(255,255,255,${(0.9 * env).toFixed(3)})`);
      cg.addColorStop(0.5, `rgba(200,230,255,${(0.55 * env).toFixed(3)})`);
      cg.addColorStop(1, 'rgba(120,190,240,0.05)');
      ctx.fillStyle = cg;
      ctx.fill();
      // spray thrown off the crest
      ctx.fillStyle = `rgba(255,255,255,${(0.8 * env).toFixed(3)})`;
      for (let k = 0; k < 24; k++) {
        const fx = hash(k, 1, 1) * COLS;
        const fac = sim.waveFactor(Math.min(COLS - 1, Math.floor(fx)));
        const life = (now * 1.6 + hash(k, 2, 2)) % 1;
        const sx2 = fx * cell + Math.sin(k) * cell * 0.3;
        const sy2 = oyp - env * fac * lift - life * cell * 1.2;
        const r = cell * 0.06 * (1 - life) * env * fac;
        if (r <= 0.2) continue;
        ctx.beginPath(); ctx.arc(sx2, sy2, r, 0, 6.283); ctx.fill();
      }
    }
    // rolling swell lines so the sea is never still
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 4; k++) {
      const yy = oyp + cell * (0.2 + 0.2 * k) + Math.sin(now * 1.4 + k * 1.7) * cell * 0.06;
      ctx.strokeStyle = `rgba(255,255,255,${(0.22 + 0.12 * (k % 2)).toFixed(2)})`;
      ctx.beginPath();
      for (let x = 0; x <= COLS * cell; x += 3) {
        const y2 = yy + Math.sin(x * 0.07 + now * (1.8 + 0.5 * k) + k * 2) * cell * 0.12
          + Math.sin(x * 0.021 - now * 1.1 + k) * cell * 0.08;
        if (x === 0) ctx.moveTo(x, y2); else ctx.lineTo(x, y2);
      }
      ctx.stroke();
    }
    // lapping wash: between surges the sea keeps sliding up into the wet zone and soaking away
    if (!sim.waveActive) {
      const cycle = 3.4;
      const ph = (now % cycle) / cycle;                 // 0..1
      const rise = 0.5 - 0.5 * Math.cos(ph * 6.283);    // 0 -> 1 -> 0
      const soak = ph < 0.5 ? 1 : 1 - (ph - 0.5) * 2;   // fades while receding
      const reach = cell * 1.7 * rise;
      if (reach > 1) {
        const edgeY = cx => oyp - reach * (0.8 + 0.2 * Math.sin(cx * 0.9 + now * 0.7)) + Math.sin(cx * 1.9 + now * 5) * cell * 0.1;
        ctx.beginPath();
        ctx.moveTo(0, oyp + cell * 0.5);
        for (let x = 0; x <= COLS; x++) ctx.lineTo(x * cell, edgeY(x));
        ctx.lineTo(COLS * cell, oyp + cell * 0.5);
        ctx.closePath();
        const wg = ctx.createLinearGradient(0, oyp - reach, 0, oyp + cell * 0.5);
        wg.addColorStop(0, `rgba(235,246,255,${(0.55 * soak).toFixed(3)})`);
        wg.addColorStop(0.35, `rgba(120,185,235,${(0.35 * soak).toFixed(3)})`);
        wg.addColorStop(1, 'rgba(60,140,210,0.1)');
        ctx.fillStyle = wg;
        ctx.fill();
        // foam line along the wash's leading edge
        ctx.strokeStyle = `rgba(255,255,255,${(0.7 * soak).toFixed(3)})`;
        ctx.lineWidth = Math.max(1.5, cell * 0.12);
        ctx.beginPath();
        for (let x = 0; x <= COLS * cell; x += 3) {
          const yy = edgeY(x / cell);
          if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
    }
    // ripples announcing the next wave
    if (G.phase === 'build') {
      const spec = L.waves[G.waveIndex];
      const span = G.waveIndex === 0 ? L.prep : L.gap;
      const prog = 1 - G.timer / span;
      const intensity = Math.max(0, (prog - 0.35) / 0.65);
      if (intensity > 0) {
        const fx = spec.focus != null ? (spec.focus + 0.5) * cell : COLS * cell / 2;
        const width = spec.focus != null ? (spec.width || 5) * cell * 1.6 : COLS * cell;
        ctx.strokeStyle = `rgba(255,255,255,${(0.25 + 0.55 * intensity).toFixed(3)})`;
        ctx.lineWidth = 1.5;
        const rings = 1 + Math.floor(intensity * 3);
        for (let k = 0; k < rings; k++) {
          const ph = ((t * 0.0015) + k * 0.33) % 1;
          const yy = oyp + cell * (0.15 + 0.7 * ph);
          const half = width * (0.45 + 0.35 * ph);
          ctx.beginPath();
          ctx.moveTo(Math.max(0, fx - half), yy);
          ctx.quadraticCurveTo(fx, yy - cell * 0.35 * intensity, Math.min(COLS * cell, fx + half), yy);
          ctx.stroke();
        }
      }
    }
    // wet zone tint line
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    const wy = (ROWS - 1 - sim.wetRows) * cell;
    ctx.moveTo(0, wy); ctx.lineTo(COLS * cell, wy);
    ctx.stroke();
    ctx.setLineDash([]);

    // castle: art is drawn over cells that still hold their height; breached
    // cells show rubble and an amber outline with the height to rebuild to
    ctx.font = `bold ${Math.max(9, Math.floor(cell * 0.6))}px system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    G.structs.forEach(s => drawStructure(s));

    // cursor cell
    if (ptr.down && sim.inBounds(ptr.cx, ptr.cy) && ptr.cy < ROWS - 1) {
      ctx.strokeStyle = G.mode === 'dig' ? 'rgba(20,20,20,0.7)' : 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(ptr.cx * cell + 1, ptr.cy * cell + 1, cell - 2, cell - 2);
    }
    ctx.restore();
  }

  // ---------- main loop ----------
  let last = performance.now();
  function frame(t) {
    const dt = Math.min(0.045, (t - last) / 1000);
    last = t;
    if (G.sim) update(dt);
    render(t);
    requestAnimationFrame(frame);
  }

  // Debug handle for headless play-testing: window.__tw.step(dt) advances one frame.
  window.__tw = { G, step: dt => { update(dt); render(performance.now()); }, LEVELS };

  layout();
  buildMenu();
  showOverlay('menu');
  requestAnimationFrame(frame);
})();
