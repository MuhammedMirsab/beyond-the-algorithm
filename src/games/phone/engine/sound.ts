"use client";

import { isSoundOn } from "@/lib/sound";

/**
 * The original exhibit's Web Audio synthesiser (utils/audio.js), typed. Every
 * sound checks the arcade-wide switch first, the context is only created on
 * the first sound (always after a tap), and `suspend` silences it when the
 * switch goes off or the game unmounts.
 */

type AudioContextCtor = typeof AudioContext;

export function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { webkitAudioContext?: AudioContextCtor };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

class SoundEffects {
  private ctx: AudioContext | null = null;

  private ready(): AudioContext | null {
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
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  private tone(type: OscillatorType, from: number, to: number | null, gain: number, start: number, length: number) {
    const ctx = this.ready();
    if (!ctx) return;
    try {
      const t0 = ctx.currentTime + start;
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t0);
      if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + length);
      amp.gain.setValueAtTime(gain, t0);
      amp.gain.exponentialRampToValueAtTime(0.001, t0 + length);
      osc.connect(amp);
      amp.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + length);
    } catch {
      // A closed or interrupted context: stay silent.
    }
  }

  /** A short rising blip: a tap on the glass. */
  tap() {
    this.tone("sine", 440, 880, 0.12, 0, 0.08);
  }

  /** C, E, G: a sensor answered, or a right answer. */
  success() {
    [523.25, 659.25, 783.99].forEach((f, i) => this.tone("triangle", f, null, 0.15, i * 0.08, 0.25));
  }

  /** One high note: a location fix, a message sent. */
  ping() {
    this.tone("sine", 1046.5, null, 0.1, 0, 0.3);
  }

  /** A low blip: a wrong answer. */
  beep() {
    this.tone("sine", 320, null, 0.08, 0, 0.1);
  }

  suspend() {
    if (this.ctx && this.ctx.state === "running") void this.ctx.suspend().catch(() => {});
  }
}

export const sound = new SoundEffects();
