import { REARM_FRACTION } from "../engine/tracking/gestures";

/**
 * The strike detector's two states over time, for "How it works": ready (a
 * hit can count) and waiting (after a hit, until the hand slows below the
 * re-arm speed). Speeds in hand lengths per second, times in ms. The same
 * rule as StrikeDetector, so the picture matches what the game did.
 */

export interface SpeedSample {
  t: number;
  v: number;
}

export interface StrikeSegment {
  from: number;
  to: number;
  state: "ready" | "waiting";
}

/** The detector's shortest gap between two hits (StrikeDetector's default). */
const MIN_GAP_MS = 70;

/** Ready and waiting stretches, given the hits the detector fired. */
export function strikeSegments(samples: SpeedSample[], hits: { t: number }[], rearm: number): StrikeSegment[] {
  if (!samples.length) return [];
  const out: StrikeSegment[] = [];
  const queue = [...hits].sort((a, b) => a.t - b.t);
  let state: StrikeSegment["state"] = "ready";
  let from = samples[0].t;
  let hitAt = -Infinity;
  for (const s of samples) {
    while (queue.length && queue[0].t <= s.t) {
      const h = queue.shift();
      if (!h) break;
      if (state === "ready") {
        out.push({ from, to: h.t, state });
        state = "waiting";
        from = h.t;
      }
      hitAt = h.t;
    }
    if (state === "waiting" && s.v < rearm && s.t - hitAt > MIN_GAP_MS) {
      out.push({ from, to: s.t, state });
      state = "ready";
      from = s.t;
    }
  }
  out.push({ from, to: samples[samples.length - 1].t, state });
  return out.filter((seg) => seg.to > seg.from);
}

/** Where a detector at `threshold` fires on these samples (for an example trace with no real hits). */
export function crossings(samples: SpeedSample[], threshold: number, rearm = threshold * REARM_FRACTION): SpeedSample[] {
  const out: SpeedSample[] = [];
  let armed = true;
  let last = -Infinity;
  for (const s of samples) {
    if (!armed) {
      if (s.v < rearm && s.t - last > MIN_GAP_MS) armed = true;
      continue;
    }
    if (s.v > threshold && s.t - last > MIN_GAP_MS) {
      out.push(s);
      armed = false;
      last = s.t;
    }
  }
  return out;
}

/**
 * A made-up hand for the reveal before a real hit: resting (a little
 * webcam wobble), a strike, slowing down, a second strike. Labelled as an
 * example wherever it is shown.
 */
export function exampleSpeeds(threshold: number): SpeedSample[] {
  const out: SpeedSample[] = [];
  let seed = 11;
  const noise = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  const strike = (t: number, at: number, peak: number) => {
    const d = t - at;
    if (d < 0 || d > 420) return 0;
    if (d < 110) return peak * (d / 110);
    return peak * Math.exp(-(d - 110) / 70);
  };
  for (let t = 0; t <= 3000; t += 33) {
    const rest = 1.4 + noise() * 2.4;
    const v = rest + strike(t, 650, threshold * 1.9) + strike(t, 1850, threshold * 1.45);
    out.push({ t, v: Math.round(v * 10) / 10 });
  }
  return out;
}
