/**
 * Chiptune-style sound effects synthesised with Web Audio (square, triangle
 * and noise voices). Original jingles; no audio files. Respects the arcade's
 * sound switch on every call.
 */
import { isSoundOn } from "@/lib/sound";

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  /** Call from any user gesture; browsers keep audio locked until one. */
  unlock() {
    const ctx = this.ensure();
    if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = 0.42;
      master.connect(ctx.destination);
      const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.ctx = ctx;
      this.master = master;
      this.noise = noise;
      return ctx;
    } catch {
      return null;
    }
  }

  private ready(): { ctx: AudioContext; out: GainNode } | null {
    if (!isSoundOn()) return null;
    const ctx = this.ensure();
    if (!ctx || !this.master) return null;
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    if (ctx.state !== "running") return null;
    return { ctx, out: this.master };
  }

  private tone(
    freq: number,
    dur: number,
    { type = "square", vol = 0.25, at = 0, slide }: { type?: OscillatorType; vol?: number; at?: number; slide?: number } = {},
  ) {
    const r = this.ready();
    if (!r) return;
    const t = r.ctx.currentTime + at;
    const osc = r.ctx.createOscillator();
    const g = r.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.setValueAtTime(vol, t + Math.max(0.006, dur * 0.7));
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g).connect(r.out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private burst(dur: number, { vol = 0.4, at = 0, freq = 1200, q = 0.8, kind = "bandpass" as BiquadFilterType } = {}) {
    const r = this.ready();
    if (!r || !this.noise) return;
    const t = r.ctx.currentTime + at;
    const src = r.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = r.ctx.createBiquadFilter();
    f.type = kind;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = r.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(r.out);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private melody(notes: [number, number][], { type = "square" as OscillatorType, vol = 0.18, at = 0, gap = 0 } = {}) {
    let t = at;
    for (const [m, d] of notes) {
      if (m > 0) this.tone(midi(m), d * 0.92, { type, vol, at: t });
      t += d + gap;
    }
  }

  shot() {
    this.burst(0.22, { vol: 0.55, freq: 1500, q: 0.6 });
    this.burst(0.12, { vol: 0.5, freq: 300, kind: "lowpass" });
    this.tone(170, 0.16, { type: "triangle", vol: 0.5, slide: 40 });
  }
  empty() {
    this.tone(1800, 0.025, { vol: 0.12 });
    this.tone(1200, 0.025, { vol: 0.1, at: 0.05 });
  }
  hit() {
    this.tone(660, 0.06, { vol: 0.2, slide: 1400 });
    this.tone(1320, 0.08, { vol: 0.14, at: 0.06 });
  }
  fall() {
    this.tone(1500, 0.85, { vol: 0.09, slide: 160 });
  }
  land() {
    this.burst(0.18, { vol: 0.45, freq: 260, kind: "lowpass" });
  }
  chirp() {
    this.tone(2600, 0.05, { type: "sine", vol: 0.12, slide: 3500 });
    this.tone(2800, 0.06, { type: "sine", vol: 0.1, at: 0.09, slide: 3800 });
  }
  flap() {
    this.burst(0.04, { vol: 0.05, freq: 900, q: 1.5 });
  }
  flyAway() {
    this.melody([[76, 0.1], [75, 0.1], [74, 0.1], [71, 0.28]], { vol: 0.13 });
  }
  laugh() {
    for (let i = 0; i < 5; i++) this.tone(980 - i * 40, 0.08, { type: "triangle", vol: 0.28, at: i * 0.14, slide: 560 });
  }
  cheer() {
    this.melody([[72, 0.08], [76, 0.08], [79, 0.08], [84, 0.22]], { vol: 0.15 });
  }
  roundStart() {
    this.melody([[67, 0.12], [72, 0.12], [76, 0.12], [79, 0.12], [76, 0.12], [79, 0.12], [84, 0.36]], { vol: 0.15 });
    this.melody([[48, 0.24], [55, 0.24], [53, 0.24], [48, 0.48]], { type: "triangle", vol: 0.3 });
  }
  roundClear() {
    this.melody([[72, 0.09], [74, 0.09], [76, 0.09], [79, 0.09], [76, 0.09], [79, 0.09], [84, 0.09], [88, 0.4]], { vol: 0.15 });
    this.melody([[48, 0.36], [55, 0.36], [60, 0.48]], { type: "triangle", vol: 0.3 });
  }
  perfect() {
    this.melody([[84, 0.07], [88, 0.07], [91, 0.07], [96, 0.3]], { vol: 0.12, at: 0.9 });
  }
  gameOver() {
    this.melody([[67, 0.26], [64, 0.26], [60, 0.26], [55, 0.6]], { vol: 0.15 });
    this.melody([[43, 0.52], [36, 0.8]], { type: "triangle", vol: 0.3 });
  }
  start() {
    this.tone(880, 0.06, { vol: 0.15 });
    this.tone(1320, 0.1, { vol: 0.15, at: 0.07 });
  }

  close() {
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.master = null;
  }
}
