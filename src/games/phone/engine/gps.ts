import { clamp, type Guess } from "./math";
import { DAY, DAY_START, PLACE_GUESSES, PLACES, ROUTES, type PlaceGuess, type PlaceId, type Point } from "../data/places";

/**
 * Location maths. The live part only ever uses the accuracy circle the
 * browser reports (coordinates are never shown or kept). The simulated day
 * moves a phone through a made-up town.
 */

export type Scale = "building" | "street" | "area" | "city";

export interface ScaleStep {
  id: Scale;
  label: string;
  /** Largest accuracy, in metres, that still pins you to this. */
  within: number;
}

/** What an accuracy circle is small enough to pin down, finest first. */
export const SCALES: ScaleStep[] = [
  { id: "building", label: "Your building", within: 30 },
  { id: "street", label: "Your street", within: 150 },
  { id: "area", label: "Your neighbourhood", within: 1500 },
  { id: "city", label: "Your city", within: Infinity },
];

export function scaleFromAccuracy(metres: number): Scale {
  return (SCALES.find((s) => metres <= s.within) ?? SCALES[SCALES.length - 1]).id;
}

export function formatDistance(metres: number): string {
  if (!Number.isFinite(metres)) return "unknown";
  if (metres < 1000) return `${Math.max(1, Math.round(metres))} m`;
  const tenths = Math.round(metres / 100);
  return tenths < 100 ? `${(tenths / 10).toFixed(1)} km` : `${Math.round(metres / 1000)} km`;
}

/** How the phone most likely found itself, from how sure it is. */
export function sourceGuess(metres: number): string {
  if (metres <= 20) return "Satellites";
  if (metres <= 150) return "Nearby Wi-Fi";
  return "Phone towers";
}

export function gpsGuess(metres: number): Guess {
  const accuracy = formatDistance(metres);
  switch (scaleFromAccuracy(metres)) {
    case "building":
      return { label: "Which building you're in", because: `It knows where you are to within ${accuracy}.` };
    case "street":
      return { label: "Which street you're on", because: `Within ${accuracy}: too rough for a building, fine for a street.` };
    case "area":
      return { label: "Which part of town you're in", because: `Within ${accuracy}: indoors, phones often fall back to Wi-Fi or towers.` };
    case "city":
      return { label: "Which city you're in", because: `Only within ${accuracy}, but that already narrows down where you are.` };
  }
}

/* ── The simulated day ────────────────────────────────────────────── */

function segmentLength(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** The point a fraction `f` (0 to 1) of the way along a polyline. */
export function pointOnPath(points: readonly Point[], f: number): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  const lengths = points.slice(1).map((p, i) => segmentLength(points[i], p));
  const total = lengths.reduce((a, b) => a + b, 0);
  let left = clamp(f, 0, 1) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i] || i === lengths.length - 1) {
      const t = lengths[i] === 0 ? 0 : clamp(left / lengths[i], 0, 1);
      const a = points[i];
      const b = points[i + 1];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= lengths[i];
  }
  return points[points.length - 1];
}

export interface DayPosition {
  point: Point;
  /** The place the phone is at, or null while travelling. */
  place: PlaceId | null;
}

export function positionAt(minute: number): DayPosition {
  const m = clamp(minute, 0, 24 * 60);
  const segment = DAY.find((s) => m >= s.from && m < s.to) ?? DAY[DAY.length - 1];
  if (segment.kind === "stay") return { point: PLACES[segment.place].at, place: segment.place };
  const f = (m - segment.from) / (segment.to - segment.from);
  return { point: pointOnPath(ROUTES[segment.route], f), place: null };
}

/** Where the phone has been since the start of the slider, every `step` minutes. */
export function trailUntil(minute: number, step = 5): Point[] {
  const points: Point[] = [];
  for (let m = DAY_START; m <= minute; m += step) points.push(positionAt(m).point);
  return points;
}

/** The guesses the app can make once it has seen the day up to `minute`. */
export function guessesUntil(minute: number): PlaceGuess[] {
  return PLACE_GUESSES.filter((g) => minute >= g.after);
}
