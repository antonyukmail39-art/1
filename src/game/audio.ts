/* Крошечный 8-битный синтезатор на WebAudio: все звуки генерируются на лету. */

type OscType = OscillatorType;

/* простой марш-луп: бас + редкая мелодия + хэт (оригинальная последовательность) */
const BASS_LINE = [
  110, 0, 110, 0, 110, 0, 130.81, 0,
  98, 0, 98, 0, 98, 0, 146.83, 0,
  110, 0, 110, 0, 110, 0, 130.81, 0,
  164.81, 0, 146.83, 0, 130.81, 0, 98, 0,
];
const LEAD_LINE = [
  0, 0, 440, 0, 0, 523.25, 0, 440,
  0, 0, 392, 0, 0, 0, 0, 0,
  0, 0, 440, 0, 0, 523.25, 0, 659.25,
  0, 523.25, 440, 0, 392, 0, 0, 0,
];

class Chip {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private humNode: { osc: OscillatorNode; gain: GainNode } | null = null;
  muted = false;

  musicEnabled = true;
  private musicWanted = false;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private mStep = 0;
  private mNext = 0;

  constructor() {
    try {
      this.muted = localStorage.getItem("sp_muted") === "1";
      this.musicEnabled = localStorage.getItem("sp_music") !== "0";
    } catch {
      this.muted = false;
      this.musicEnabled = true;
    }
  }

  /** Вызывать по первому жесту пользователя. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);

    const len = Math.floor(this.ctx.sampleRate * 0.6);
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    if (this.musicWanted && this.musicEnabled) this.startMusicTimer();
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem("sp_muted", m ? "1" : "0");
    } catch { /* ignore */ }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
  }

  private tone(
    type: OscType,
    f0: number,
    f1: number,
    dur: number,
    vol: number,
    delay = 0,
  ) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    this.noteAt(type, f0, f1, t, dur, vol);
  }

  private noteAt(type: OscType, f0: number, f1: number, t: number, dur: number, vol: number) {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, f0), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number, q = 1, delay = 0) {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.25), t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /* -------- эффекты -------- */
  shoot() { this.tone("square", 920, 240, 0.09, 0.16); }
  enemyShoot() { this.tone("square", 620, 180, 0.09, 0.1); }
  brickHit() { this.noise(0.09, 0.22, 1600, 0.8); this.tone("triangle", 190, 90, 0.07, 0.12); }
  steelHit() { this.tone("triangle", 2200, 900, 0.06, 0.14); this.noise(0.05, 0.1, 4200, 2); }
  smallBoom() { this.noise(0.28, 0.3, 1100, 0.7); this.tone("sawtooth", 160, 40, 0.24, 0.2); }
  bigBoom() {
    this.noise(0.55, 0.5, 900, 0.6);
    this.tone("sawtooth", 120, 28, 0.5, 0.32);
    this.tone("square", 80, 24, 0.4, 0.18, 0.03);
  }
  spawnTick() { this.tone("square", 1400, 1400, 0.04, 0.07); }
  powerUp() {
    this.tone("square", 523, 523, 0.07, 0.16);
    this.tone("square", 784, 784, 0.07, 0.16, 0.08);
    this.tone("square", 1046, 1046, 0.12, 0.16, 0.16);
  }
  extraLife() {
    [659, 784, 988, 1319].forEach((f, i) => this.tone("square", f, f, 0.09, 0.15, i * 0.09));
  }
  shieldHit() { this.tone("triangle", 3000, 1200, 0.05, 0.1); }
  freeze() { this.tone("triangle", 1800, 300, 0.35, 0.18); }
  gameOverSting() {
    [392, 330, 262, 196].forEach((f, i) => this.tone("square", f, f * 0.97, 0.22, 0.16, i * 0.22));
  }
  stageStart() {
    [262, 392, 523, 659].forEach((f, i) => this.tone("square", f, f, 0.08, 0.13, i * 0.07));
    this.tone("square", 784, 784, 0.2, 0.13, 0.3);
  }
  stageClear() {
    [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone("square", f, f, 0.1, 0.14, i * 0.09));
  }
  tick() { this.tone("square", 1100, 1100, 0.035, 0.08); }
  uiMove() { this.tone("square", 700, 900, 0.05, 0.08); }
  baseLost() {
    this.bigBoom();
    this.tone("sawtooth", 300, 40, 0.9, 0.3, 0.1);
  }
  /** чихуахуа лает: два коротких нисходящих «гав» */
  bark() {
    this.tone("square", 760, 340, 0.07, 0.13);
    this.tone("square", 640, 260, 0.1, 0.13, 0.1);
  }
  /** поскуливание при потере штаба */
  whimper() {
    [520, 430, 330].forEach((f, i) => this.tone("triangle", f, f * 0.9, 0.16, 0.11, 0.45 + i * 0.17));
  }

  /* -------- гул двигателя игрока -------- */
  hum(on: boolean) {
    if (!this.ctx || !this.master) return;
    if (on && !this.humNode) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = 52;
      g.gain.value = 0;
      osc.connect(g).connect(this.master);
      osc.start();
      this.humNode = { osc, gain: g };
    }
    if (this.humNode) {
      this.humNode.gain.gain.setTargetAtTime(on ? 0.028 : 0, this.ctx.currentTime, 0.05);
      if (!on) {
        const h = this.humNode;
        this.humNode = null;
        setTimeout(() => { try { h.osc.stop(); } catch { /* ok */ } }, 300);
      }
    }
  }

  /* -------- фоновая музыка -------- */
  setMusicEnabled(m: boolean) {
    this.musicEnabled = m;
    try { localStorage.setItem("sp_music", m ? "1" : "0"); } catch { /* ignore */ }
    if (!m) this.stopMusicTimer();
    else if (this.musicWanted && this.ctx) this.startMusicTimer();
  }

  setMusic(on: boolean) {
    this.musicWanted = on;
    if (on && this.musicEnabled && this.ctx) this.startMusicTimer();
    else if (!on) this.stopMusicTimer();
  }

  private startMusicTimer() {
    if (this.musicTimer || !this.ctx) return;
    this.mNext = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => this.pumpMusic(), 60);
  }

  private stopMusicTimer() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private pumpMusic() {
    if (!this.ctx || !this.master) { this.stopMusicTimer(); return; }
    while (this.mNext < this.ctx.currentTime + 0.18) {
      const s = this.mStep % BASS_LINE.length;
      const bass = BASS_LINE[s];
      if (bass) this.noteAt("square", bass, bass, this.mNext, 0.16, 0.05);
      const lead = LEAD_LINE[s];
      if (lead) this.noteAt("triangle", lead, lead, this.mNext, 0.15, 0.045);
      if (s % 2 === 1) this.noiseAt(this.mNext);
      this.mNext += 0.21;
      this.mStep++;
    }
  }

  private noiseAt(t: number) {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 6000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.018, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.05);
  }
}

export const chip = new Chip();
