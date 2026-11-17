import { isSoundOn, subscribeSound } from "@/lib/sound";

/**
 * Synthesised Web Audio sounds, copied from the original src/utils/audio.ts
 * with the same notes and timings. No files to load, so they play instantly and offline.
 *
 * Changes: nothing touches the browser until a sound plays (the original read
 * localStorage in its constructor), every sound checks the arcade-wide switch
 * with isSoundOn(), and attach() wires the switch and cleanup to a component.
 */

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const legacy = (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  return window.AudioContext ?? legacy ?? null;
}

/** One oscillator: a pitch glide and a fade, all times in seconds from now. */
interface Sweep {
  type: OscillatorType;
  from: number;
  /** Pitch points after the start: [hz, at, curve]. */
  glide: [number, number, "linear" | "exponential"][];
  gain: number;
  fadeAt: number;
  stopAt: number;
}

/** One chord or melody note with a soft attack. */
interface Note {
  freq: number;
  start: number;
  dur: number;
  stopAfter: number;
  type: OscillatorType;
  peak: number;
}

export class SoundSynthesizer {
  private ctx: AudioContext | null = null;

  /** The context, created on first use (inside a click, so browsers allow it). Null when sound is off. */
  private context(): AudioContext | null {
    if (!isSoundOn()) return null;
    if (!this.ctx) {
      const Ctor = audioContextCtor();
      if (!Ctor) return null;
      try {
        this.ctx = new Ctor();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  /** Starts following the sound switch. Returns the cleanup for unmount. */
  attach(): () => void {
    const unsubscribe = subscribeSound(() => {
      // Switched off mid-sound: cut it now rather than letting it ring out.
      if (!isSoundOn() && this.ctx && this.ctx.state === "running") this.ctx.suspend().catch(() => {});
    });
    return () => {
      unsubscribe();
      const ctx = this.ctx;
      this.ctx = null;
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
    };
  }

  private sweep(s: Sweep) {
    const ctx = this.context();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = s.type;
      osc.frequency.setValueAtTime(s.from, now);
      for (const [hz, at, curve] of s.glide) {
        if (curve === "linear") osc.frequency.linearRampToValueAtTime(hz, now + at);
        else osc.frequency.exponentialRampToValueAtTime(hz, now + at);
      }
      gain.gain.setValueAtTime(s.gain, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + s.fadeAt);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + s.stopAt);
    } catch {
      // A failed sound never breaks the game.
    }
  }

  private notes(notes: Note[]) {
    const ctx = this.context();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      for (const n of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + n.start;
        osc.type = n.type;
        osc.frequency.setValueAtTime(n.freq, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(n.peak, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + n.dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + n.stopAfter);
      }
    } catch {
      // ignore
    }
  }

  /** Snappy pop for buttons. */
  playPop() {
    this.sweep({ type: "sine", from: 440, glide: [[880, 0.08, "exponential"]], gain: 0.18, fadeAt: 0.09, stopAt: 0.1 });
  }

  /** Soft tick, e.g. opening the viewer. */
  playSelect() {
    this.sweep({ type: "triangle", from: 587.33, glide: [[783.99, 0.06, "exponential"]], gain: 0.15, fadeAt: 0.07, stopAt: 0.08 });
  }

  /** Rising C-E-G when the visitor finds the AI photo. */
  playCorrect() {
    this.notes(
      [523.25, 659.25, 783.99].map((freq, i) => ({ freq, start: i * 0.08, dur: 0.35, stopAfter: 0.36, type: "sine" as const, peak: 0.22 })),
    );
  }

  /** Gentle falling tone when it fooled them or time ran out. Encouraging, not harsh. */
  playIncorrect() {
    this.sweep({ type: "sine", from: 329.63, glide: [[261.63, 0.25, "linear"]], gain: 0.18, fadeAt: 0.26, stopAt: 0.27 });
  }

  /** Four-note fanfare for the end of a game. */
  playFanfare() {
    this.notes(
      [
        { freq: 523.25, start: 0, dur: 0.12 },
        { freq: 659.25, start: 0.12, dur: 0.12 },
        { freq: 783.99, start: 0.24, dur: 0.15 },
        { freq: 1046.5, start: 0.38, dur: 0.45 },
      ].map((n) => ({ ...n, stopAfter: n.dur + 0.05, type: "triangle" as const, peak: 0.24 })),
    );
  }

  /** Whoosh between rounds. */
  playWhoosh() {
    this.sweep({
      type: "sine",
      from: 300,
      glide: [
        [600, 0.08, "exponential"],
        [150, 0.18, "exponential"],
      ],
      gain: 0.12,
      fadeAt: 0.2,
      stopAt: 0.22,
    });
  }
}
