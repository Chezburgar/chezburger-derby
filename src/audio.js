// Procedural WebAudio sound effects (no asset files needed)

export class Sfx {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.boostNoise = null;
    this.boostGain = null;
    this.master = null;
    this.enabled = true;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    // engine: saw through lowpass
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 40;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 2;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(lp).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();

    // boost: filtered noise
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 1, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.boostNoise = this.ctx.createBufferSource();
    this.boostNoise.buffer = buf; this.boostNoise.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.7;
    this.boostGain = this.ctx.createGain();
    this.boostGain.gain.value = 0;
    this.boostNoise.connect(bp).connect(this.boostGain).connect(this.master);
    this.boostNoise.start();
  }

  engine(speedFrac, boosting, dt) {
    if (!this.ctx) return;
    const target = 0.028 + speedFrac * 0.035;
    this.engineGain.gain.value += (target - this.engineGain.gain.value) * Math.min(1, dt * 8);
    this.engineOsc.frequency.value = 38 + speedFrac * 110;
    const bt = boosting ? 0.10 : 0;
    this.boostGain.gain.value += (bt - this.boostGain.gain.value) * Math.min(1, dt * 12);
  }

  _blip(freq, dur, type = 'square', vol = 0.2, slideTo = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur);
  }

  _thump(vol, freq = 70, dur = 0.18) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 2.2, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur);
  }

  ballHit(strength) { this._thump(Math.min(0.6, 0.12 + strength * 0.012), 80, 0.22); }
  bump() { this._thump(0.3, 55, 0.15); }
  jump() { this._blip(220, 0.12, 'triangle', 0.12, 340); }
  flip() { this._blip(300, 0.15, 'triangle', 0.12, 160); }
  pad(big) { this._blip(big ? 520 : 660, 0.14, 'sine', 0.18, big ? 780 : 880); }
  demo() {
    this._thump(0.55, 40, 0.5);
    this._blip(1400, 0.35, 'sawtooth', 0.12, 90);
  }
  count() { this._blip(440, 0.14, 'square', 0.16); }
  go() { this._blip(880, 0.4, 'square', 0.18); }
  ui() { this._blip(700, 0.06, 'sine', 0.1); }
  whistle() { this._blip(2200, 0.5, 'square', 0.1, 2100); }

  goal() {
    if (!this.ctx) return;
    this._thump(0.6, 45, 0.6);
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => this._blip(f, 0.35, 'square', 0.14), i * 90));
  }

  win() {
    const notes = [523, 659, 784, 1047, 784, 1047];
    notes.forEach((f, i) => setTimeout(() => this._blip(f, 0.3, 'triangle', 0.16), i * 140));
  }

  stopEngine() {
    if (this.engineGain) this.engineGain.gain.value = 0;
    if (this.boostGain) this.boostGain.gain.value = 0;
  }
}
