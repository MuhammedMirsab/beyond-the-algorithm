import { clamp, mean, type Guess } from "./math";

/**
 * Microphone maths. An AnalyserNode's getByteTimeDomainData gives the wave as
 * bytes centred on 128 (the original drew these straight onto a canvas). Here
 * they also become a loudness level and a guess about the room.
 */

/** Root-mean-square of byte samples, 0 (silence) to 1 (full scale). */
export function rmsFromBytes(samples: ArrayLike<number>): number {
  const n = samples.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = (samples[i] - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / n));
}

/** Decibels relative to full scale. Silence is clamped to -100. */
export function rmsToDb(rms: number): number {
  if (rms <= 0) return -100;
  return Math.max(-100, 20 * Math.log10(rms));
}

/** Everything quieter than this counts as 0 on the meter. */
export const FLOOR_DB = -60;

/** Loudness on a 0 to 100 scale: -60 dBFS is 0, full scale is 100. */
export function levelPercent(rms: number, floorDb = FLOOR_DB): number {
  const db = rmsToDb(rms);
  return Math.round(clamp(((db - floorDb) / -floorDb) * 100, 0, 100));
}

/** Levels at or below this count as a pause. */
export const QUIET_LEVEL = 22;

/**
 * Reads a few seconds of levels (0 to 100): quiet, voices with pauses, or loud
 * sound that never stops. That last one is what a crowded hall sounds like.
 */
export function soundGuess(history: readonly number[]): Guess {
  if (history.length < 6) {
    return { label: "Listening", because: "It needs a couple of seconds of sound first." };
  }
  const average = mean(history);
  const quietShare = history.filter((l) => l <= QUIET_LEVEL).length / history.length;
  const loudest = Math.max(...history);
  if (loudest <= QUIET_LEVEL) {
    return { label: "A quiet room", because: "Almost no sound for the last few seconds." };
  }
  if (average >= 45 && quietShare < 0.1) {
    return { label: "Somewhere crowded", because: "Loud sound with no pauses at all, like a busy hall." };
  }
  if (quietShare >= 0.25) {
    return { label: "Someone talking", because: "Bursts of sound with pauses between them, the rhythm of speech." };
  }
  return { label: "A noisy room", because: "Steady sound, but not loud enough for a crowd." };
}

/**
 * An SVG path through the wave, as the original drew it on a canvas: each
 * byte's distance from 128 becomes a height. Flat line when there's no data.
 */
export function wavePath(samples: ArrayLike<number> | null, width: number, height: number, points = 128): string {
  const mid = height / 2;
  if (!samples || samples.length === 0) return `M0 ${mid} L${width} ${mid}`;
  const step = samples.length / points;
  let d = "";
  for (let i = 0; i < points; i++) {
    const v = samples[Math.min(samples.length - 1, Math.floor(i * step))];
    const x = (i / (points - 1)) * width;
    const y = clamp(mid + ((v - 128) / 128) * mid, 0, height);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return d;
}

export type SimSound = "quiet" | "talking" | "crowd";

/**
 * A made-up wave for the simulation, as analyser-style bytes. Deterministic
 * for a given time, so the level maths above can be tested on it.
 */
export function synthBytes(kind: SimSound, seconds: number, length = 256, sampleRate = 8000): Uint8Array {
  const out = new Uint8Array(length);
  // Talking comes in syllables: about 4 bursts a second with silent gaps.
  const syllable = Math.max(0, Math.sin(2 * Math.PI * 4 * seconds));
  const amplitude = kind === "quiet" ? 0.004 : kind === "talking" ? (syllable > 0.35 ? 0.35 * syllable : 0.003) : 0.22;
  for (let i = 0; i < length; i++) {
    const t = seconds + i / sampleRate;
    let v: number;
    if (kind === "crowd") {
      // Many voices at once: several tones that never line up.
      v =
        0.45 * Math.sin(2 * Math.PI * 180 * t) +
        0.3 * Math.sin(2 * Math.PI * 263 * t + 1.3) +
        0.25 * Math.sin(2 * Math.PI * 377 * t + 2.1) +
        0.2 * Math.sin(2 * Math.PI * 521 * t + 0.4);
    } else {
      v = Math.sin(2 * Math.PI * 160 * t) + 0.4 * Math.sin(2 * Math.PI * 320 * t + 0.8);
    }
    out[i] = Math.round(clamp(128 + v * amplitude * 128, 0, 255));
  }
  return out;
}
