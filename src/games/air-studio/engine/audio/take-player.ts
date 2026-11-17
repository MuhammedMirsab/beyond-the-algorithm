import { engine } from "./engine";
import type { TakeResult } from "./recorder";

/**
 * Plays the visitor's one take: once to listen, or on a loop to play along
 * with. A take recorded to the beat loops on whole bars (trimmed or padded
 * with silence to the nearest bar), so the loop stays in time.
 */
export class TakePlayer {
  private buffers: { ctx: BaseAudioContext; once: AudioBuffer; loop: AudioBuffer } | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private startedAt = 0;
  private loopEnd = 0;
  mode: "off" | "listen" | "loop" = "off";
  /** Called when a single play-through ends by itself. */
  onEnded: (() => void) | null = null;

  constructor(
    private take: TakeResult,
    /** Seconds per bar when the take was recorded to a beat, else null. */
    private barLength: number | null,
  ) {}

  get duration() {
    return this.take.duration;
  }

  /** The whole bars the loop spans when the take was recorded to a beat, else null. */
  get loopBars(): number | null {
    if (!this.barLength) return null;
    return Math.max(1, Math.round(this.take.duration / this.barLength));
  }

  /** Loop length in seconds: whole bars when there was a beat, else the whole take. */
  get loopLength() {
    const bars = this.loopBars;
    return bars && this.barLength ? bars * this.barLength : this.take.duration;
  }

  private buffersFor(ctx: BaseAudioContext) {
    if (this.buffers && this.buffers.ctx === ctx) return this.buffers;
    const make = (frames: number) => {
      const b = ctx.createBuffer(2, Math.max(1, frames), this.take.sampleRate);
      this.take.channels.forEach((data, ch) => {
        const n = Math.min(data.length, b.length);
        if (n > 0) b.copyToChannel(n === data.length ? data : data.subarray(0, n), ch);
      });
      return b;
    };
    const once = make(this.take.channels[0].length);
    const loop = make(Math.round(this.loopLength * this.take.sampleRate));
    this.buffers = { ctx, once, loop };
    return this.buffers;
  }

  async play(mode: "listen" | "loop") {
    const ctx = await engine.ensure();
    this.stop();
    const { once, loop } = this.buffersFor(ctx);
    const src = ctx.createBufferSource();
    src.buffer = mode === "loop" ? loop : once;
    src.loop = mode === "loop";
    this.loopEnd = mode === "loop" ? loop.duration : once.duration;
    const g = ctx.createGain();
    src.connect(g).connect(engine.playbackBus);
    const when = ctx.currentTime + 0.05;
    src.start(when);
    src.onended = () => {
      if (this.source !== src) return;
      this.source = null;
      this.gain = null;
      this.mode = "off";
      this.onEnded?.();
    };
    this.source = src;
    this.gain = g;
    this.startedAt = when;
    this.mode = mode;
  }

  /** Seconds into the take (wrapping on a loop), or null when stopped. */
  position(): number | null {
    if (!this.source) return null;
    const t = Math.max(0, engine.now - this.startedAt);
    return this.mode === "loop" && this.loopEnd > 0 ? t % this.loopEnd : Math.min(t, this.take.duration);
  }

  stop() {
    const src = this.source;
    const g = this.gain;
    this.source = null;
    this.gain = null;
    this.mode = "off";
    if (!src) return;
    const ctx = engine.ctx;
    try {
      if (ctx && g) {
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.015);
        src.stop(ctx.currentTime + 0.08);
      } else {
        src.stop();
      }
    } catch {
      /* already stopped, or the context closed */
    }
  }
}
