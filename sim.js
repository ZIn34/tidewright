// Tidewright - beach simulation core (no DOM). Works in browser and node.
(function (root) {
  'use strict';

  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // Small deterministic PRNG so waves are reproducible per level attempt.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class Sim {
    constructor(cols, rows, opts) {
      opts = opts || {};
      this.cols = cols;
      this.rows = rows;
      const n = cols * rows;
      this.h = new Float32Array(n);     // sand height above base ground (can be negative = dug)
      this.m = new Float32Array(n);     // moisture 0..1
      this.w = new Float32Array(n);     // standing water depth
      this.g = new Float32Array(n);     // base ground (beach slope)
      this.rock = new Uint8Array(n);
      this.flow = new Float32Array(n);  // water flow magnitude during last step
      this.dw = new Float32Array(n);
      this.slope = opts.slope != null ? opts.slope : 1.3;
      this.wetRows = opts.wetRows != null ? opts.wetRows : 3;
      this.dryRate = opts.dryRate != null ? opts.dryRate : 0.01;
      this.flowRate = opts.flowRate != null ? opts.flowRate : 14;
      this.eroRate = opts.eroRate != null ? opts.eroRate : 0.35;
      this.eroThr = opts.eroThr != null ? opts.eroThr : 0.35;
      this.pressRate = opts.pressRate != null ? opts.pressRate : 0.12;
      this.maxH = 4;
      this.minH = -2;
      this.rand = mulberry32(opts.seed || 1);
      this.time = 0;

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const up = (rows - 1 - y) / (rows - 1); // 0 at ocean row, 1 at top
          this.g[i] = this.slope * up;
          // moisture gradient: wet near the water, dry up the beach
          const distFromWet = y - (rows - 1 - this.wetRows);
          if (distFromWet >= 0) this.m[i] = 1;
          else this.m[i] = Math.max(0.12, 0.9 + distFromWet * 0.08);
          if (opts.allWet) this.m[i] = 1;
        }
      }
      // ocean row is a basin
      for (let x = 0; x < cols; x++) this.g[(rows - 1) * cols + x] = -0.6;

      this.waveActive = false;
      this.waveT = 0;
      this.waveSpec = null;
      this.waveNoise = new Float32Array(cols);
    }

    idx(x, y) { return y * this.cols + x; }
    inBounds(x, y) { return x >= 0 && y >= 0 && x < this.cols && y < this.rows; }
    isOcean(y) { return y === this.rows - 1; }
    surface(i) { return this.g[i] + this.h[i] + this.w[i]; }

    setRock(x, y) {
      const i = this.idx(x, y);
      this.rock[i] = 1;
      this.h[i] = 6;
      this.m[i] = 0;
    }

    startWave(spec) {
      this.waveActive = true;
      this.waveT = 0;
      this.waveSpec = spec;
      for (let x = 0; x < this.cols; x++) this.waveNoise[x] = 0.85 + this.rand() * 0.3;
    }

    // Wave injection profile for a column, 0..1 factor
    waveFactor(x) {
      const s = this.waveSpec;
      let f = this.waveNoise[x];
      if (s.focus != null) {
        const width = s.width || 5;
        const d = (x - s.focus) / width;
        f *= 0.15 + 0.85 * Math.exp(-d * d);
      }
      return f;
    }

    step(dt) {
      const cols = this.cols, rows = this.rows;
      this.time += dt;
      this.flow.fill(0);

      // Wave injection into the ocean row
      if (this.waveActive) {
        const s = this.waveSpec;
        const dur = s.duration || 1.6;
        const t = this.waveT;
        const env = Math.sin(Math.PI * Math.min(1, t / dur));
        const base = (rows - 1) * cols;
        for (let x = 0; x < cols; x++) {
          this.w[base + x] += s.s * env * this.waveFactor(x) * dt * 3.0;
        }
        this.waveT += dt;
        if (t >= dur) this.waveActive = false;
      }

      // Water flow
      const sub = 3;
      for (let k = 0; k < sub; k++) this.flowStep(dt / sub);

      // Ocean row drains back to sea when not surging
      if (!this.waveActive) {
        const base = (rows - 1) * cols;
        const keep = Math.max(0, 1 - 5 * dt);
        for (let x = 0; x < cols; x++) this.w[base + x] *= keep;
      }

      // Absorption, drying, erosion, slump
      const wetStart = rows - 1 - this.wetRows;
      for (let y = 0; y < rows - 1; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          if (this.rock[i]) continue;
          const wv = this.w[i];
          if (wv > 0.002) {
            this.m[i] = Math.min(1, this.m[i] + wv * dt * 1.5 + dt * 0.5);
            this.w[i] = Math.max(0, wv - 0.05 * dt);
          } else {
            this.w[i] = 0;
            this.m[i] = Math.max(0, this.m[i] - this.dryRate * dt);
          }
          if (y >= wetStart) this.m[i] = Math.max(this.m[i], 0.85);

          // Erosion of built sand by rushing / pressing water.
          // Only the part of a neighbour's water column that sits above this
          // cell's ground level touches the sand; water down in a moat does not.
          if (this.h[i] > 0) {
            let f = this.flow[i];
            let press = 0;
            const gi = this.g[i];
            for (let d = 0; d < 4; d++) {
              const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
              if (!this.inBounds(nx, ny)) continue;
              const j = ny * cols + nx;
              const wj = this.w[j];
              if (wj <= 0.002) continue;
              const above = this.g[j] + this.h[j] + wj - gi; // water surface above wall base
              if (above <= 0) continue;
              const contact = Math.min(1, above / wj);
              f += 0.5 * this.flow[j] * contact;
              if (above > press) press = above;
            }
            const rate = f / dt;
            let ero = Math.max(0, rate - this.eroThr) * this.eroRate + press * this.pressRate;
            if (ero > 0) {
              ero *= dt * (1.7 - this.m[i]);
              this.h[i] = Math.max(0, this.h[i] - ero);
            }
          }
        }
      }
      this.slump(dt);
    }

    flowStep(dt) {
      const cols = this.cols, rows = this.rows;
      const w = this.w, dw = this.dw, flow = this.flow;
      dw.fill(0);
      const rate = Math.min(0.45, dt * this.flowRate);
      const qs = [0, 0, 0, 0];
      const js = [0, 0, 0, 0];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const wi = w[i];
          if (wi < 1e-4) continue;
          const si = this.g[i] + this.h[i] + wi;
          let tot = 0;
          for (let d = 0; d < 4; d++) {
            qs[d] = 0;
            const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
            if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
            const j = ny * cols + nx;
            if (this.rock[j]) continue;
            const diff = si - (this.g[j] + this.h[j] + w[j]);
            if (diff > 0) { qs[d] = diff * 0.5; js[d] = j; tot += diff * 0.5; }
          }
          if (tot <= 0) continue;
          let scale = rate;
          if (tot * scale > wi) scale = wi / tot;
          for (let d = 0; d < 4; d++) {
            const q = qs[d] * scale;
            if (q <= 0) continue;
            const j = js[d];
            dw[i] -= q; dw[j] += q;
            flow[i] += q; flow[j] += q;
          }
        }
      }
      for (let i = 0; i < w.length; i++) {
        w[i] += dw[i];
        if (w[i] < 0) w[i] = 0;
      }
    }

    slump(dt) {
      const cols = this.cols, rows = this.rows;
      const p = Math.min(1, dt * 5);
      for (let y = 0; y < rows - 1; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          if (this.rock[i]) continue;
          const limit = 1.0 + 3.2 * this.m[i];
          const si = this.g[i] + this.h[i];
          for (let d = 0; d < 4; d++) {
            const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
            if (!this.inBounds(nx, ny) || ny === rows - 1) continue;
            const j = ny * cols + nx;
            if (this.rock[j]) continue;
            const diff = si - (this.g[j] + this.h[j]);
            if (diff > limit && this.rand() < p) {
              const mv = Math.min(0.5, (diff - limit) * 0.5 + 0.15);
              if (this.h[j] + mv > this.maxH) continue;
              this.h[i] -= mv;
              this.h[j] += mv;
              // moved sand carries its moisture
              this.m[j] = Math.max(this.m[j], this.m[i] * 0.9);
            }
          }
        }
      }
    }

    // Player digs one unit; returns {amount, moist}
    dig(x, y, amount) {
      if (!this.inBounds(x, y) || this.isOcean(y)) return { amount: 0, moist: 0 };
      const i = this.idx(x, y);
      if (this.rock[i]) return { amount: 0, moist: 0 };
      const old = this.h[i];
      const nh = Math.max(this.minH, old - amount);
      this.h[i] = nh;
      return { amount: old - nh, moist: this.m[i] };
    }

    // Player places sand of a given moisture; returns amount actually placed
    place(x, y, amount, moist) {
      if (!this.inBounds(x, y) || this.isOcean(y)) return 0;
      const i = this.idx(x, y);
      if (this.rock[i]) return 0;
      const old = this.h[i];
      const nh = Math.min(this.maxH, old + amount);
      const placed = nh - old;
      if (placed <= 0) return 0;
      this.h[i] = nh;
      const weight = Math.max(0.5, Math.abs(old));
      this.m[i] = (this.m[i] * weight + moist * placed) / (weight + placed);
      return placed;
    }

    // Structure check: all cells at or above required height (with tolerance)
    standing(st) {
      let ok = 0, total = 0;
      for (let y = st.y; y < st.y + st.h; y++) {
        for (let x = st.x; x < st.x + st.w; x++) {
          if (!this.inBounds(x, y)) continue;
          total++;
          if (this.h[this.idx(x, y)] >= st.req - 0.5) ok++;
        }
      }
      return { ok, total, standing: ok === total };
    }
  }

  const api = { Sim, mulberry32 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Tidewright = Object.assign(root.Tidewright || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
