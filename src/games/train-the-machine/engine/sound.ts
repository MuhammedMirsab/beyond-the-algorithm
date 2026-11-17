/**
 * Short synthesised sounds (no audio files), ported from the original
 * utils/sound.js. Every sound checks the arcade-wide switch first, and the
 * audio context is suspended while the switch is off.
 */
import { isSoundOn, subscribeSound } from "@/lib/sound";

type AudioContextClass = typeof AudioContext;

export class Sounds {
  private ctx: AudioContext | null = null;
  private unsubscribe: (() => void) | null = null;

  /** Camera shutter: one example taken. */
  shutter() {
    this.tone({ type: "triangle", from: 600, to: 180, gain: 0.12, duration: 0.09 });
  }

  /** Countdown tick and the start of a recording. */
  tick(freq = 520) {
    this.tone({ type: "sine", from: freq, to: freq * 1.3, gain: 0.06, duration: 0.09 });
  }

  /** A low blip when an example is not kept. */
  miss() {
    this.tone({ type: "sine", from: 220, to: 160, gain: 0.07, duration: 0.14 });
  }

  /** Rising chord when the model is trained. */
  success() {
    const ctx = this.context();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const start = now + i * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.07, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.33);
    });
  }

  /** Close the audio context (unmount). */
  dispose() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    const ctx = this.ctx;
    this.ctx = null;
    ctx?.close().catch(() => {});
  }

  private tone({ type, from, to, gain: level, duration }: { type: OscillatorType; from: number; to: number; gain: number; duration: number }) {
    const ctx = this.context();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + duration * 0.9);
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  /** The audio context, created on first use (always inside a click or key press). Null when sound is off. */
  private context(): AudioContext | null {
    if (typeof window === "undefined" || !isSoundOn()) return null;
    if (!this.ctx) {
      const Ctor: AudioContextClass | undefined =
        window.AudioContext ?? (window as Window & { webkitAudioContext?: AudioContextClass }).webkitAudioContext;
      if (!Ctor) return null;
      try {
        this.ctx = new Ctor();
      } catch {
        return null;
      }
      this.unsubscribe = subscribeSound(() => {
        if (!isSoundOn()) this.ctx?.suspend().catch(() => {});
      });
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  }
}
