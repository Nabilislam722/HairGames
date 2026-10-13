// Every sound is synthesized with WebAudio, so the game ships without audio files.

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
const semis = (n) => 2 ** (n / 12);

export class Sound {
  constructor({ sfx = true, music = true } = {}) {
    this.sfxOn = sfx;
    this.musicOn = music;
    this.ctx = null;
    this.lastPlayed = new Map();
    this.musicTimer = null;
    this.step = 0;
    this.nextNoteTime = 0;
  }

  // Must run inside a user gesture; browsers keep audio locked until then.
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      try {
        this.ctx = new Ctx();
      } catch {
        return;
      }
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = this.sfxOn ? 0.75 : 0;
      this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.musicOn ? 0.16 : 0;
      this.musicBus.connect(this.master);
      this.noise = this.makeNoise();
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.ctx.suspend?.();
        else this.ctx.resume?.();
      });
    }
    if (this.ctx.state === 'suspended') this.ctx.resume?.();
    if (this.musicOn) this.startMusic();
  }

  setSfx(on) {
    this.sfxOn = on;
    if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(on ? 0.75 : 0, this.ctx.currentTime, 0.02);
  }

  setMusic(on) {
    this.musicOn = on;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(on ? 0.16 : 0, this.ctx.currentTime, 0.1);
    if (on) this.startMusic();
  }

  makeNoise() {
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // ------------------------------------------------------------------ building blocks

  tone(freq, { type = 'sine', at = 0, attack = 0.004, decay = 0.2, gain = 0.3, slideTo = null, slideTime = 0.06, bus = this.sfxBus } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + slideTime);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    osc.connect(amp).connect(bus);
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
  }

  hiss({ at = 0, duration = 0.15, gain = 0.2, type = 'bandpass', freq = 1500, freqTo = null, q = 1 } = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, t);
    if (freqTo) filter.frequency.exponentialRampToValueAtTime(freqTo, t + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(amp).connect(this.sfxBus);
    src.start(t, Math.random() * 0.8);
    src.stop(t + duration + 0.05);
  }

  bell(freq, { at = 0, gain = 0.22, decay = 0.9, bus = this.sfxBus } = {}) {
    this.tone(freq, { at, gain, decay, bus });
    this.tone(freq * 2, { at, gain: gain * 0.35, decay: decay * 0.6, bus });
    this.tone(freq * 3.01, { at, gain: gain * 0.15, decay: decay * 0.35, bus });
  }

  // ------------------------------------------------------------------ effects

  play(name, opts = {}) {
    if (!this.ctx || !this.sfxOn || this.ctx.state !== 'running') return;
    // Throttle very frequent sounds so big cascades do not turn into noise.
    const minGap = { pop: 0.028, land: 0.05, zing: 0.03, crack: 0.04, ice: 0.05, clink: 0.05, crunch: 0.05 }[name] ?? 0;
    const now = this.ctx.currentTime;
    if (minGap && now - (this.lastPlayed.get(name) ?? -1) < minGap) return;
    this.lastPlayed.set(name, now);
    const fn = this[`sfx_${name}`];
    if (fn) fn.call(this, opts);
  }

  sfx_pop({ step = 0 } = {}) {
    const n = PENTA[Math.min(PENTA.length - 1, step)];
    const f = 523 * semis(n);
    this.tone(f * 1.8, { slideTo: f, slideTime: 0.045, decay: 0.16, gain: 0.28, type: 'sine' });
    this.tone(f * 2.01, { decay: 0.08, gain: 0.07, type: 'triangle' });
    this.hiss({ duration: 0.035, gain: 0.08, freq: 2800, q: 2 });
  }

  sfx_select() {
    this.tone(660, { slideTo: 880, slideTime: 0.05, decay: 0.08, gain: 0.12, type: 'triangle' });
  }

  sfx_swap() {
    this.hiss({ duration: 0.17, gain: 0.16, freq: 500, freqTo: 2600, q: 1.4 });
    this.tone(380, { slideTo: 520, slideTime: 0.12, decay: 0.12, gain: 0.06, type: 'triangle' });
  }

  sfx_nope() {
    this.tone(330, { type: 'triangle', decay: 0.09, gain: 0.16 });
    this.tone(247, { type: 'triangle', at: 0.1, decay: 0.16, gain: 0.16, slideTo: 220, slideTime: 0.12 });
  }

  sfx_land({ strength = 1 } = {}) {
    this.tone(150, { slideTo: 95, slideTime: 0.05, decay: 0.07, gain: 0.07 * strength });
  }

  sfx_special() {
    [0, 4, 7, 12].forEach((s, i) => this.tone(880 * semis(s), { at: i * 0.045, decay: 0.22, gain: 0.13, type: 'triangle' }));
    this.hiss({ at: 0.05, duration: 0.3, gain: 0.05, type: 'highpass', freq: 6000 });
  }

  sfx_zap() {
    this.tone(1600, { type: 'sawtooth', slideTo: 180, slideTime: 0.28, decay: 0.3, gain: 0.07 });
    this.hiss({ duration: 0.3, gain: 0.18, freq: 4000, freqTo: 400, q: 0.8 });
  }

  sfx_boom() {
    this.hiss({ duration: 0.7, gain: 0.55, type: 'lowpass', freq: 2200, freqTo: 90, q: 0.7 });
    this.tone(120, { slideTo: 36, slideTime: 0.45, decay: 0.5, gain: 0.55 });
  }

  sfx_charge() {
    this.tone(260, { slideTo: 1300, slideTime: 0.32, decay: 0.34, gain: 0.08, type: 'triangle' });
    this.hiss({ duration: 0.34, gain: 0.07, type: 'highpass', freq: 3000, freqTo: 9000 });
  }

  sfx_zing() {
    const f = 1047 * semis(PENTA[Math.floor(Math.random() * 7)]);
    this.tone(f, { decay: 0.1, gain: 0.07, type: 'sine' });
  }

  sfx_mega() {
    this.sfx_boom();
    [0, 4, 7, 11, 14].forEach((s, i) => this.bell(523 * semis(s), { at: 0.05 + i * 0.06, gain: 0.12 }));
  }

  sfx_combo({ level = 2 } = {}) {
    const root = 392 * semis(PENTA[Math.min(PENTA.length - 3, level)]);
    this.bell(root, { gain: 0.16 });
    this.bell(root * semis(4), { at: 0.06, gain: 0.12 });
    this.bell(root * semis(7), { at: 0.12, gain: 0.12 });
  }

  sfx_ice() {
    this.hiss({ duration: 0.12, gain: 0.16, type: 'highpass', freq: 3500 });
    [2300, 3100, 3900].forEach((f, i) => this.tone(f * (0.95 + Math.random() * 0.1), { at: i * 0.02, decay: 0.12, gain: 0.05 }));
  }

  sfx_crack() {
    this.hiss({ duration: 0.09, gain: 0.25, type: 'lowpass', freq: 1100 });
    this.tone(150, { slideTo: 90, decay: 0.08, gain: 0.15 });
  }

  sfx_crunch() {
    this.hiss({ duration: 0.14, gain: 0.25, freq: 700, q: 1.5 });
    this.hiss({ at: 0.05, duration: 0.1, gain: 0.15, freq: 1200, q: 1.5 });
  }

  sfx_clink() {
    this.tone(1320, { decay: 0.18, gain: 0.08 });
    this.tone(1975, { decay: 0.14, gain: 0.06 });
    this.tone(2637, { at: 0.03, decay: 0.12, gain: 0.04 });
  }

  sfx_ding({ step = 0 } = {}) {
    this.bell(784 * semis(PENTA[Math.min(PENTA.length - 1, step)]), { gain: 0.14, decay: 0.5 });
  }

  sfx_bonus() {
    this.tone(988, { type: 'square', decay: 0.07, gain: 0.05 });
    this.tone(1319, { type: 'square', at: 0.07, decay: 0.25, gain: 0.05 });
  }

  sfx_shuffle() {
    this.hiss({ duration: 0.6, gain: 0.14, freq: 300, freqTo: 3000, q: 1 });
  }

  sfx_star({ step = 0 } = {}) {
    const f = 659 * semis([0, 4, 7][step] ?? 0);
    this.bell(f, { gain: 0.2, decay: 1.1 });
    this.hiss({ duration: 0.25, gain: 0.06, type: 'highpass', freq: 7000 });
  }

  sfx_win() {
    [0, 4, 7, 12].forEach((s, i) => this.bell(523 * semis(s), { at: i * 0.11, gain: 0.16, decay: 1 }));
    [0, 4, 7].forEach((s) => this.bell(1047 * semis(s), { at: 0.5, gain: 0.09, decay: 1.4 }));
  }

  sfx_lose() {
    [7, 4, 0].forEach((s, i) => this.tone(392 * semis(s - 7), { at: i * 0.2, type: 'triangle', decay: 0.4, gain: 0.14 }));
  }

  sfx_click() {
    this.tone(740, { slideTo: 980, slideTime: 0.03, decay: 0.06, gain: 0.1, type: 'triangle' });
  }

  sfx_whoosh() {
    this.hiss({ duration: 0.35, gain: 0.12, freq: 400, freqTo: 1800, q: 0.9 });
  }

  // ------------------------------------------------------------------ music

  // A light music-box loop: I-vi-IV-V with a walking arpeggio, scheduled slightly ahead of time.
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 60);
  }

  scheduleMusic() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const beat = 60 / 100 / 2; // eighth notes at 100 bpm
    const chords = [
      [0, 4, 7],
      [-3, 0, 4],
      [-7, -3, 0],
      [-5, -1, 2],
      [0, 4, 7],
      [-3, 0, 4],
      [-7, -3, 0],
      [-5, 2, 7],
    ];
    const pattern = [0, 2, 1, 2, 0, 2, 1, 3];
    while (this.nextNoteTime < this.ctx.currentTime + 0.25) {
      const at = this.nextNoteTime - this.ctx.currentTime;
      const bar = Math.floor(this.step / 8) % chords.length;
      const chord = chords[bar];
      const pos = this.step % 8;
      const idx = pattern[pos];
      const semitone = idx === 3 ? chord[0] + 12 : chord[idx];
      const f = 523.25 * semis(semitone);
      if (this.musicOn) {
        this.tone(f, { at, type: 'triangle', attack: 0.006, decay: 0.42, gain: 0.16, bus: this.musicBus });
        this.tone(f * 2, { at, type: 'sine', attack: 0.004, decay: 0.2, gain: 0.04, bus: this.musicBus });
        if (pos === 0 || pos === 4) {
          this.tone(130.81 * semis(chord[0]), { at, type: 'sine', attack: 0.02, decay: 0.6, gain: 0.22, bus: this.musicBus });
        }
        if (pos === 6 && bar % 2 === 1) {
          const n = chord[2] + 12 + (Math.random() < 0.5 ? 2 : 0);
          this.tone(523.25 * semis(n), { at: at + beat / 2, type: 'sine', decay: 0.5, gain: 0.07, bus: this.musicBus });
        }
      }
      this.nextNoteTime += beat;
      this.step++;
    }
  }
}
