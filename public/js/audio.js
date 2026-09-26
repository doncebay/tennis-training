// Sounds synthesized with Web Audio (no audio files).
export class Sfx {
  constructor() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);

    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.crowd = this.#crowdBed();
  }

  get unlocked() {
    return this.ctx.state === 'running';
  }

  unlock() {
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  #noiseSource() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    return src;
  }

  #env(gainNode, t, attack, peak, decay) {
    gainNode.gain.setValueAtTime(0.0001, t);
    gainNode.gain.exponentialRampToValueAtTime(peak, t + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  /** Racket "pock". power 0..1 */
  hit(power = 0.6, pan = 0) {
    const t = this.ctx.currentTime;
    const out = this.ctx.createStereoPanner();
    out.pan.value = pan;
    out.connect(this.master);

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520 + power * 180, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.08);
    const og = this.ctx.createGain();
    this.#env(og, t, 0.002, 0.5 + power * 0.4, 0.09);
    osc.connect(og).connect(out);
    osc.start(t);
    osc.stop(t + 0.15);

    const n = this.#noiseSource();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2200;
    bp.Q.value = 1.2;
    const ng = this.ctx.createGain();
    this.#env(ng, t, 0.001, 0.6 + power * 0.3, 0.05);
    n.connect(bp).connect(ng).connect(out);
    n.start(t, Math.random());
    n.stop(t + 0.1);
  }

  /** Each surface makes the bounce sound different. */
  setSurface(name) {
    this.surface = name;
  }

  bounce(strength = 1, pan = 0) {
    const [f0, f1, cutoff, body, grit] = {
      hard: [240, 90, 1400, 0.35, 0.18],
      clay: [165, 65, 650, 0.3, 0.3],
      grass: [190, 75, 800, 0.22, 0.12],
    }[this.surface] || [240, 90, 1400, 0.35, 0.18];
    const t = this.ctx.currentTime;
    const out = this.ctx.createStereoPanner();
    out.pan.value = pan;
    out.connect(this.master);
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + 0.07);
    const g = this.ctx.createGain();
    this.#env(g, t, 0.002, body * Math.min(1, strength), 0.08);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.12);

    const n = this.#noiseSource();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    const ng = this.ctx.createGain();
    this.#env(ng, t, 0.001, grit * Math.min(1, strength), 0.05);
    n.connect(lp).connect(ng).connect(out);
    n.start(t, Math.random());
    n.stop(t + 0.08);
  }

  net() {
    const t = this.ctx.currentTime;
    const n = this.#noiseSource();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    const g = this.ctx.createGain();
    this.#env(g, t, 0.005, 0.7, 0.25);
    n.connect(lp).connect(g).connect(this.master);
    n.start(t);
    n.stop(t + 0.35);
  }

  whoosh() {
    const t = this.ctx.currentTime;
    const n = this.#noiseSource();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2500, t + 0.18);
    const g = this.ctx.createGain();
    this.#env(g, t, 0.06, 0.25, 0.14);
    n.connect(bp).connect(g).connect(this.master);
    n.start(t, Math.random());
    n.stop(t + 0.3);
  }

  /** Line judge call: a synthetic "Out!" (two short tones). */
  call() {
    const t = this.ctx.currentTime;
    for (const [dt, f] of [[0, 380], [0.12, 300]]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1200;
      const g = this.ctx.createGain();
      this.#env(g, t + dt, 0.01, 0.18, 0.12);
      osc.connect(lp).connect(g).connect(this.master);
      osc.start(t + dt);
      osc.stop(t + dt + 0.2);
    }
  }

  #crowdBed() {
    const n = this.#noiseSource();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.6;
    const g = this.ctx.createGain();
    g.gain.value = 0.0001;
    n.connect(bp).connect(g).connect(this.master);
    n.start();
    return g;
  }

  /** Crowd applause. amount 0..1 */
  cheer(amount = 1) {
    const t = this.ctx.currentTime;
    const g = this.crowd.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(g.value, 0.0001), t);
    g.exponentialRampToValueAtTime(0.12 + 0.28 * amount, t + 0.25);
    g.exponentialRampToValueAtTime(0.0001, t + 2.4);
    // Individual claps
    for (let i = 0; i < 40 * amount; i++) {
      const at = t + Math.random() * 1.8;
      const n = this.#noiseSource();
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1500 + Math.random() * 1500;
      const cg = this.ctx.createGain();
      this.#env(cg, at, 0.001, 0.05 + Math.random() * 0.05, 0.03);
      n.connect(bp).connect(cg).connect(this.master);
      n.start(at, Math.random());
      n.stop(at + 0.06);
    }
  }

  groan() {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.8);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    const g = this.ctx.createGain();
    this.#env(g, t, 0.15, 0.06, 0.7);
    osc.connect(lp).connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 1);
  }
}
