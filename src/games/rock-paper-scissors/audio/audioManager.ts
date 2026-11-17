/**
 * Short synthesized beeps, copied from the original app's audio manager. Every
 * tone checks the arcade-wide sound switch (`isSoundOn`), and turning sound off
 * mutes anything still ringing. Dropped: the background hum and the volume
 * settings. Added: `playLock`, the click when the AI seals its move.
 *
 * Browser only: create it in an event handler, call `unlock()` from a user
 * gesture (browsers block audio before one), `dispose()` on unmount.
 */
import { isSoundOn, subscribeSound } from "@/lib/sound";

const MASTER_VOLUME = 0.75;
const SFX_VOLUME = 0.85;

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private unsubscribe: (() => void) | null = null;
  private soundEnabled = true;

  public unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }

    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
    this.sfxGain.gain.value = SFX_VOLUME;

    this.soundEnabled = isSoundOn();
    this.applyVolume();
    this.unsubscribe = subscribeSound(() => {
      this.soundEnabled = isSoundOn();
      this.applyVolume();
    });
  }

  private applyVolume(): void {
    if (!this.ctx || !this.masterGain) return;
    this.masterGain.gain.setTargetAtTime(this.soundEnabled ? MASTER_VOLUME : 0, this.ctx.currentTime, 0.03);
  }

  private playTone(
    freq: number,
    durationSec: number,
    type: OscillatorType = "triangle",
    gainLevel = 0.25,
    delaySec = 0,
    slideToFreq?: number,
  ): void {
    if (!this.ctx || !this.sfxGain || !this.soundEnabled || !isSoundOn()) return;
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    const start = this.ctx.currentTime + delaySec;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideToFreq) {
      osc.frequency.exponentialRampToValueAtTime(slideToFreq, start + durationSec);
    }

    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(gainLevel, start + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);

    osc.connect(env);
    env.connect(this.sfxGain);
    osc.start(start);
    osc.stop(start + durationSec + 0.02);
  }

  /** The AI sealed its move: a low two-step click. */
  public playLock(): void {
    this.playTone(196, 0.06, "square", 0.08, 0);
    this.playTone(147, 0.08, "square", 0.08, 0.05);
  }

  public playCountdownTick(step: 3 | 2 | 1 | "SHOOT"): void {
    if (step === "SHOOT") {
      this.playTone(659.25, 0.14, "triangle", 0.34, 0);
      this.playTone(880, 0.22, "sine", 0.28, 0.05);
    } else {
      const pitch = step === 3 ? 330 : step === 2 ? 392 : 440;
      this.playTone(pitch, 0.11, "triangle", 0.22);
    }
  }

  public playGestureLocked(): void {
    this.playTone(523.25, 0.07, "sine", 0.2, 0);
    this.playTone(783.99, 0.1, "sine", 0.18, 0.05);
  }

  public playReveal(): void {
    this.playTone(220, 0.09, "sawtooth", 0.12, 0, 440);
  }

  public playVictory(): void {
    this.playTone(523.25, 0.14, "triangle", 0.26, 0);
    this.playTone(659.25, 0.14, "triangle", 0.26, 0.09);
    this.playTone(783.99, 0.28, "triangle", 0.3, 0.18);
  }

  public playDefeat(): void {
    this.playTone(293.66, 0.16, "triangle", 0.24, 0);
    this.playTone(220, 0.3, "sawtooth", 0.14, 0.12);
  }

  public playDraw(): void {
    this.playTone(392, 0.12, "sine", 0.18, 0);
    this.playTone(392, 0.15, "sine", 0.14, 0.11);
  }

  public playStreakCelebration(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => this.playTone(n, 0.15, "triangle", 0.22, idx * 0.07));
  }

  /** End of a match the visitor won (was the tournament fanfare). */
  public playMatchWon(): void {
    const chord = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    chord.forEach((n, idx) => this.playTone(n, 0.32, "triangle", 0.24, idx * 0.08));
  }

  /** A miss at "Shoot": one soft low note. */
  public playMiss(): void {
    this.playTone(246.94, 0.18, "sine", 0.16, 0);
  }

  public dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.masterGain = null;
    this.sfxGain = null;
  }
}
