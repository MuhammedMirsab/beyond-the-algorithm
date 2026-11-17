export type MusicTheme = "menu" | "level1" | "level2" | "level3";

interface ThemeDef {
  bpm: number;
  /** One chord per bar, as MIDI notes (lowest = root). */
  chords: number[][];
  /** 8 steps per bar; index into the chord (+ octave), -1 = rest. */
  arp: number[];
  /** Steps (0..7) on which the bass plays. */
  bass: number[];
  hats: boolean;
  kick: boolean;
  arpGain: number;
  padGain: number;
}

const THEMES: Record<MusicTheme, ThemeDef> = {
  menu: {
    bpm: 80,
    chords: [
      [53, 57, 60, 64],
      [52, 55, 59, 62],
      [50, 53, 57, 64],
      [48, 52, 55, 59],
    ],
    arp: [0, -1, 2, -1, 3, -1, 1, -1],
    bass: [0],
    hats: false,
    kick: false,
    arpGain: 0.028,
    padGain: 0.016,
  },
  level1: {
    bpm: 96,
    chords: [
      [48, 52, 55, 59, 62],
      [45, 52, 55, 60],
      [41, 52, 57, 60],
      [43, 50, 55, 59, 64],
    ],
    arp: [0, 2, 3, 2, 4, 2, 3, 1],
    bass: [0, 4],
    hats: false,
    kick: false,
    arpGain: 0.03,
    padGain: 0.014,
  },
  level2: {
    bpm: 106,
    chords: [
      [50, 53, 57, 60, 64],
      [46, 53, 57, 62],
      [43, 50, 53, 58, 62],
      [45, 52, 55, 57, 61],
    ],
    arp: [0, 3, 2, 4, -1, 3, 1, 2],
    bass: [0, 3, 4],
    hats: true,
    kick: false,
    arpGain: 0.028,
    padGain: 0.013,
  },
  level3: {
    bpm: 124,
    chords: [
      [40, 52, 55, 59, 62],
      [48, 52, 55, 59],
      [43, 50, 55, 59, 62],
      [47, 50, 54, 57, 62],
    ],
    arp: [0, 2, 4, 2, 3, 2, 4, 1],
    bass: [0, 2, 4, 6],
    hats: true,
    kick: true,
    arpGain: 0.026,
    padGain: 0.012,
  },
};

const freq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * A small generative music sequencer: soft pad chords, a plucked arpeggio,
 * bass and (in later levels) light percussion, scheduled ahead of time on the
 * audio clock so timing stays tight even if the game frame rate dips.
 */
export class MusicPlayer {
  theme: MusicTheme | null = null;
  private timer = 0;
  private step = 0;
  private nextTime = 0;
  private readonly bus: GainNode;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    private readonly noiseBuffer: AudioBuffer,
  ) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(destination);
  }

  play(theme: MusicTheme) {
    if (this.theme === theme && this.timer) return;
    const restarting = this.timer !== 0;
    this.stopTimer();
    this.theme = theme;
    this.step = 0;
    const now = this.ctx.currentTime;
    this.nextTime = now + (restarting ? 0.35 : 0.08);
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.setValueAtTime(this.bus.gain.value, now);
    if (restarting) this.bus.gain.linearRampToValueAtTime(0, now + 0.3);
    this.bus.gain.linearRampToValueAtTime(0.9, this.nextTime + 1.2);
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop() {
    if (!this.timer) {
      this.theme = null;
      return;
    }
    const now = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(now);
    this.bus.gain.setValueAtTime(this.bus.gain.value, now);
    this.bus.gain.linearRampToValueAtTime(0, now + 0.5);
    this.stopTimer();
    this.theme = null;
  }

  private stopTimer() {
    window.clearInterval(this.timer);
    this.timer = 0;
  }

  private schedule() {
    if (!this.theme) return;
    if (this.ctx.state !== "running") return;
    const def = THEMES[this.theme];
    const stepDur = 60 / def.bpm / 2;
    // Catch up gracefully after the tab was in the background.
    if (this.nextTime < this.ctx.currentTime - 0.2) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      this.playStep(def, this.step, this.nextTime, stepDur);
      this.step++;
      this.nextTime += stepDur;
    }
  }

  private playStep(def: ThemeDef, step: number, t: number, stepDur: number) {
    const inBar = step % 8;
    const bar = Math.floor(step / 8);
    const chord = def.chords[bar % def.chords.length];

    if (inBar === 0) {
      for (const n of chord.slice(1)) this.padNote(freq(n), stepDur * 8 + 0.4, def.padGain, t);
    }
    const a = def.arp[inBar];
    if (a >= 0) {
      const tones = chord.slice(1);
      const n = tones[a % tones.length] + 12 * (1 + Math.floor(a / tones.length));
      // A little humanised velocity keeps the arpeggio from sounding mechanical.
      const vel = 0.75 + 0.25 * Math.sin(step * 1.7) * Math.sin(step * 0.31);
      this.pluck(freq(n), def.arpGain * vel, t);
    }
    if (def.bass.includes(inBar)) this.bassNote(freq(chord[0] - 12), Math.min(0.5, stepDur * 1.8), t);
    if (def.hats && inBar % 2 === 1) this.hat(t, inBar === 7 ? 0.014 : 0.009);
    if (def.kick && inBar % 4 === 0) this.kick(t);
  }

  private padNote(f: number, dur: number, gain: number, t: number) {
    const out = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1100;
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(gain, t + 0.5);
    out.gain.setValueAtTime(gain, t + dur - 0.5);
    out.gain.linearRampToValueAtTime(0.0001, t + dur);
    lp.connect(out).connect(this.bus);
    for (const detune of [-6, 6]) {
      const osc = this.ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = f;
      osc.detune.value = detune;
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  }

  private pluck(f: number, gain: number, t: number) {
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter();
    osc.type = "triangle";
    osc2.type = "sine";
    osc.frequency.value = f;
    osc2.frequency.value = f * 2;
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + 0.3);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.3;
    osc.connect(lp);
    osc2.connect(g2).connect(lp);
    lp.connect(env).connect(this.bus);
    osc.start(t);
    osc2.start(t);
    osc.stop(t + 0.45);
    osc2.stop(t + 0.45);
  }

  private bassNote(f: number, dur: number, t: number) {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = f;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.09, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(this.bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private hat(t: number, gain: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    src.connect(hp).connect(env).connect(this.bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.06);
  }

  private kick(t: number) {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.11, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(env).connect(this.bus);
    osc.start(t);
    osc.stop(t + 0.22);
  }
}
