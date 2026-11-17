import { isSoundOn, subscribeSound } from "@/lib/sound";
import { settings, type Settings } from "../state/settings";
import { MusicPlayer, type MusicTheme } from "./music";

export type Sfx =
  | "click"
  | "jump"
  | "land"
  | "collect"
  | "checkpoint"
  | "hurt"
  | "bounce"
  | "boost"
  | "levelComplete"
  | "gameOver"
  | "victory"
  | "tick"
  | "go"
  | "step"
  | "calibrated"
  | "pause";

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * Every sound in Face Control is synthesised live with the Web Audio API,
 * no audio files to download. The AudioContext is only created after the
 * first click or key press, which keeps browsers' autoplay rules happy.
 *
 * The arcade-wide sound switch (`isSoundOn`) is the master: when it is off,
 * nothing plays and the music stops.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private music: MusicPlayer | null = null;
  private desiredTheme: MusicTheme | null = null;
  private ducked = false;
  private cfg: Settings = settings.get();
  private soundOn = isSoundOn();
  private lastPlayed = new Map<Sfx, number>();
  private armed = false;
  private unsubs: (() => void)[] = [];

  private readonly unlock = () => {
    if (this.ensure()) this.disarmUnlock();
  };

  /** Starts listening for the first gesture and for settings / sound switch changes. */
  arm() {
    // Also re-arms after release() suspended the context: the next gesture resumes it.
    if ((!this.ctx || this.ctx.state !== "running") && !this.armed) {
      this.armed = true;
      window.addEventListener("pointerdown", this.unlock, true);
      window.addEventListener("keydown", this.unlock, true);
    }
    if (this.unsubs.length === 0) {
      this.cfg = settings.get();
      this.soundOn = isSoundOn();
      this.unsubs.push(
        settings.subscribe((s) => {
          this.cfg = s;
          this.applyLevels();
        }),
        subscribeSound(() => {
          this.soundOn = isSoundOn();
          this.applyLevels();
        }),
      );
      this.applyLevels(true);
    }
  }

  /** Called when the game unmounts: silence, stop listening, let the audio thread sleep. */
  release() {
    this.disarmUnlock();
    this.unsubs.forEach((fn) => fn());
    this.unsubs = [];
    this.desiredTheme = null;
    this.music?.stop();
    this.ducked = false;
    if (this.ctx && this.ctx.state === "running") void this.ctx.suspend().catch(() => {});
  }

  private disarmUnlock() {
    if (!this.armed) return;
    this.armed = false;
    window.removeEventListener("pointerdown", this.unlock, true);
    window.removeEventListener("keydown", this.unlock, true);
  }

  get ready() {
    return this.ctx !== null && this.ctx.state === "running";
  }

  /** Creates/resumes the context. Must run inside a user gesture the first time. */
  ensure(): boolean {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return false;
        const ctx = new Ctor({ latencyHint: "interactive" });
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 12;
        comp.ratio.value = 4;
        comp.attack.value = 0.004;
        comp.release.value = 0.2;
        comp.connect(ctx.destination);
        this.master = ctx.createGain();
        this.master.connect(comp);
        this.sfxBus = ctx.createGain();
        this.sfxBus.connect(this.master);
        this.musicBus = ctx.createGain();
        this.musicBus.connect(this.master);
        const len = ctx.sampleRate;
        this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this.ctx = ctx;
        this.music = new MusicPlayer(ctx, this.musicBus, this.noiseBuffer);
        this.applyLevels(true);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
      if (this.desiredTheme && this.musicAllowed()) this.music?.play(this.desiredTheme);
      return true;
    } catch (err) {
      console.warn("[face-control] audio unavailable", err);
      return false;
    }
  }

  private musicAllowed() {
    return this.soundOn && this.cfg.music;
  }

  private applyLevels(immediate = false) {
    if (!this.ctx || !this.master || !this.sfxBus || !this.musicBus) return;
    const now = this.ctx.currentTime;
    const ramp = immediate ? 0.001 : 0.12;
    const vol = this.soundOn ? this.cfg.volume : 0;
    this.master.gain.setTargetAtTime(vol * 0.9, now, ramp);
    this.sfxBus.gain.setTargetAtTime(this.cfg.sfx ? 1 : 0, now, ramp);
    this.musicBus.gain.setTargetAtTime(this.cfg.music ? (this.ducked ? 0.32 : 1) : 0, now, ramp * 2);
    if (this.musicAllowed()) {
      if (this.desiredTheme && this.music && this.music.theme !== this.desiredTheme) this.music.play(this.desiredTheme);
    } else {
      this.music?.stop();
    }
  }

  setMusic(theme: MusicTheme | null) {
    this.desiredTheme = theme;
    if (!this.music) return;
    if (!theme) this.music.stop();
    else if (this.musicAllowed() && this.ready) this.music.play(theme);
  }

  /** Lowers the music while the game is paused or a menu is open. */
  duck(on: boolean) {
    if (this.ducked === on) return;
    this.ducked = on;
    this.applyLevels();
  }

  play(name: Sfx, opts: { pitch?: number; gain?: number } = {}) {
    if (!this.soundOn || !this.cfg.sfx) return;
    if (!this.ctx || !this.sfxBus) return;
    if (this.ctx.state !== "running") return;
    // Guard against machine-gun repeats of the same sound in one frame.
    const now = this.ctx.currentTime;
    const prev = this.lastPlayed.get(name) ?? -1;
    if (now - prev < 0.03) return;
    this.lastPlayed.set(name, now);
    const t = now + 0.005;
    const p = opts.pitch ?? 1;
    const g = opts.gain ?? 1;
    switch (name) {
      case "click":
        this.tone("sine", 1150, 820, 0.06, 0.12 * g, t, 0.002);
        this.noise(0.025, "highpass", 4000, 4000, 0.7, 0.03 * g, t);
        break;
      case "step":
        this.bell(midi(84) * p, 0.35, 0.07 * g, t);
        break;
      case "calibrated":
        [72, 76, 79, 84].forEach((n, i) => this.bell(midi(n), 0.6, 0.07 * g, t + i * 0.07));
        break;
      case "jump":
        this.tone("triangle", 260 * p, 600 * p, 0.14, 0.16 * g, t, 0.004);
        this.tone("sine", 520 * p, 1100 * p, 0.09, 0.05 * g, t, 0.004);
        this.noise(0.12, "bandpass", 900, 2600, 1.2, 0.035 * g, t);
        break;
      case "land":
        this.tone("sine", 150, 55, 0.11, 0.2 * g, t, 0.002);
        this.noise(0.06, "lowpass", 900, 300, 0.7, 0.05 * g, t);
        break;
      case "collect": {
        const base = 79 + Math.round((p - 1) * 12);
        this.bell(midi(base), 0.5, 0.1 * g, t);
        this.bell(midi(base + 7), 0.6, 0.08 * g, t + 0.065);
        break;
      }
      case "checkpoint":
        [67, 71, 74, 79].forEach((n, i) => this.bell(midi(n), 0.5, 0.075 * g, t + i * 0.06));
        break;
      case "hurt":
        this.tone("sawtooth", 260, 48, 0.42, 0.14 * g, t, 0.003, 1400);
        this.tone("sine", 110, 40, 0.3, 0.2 * g, t, 0.002);
        this.noise(0.25, "lowpass", 2400, 200, 0.8, 0.09 * g, t);
        break;
      case "bounce":
        this.tone("sine", 180, 820, 0.26, 0.17 * g, t, 0.004);
        this.tone("triangle", 360, 1500, 0.18, 0.05 * g, t, 0.004);
        break;
      case "boost":
        this.noise(0.4, "bandpass", 500, 4200, 2.2, 0.08 * g, t);
        this.tone("sine", 300, 900, 0.3, 0.06 * g, t, 0.01);
        break;
      case "tick":
        this.tone("sine", 880, 880, 0.08, 0.1 * g, t, 0.002);
        break;
      case "go":
        this.tone("sine", 1320, 1320, 0.2, 0.11 * g, t, 0.002);
        this.bell(midi(88), 0.4, 0.05 * g, t);
        break;
      case "pause":
        this.tone("sine", 660, 440, 0.12, 0.08 * g, t, 0.003);
        break;
      case "levelComplete":
        [72, 76, 79, 83, 84, 88].forEach((n, i) => this.bell(midi(n), 0.9, 0.08 * g, t + i * 0.085));
        [48, 55, 64].forEach((n) => this.pad(midi(n), 1.6, 0.05 * g, t));
        break;
      case "gameOver":
        [67, 63, 60, 55].forEach((n, i) => this.tone("triangle", midi(n), midi(n) * 0.995, 0.5, 0.09 * g, t + i * 0.16, 0.01, 1800));
        break;
      case "victory":
        [72, 76, 79, 84, 79, 84, 88, 91].forEach((n, i) => this.bell(midi(n), 1, 0.08 * g, t + i * 0.1));
        [48, 52, 55, 60].forEach((n) => this.pad(midi(n), 2.6, 0.05 * g, t));
        break;
    }
  }

  // ---- synthesis primitives -------------------------------------------

  private tone(
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    gain: number,
    t: number,
    attack = 0.005,
    lowpass?: number,
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, f0), t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = osc;
    if (lowpass) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = lowpass;
      osc.connect(lp);
      node = lp;
    }
    node.connect(env);
    env.connect(this.sfxBus!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, gain: number, t: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(env).connect(this.sfxBus!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  /** Soft bell: a sine plus an inharmonic partial that dies away quickly. */
  private bell(f: number, dur: number, gain: number, t: number) {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(this.sfxBus!);
    const partials: [number, number][] = [
      [1, 1],
      [2.756, 0.28],
      [5.404, 0.08],
    ];
    for (const [ratio, amp] of partials) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f * ratio;
      g.gain.setValueAtTime(amp, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur / (ratio > 1 ? 2.5 : 1));
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
  }

  private pad(f: number, dur: number, gain: number, t: number) {
    const ctx = this.ctx!;
    const out = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(gain, t + 0.15);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(out).connect(this.sfxBus!);
    for (const detune of [-7, 7]) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = f;
      osc.detune.value = detune;
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  }
}

let engine: AudioEngine | null = null;

/** The shared engine, created on first use in the browser. Null during server rendering. */
function getEngine(): AudioEngine | null {
  if (typeof window === "undefined") return null;
  if (!engine) engine = new AudioEngine();
  return engine;
}

/**
 * The game's sound API. Every call is safe anywhere: on the server, or before
 * the engine exists, it does nothing.
 */
export const audio = {
  arm: () => getEngine()?.arm(),
  release: () => engine?.release(),
  ensure: () => getEngine()?.ensure() ?? false,
  play: (name: Sfx, opts?: { pitch?: number; gain?: number }) => engine?.play(name, opts),
  setMusic: (theme: MusicTheme | null) => getEngine()?.setMusic(theme),
  duck: (on: boolean) => engine?.duck(on),
};

export type { MusicTheme };
