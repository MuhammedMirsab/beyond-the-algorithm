import { clamp, mean, type Guess } from "./math";

/**
 * Touch maths from the original TouchExperiment: a pointer in page
 * coordinates becomes a point on the glass, and the last 8 taps are kept.
 * The rhythm and side of the taps feed a guess about who is tapping.
 */

export const MAX_TAPS = 8;
/** Gaps longer than this are a new burst of tapping, not part of the rhythm. */
export const RHYTHM_BREAK_MS = 1500;

export interface TapPoint {
  id: number;
  x: number;
  y: number;
  /** Timestamp in ms. */
  t: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Page coordinates to coordinates on the glass. `scale` converts CSS pixels
 * to the phone's points when it is drawn smaller than real size.
 */
export function localPoint(clientX: number, clientY: number, rect: Rect, scale = 1) {
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const inside = x >= 0 && x <= rect.width && y >= 0 && y <= rect.height;
  return { x: Math.round(x / scale), y: Math.round(y / scale), inside };
}

export function pushTap<T extends TapPoint>(taps: readonly T[], tap: T, max = MAX_TAPS): T[] {
  return [...taps.slice(-(max - 1)), tap];
}

/** Average time between taps in the latest burst, in ms. Null with fewer than 2 taps. */
export function tapRhythm(taps: readonly TapPoint[]): number | null {
  const gaps: number[] = [];
  for (let i = taps.length - 1; i > 0; i--) {
    const gap = taps[i].t - taps[i - 1].t;
    if (gap > RHYTHM_BREAK_MS) break;
    gaps.push(gap);
  }
  return gaps.length ? Math.round(mean(gaps)) : null;
}

export type Side = "left" | "middle" | "right";

/** Which side of the glass most taps land on. `width` is the glass width in the same units. */
export function tapSide(taps: readonly TapPoint[], width: number): Side | null {
  if (taps.length < 3 || width <= 0) return null;
  const centre = mean(taps.map((t) => clamp(t.x / width, 0, 1)));
  if (centre < 0.42) return "left";
  if (centre > 0.58) return "right";
  return "middle";
}

export function touchGuess(taps: readonly TapPoint[], width: number, maxFingers: number): Guess {
  if (maxFingers >= 2) {
    return {
      label: `${maxFingers} fingers at once`,
      because: "Each finger changes the charge in a different spot, so the glass feels them all.",
    };
  }
  const side = tapSide(taps, width);
  if (side === "left") return { label: "Probably your left thumb", because: "Most of your taps land on the left side." };
  if (side === "right") return { label: "Probably your right thumb", because: "Most of your taps land on the right side." };
  if (side === "middle") return { label: "A finger, or both thumbs", because: "Your taps land in the middle, not on one side." };
  return { label: "Keep tapping", because: "It needs at least 3 taps to spot a pattern." };
}
