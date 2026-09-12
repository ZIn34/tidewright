// Tidewright - placeholder sound effects synthesized with Web Audio.
// No samples: filtered noise for water and sand, plain tones for feedback.
// Swap any of these for real recordings later by replacing the play() branch.
(function (root) {
  'use strict';

  let ac = null, master = null, noiseBuf = null, wash = null, ambient = null;
  let muted = false;
  try { muted = localStorage.getItem('tw_mute') === '1'; } catch (e) { /* ignore */ }

  function ensure() {
    if (ac) { if (ac.state === 'suspended') ac.resume().catch(() => {}); return true; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ac.destination);
    // two seconds of white noise, reused by every watery or sandy sound
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startLoops();
    return true;
  }

  function noise(loop) {
    const s = ac.createBufferSource();
    s.buffer = noiseBuf; s.loop = !!loop;
    return s;
  }
  function env(g, t, a, peak, d, floor) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(floor || 0.0001, t + a + d);
  }

  function startLoops() {
    // wash: water running over sand, level set from the sim each tick
    const wn = noise(true);
    const wf = ac.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 700; wf.Q.value = 0.7;
    wash = ac.createGain(); wash.gain.value = 0;
    wn.connect(wf); wf.connect(wash); wash.connect(master); wn.start();
    // ambient: distant surf, very quiet, breathing slowly
    const an = noise(true);
    const af = ac.createBiquadFilter(); af.type = 'lowpass'; af.frequency.value = 380;
    ambient = ac.createGain(); ambient.gain.value = 0.035;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.09;
    const lg = ac.createGain(); lg.gain.value = 0.02;
    lfo.connect(lg); lg.connect(ambient.gain);
    an.connect(af); af.connect(ambient); ambient.connect(master); an.start(); lfo.start();
  }

  function tone(type, f0, f1, t, dur, peak, attack) {
    const o = ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain();
    env(g, t, attack || 0.01, peak, dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function burst(t, dur, peak, filterType, f0, f1, q) {
    const n = noise(false);
    const f = ac.createBiquadFilter(); f.type = filterType; f.Q.value = q || 0.8;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ac.createGain();
    env(g, t, 0.01, peak, dur);
    n.connect(f); f.connect(g); g.connect(master);
    n.start(t); n.stop(t + dur + 0.05);
  }

  function play(name) {
    if (!ensure()) return;
    const t = ac.currentTime;
    switch (name) {
      case 'surge': {
        // rising rush that breaks into a crash
        const n = noise(false);
        const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.9;
        f.frequency.setValueAtTime(250, t); f.frequency.exponentialRampToValueAtTime(1400, t + 1.2);
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.7, t + 1.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
        n.connect(f); f.connect(g); g.connect(master); n.start(t); n.stop(t + 1.6);
        burst(t + 1.1, 1.6, 0.9, 'lowpass', 1200, 180, 0.6);
        break;
      }
      case 'dig': burst(t, 0.13, 0.3, 'bandpass', 700 + Math.random() * 400, 400, 1.2); break;
      case 'build': tone('sine', 170 + Math.random() * 30, 60, t, 0.14, 0.5); burst(t, 0.06, 0.15, 'lowpass', 900, 300, 0.7); break;
      case 'crumble': for (let k = 0; k < 6; k++) burst(t + k * 0.07, 0.06, 0.18 * (1 - k / 7), 'highpass', 1800, 2600, 0.8); break;
      case 'breach': tone('sine', 95, 38, t, 0.45, 0.7); burst(t, 0.4, 0.4, 'lowpass', 500, 120, 0.7); break;
      case 'repair': tone('triangle', 660, 660, t, 0.08, 0.25); tone('triangle', 990, 990, t + 0.09, 0.12, 0.25); break;
      case 'warn': tone('sine', 520, 520, t, 0.28, 0.22, 0.06); break;
      case 'won': [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, t + i * 0.12, 0.28, 0.3)); break;
      case 'lost': tone('triangle', 300, 300, t, 0.32, 0.35); tone('triangle', 220, 200, t + 0.34, 0.5, 0.35); break;
      case 'horn': { tone('sawtooth', 220, 230, t, 0.5, 0.18, 0.03); tone('sawtooth', 165, 172, t, 0.5, 0.14, 0.03); break; }
      case 'flag': burst(t, 0.05, 0.2, 'highpass', 3000, 5000, 0.5); break;
      default: break;
    }
  }

  // 0..1 amount of water rushing over the beach right now
  function setWash(level) {
    if (!ac || !wash) return;
    const v = Math.max(0, Math.min(1, level)) * 0.45;
    wash.gain.setTargetAtTime(v, ac.currentTime, 0.12);
  }
  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem('tw_mute', muted ? '1' : '0'); } catch (e) { /* ignore */ }
    if (master) master.gain.setTargetAtTime(muted ? 0 : 1, ac.currentTime, 0.02);
  }
  function isMuted() { return muted; }
  function unlock() { ensure(); }

  root.Tidewright = Object.assign(root.Tidewright || {}, { SFX: { play, setWash, setMuted, isMuted, unlock } });
})(typeof window !== 'undefined' ? window : globalThis);
