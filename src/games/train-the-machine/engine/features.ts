/**
 * Turns one camera reading (plus the last 1.5 seconds) into 44 numbers.
 * Ported from the original temporalFeatureExtractor.js.
 *
 * Changes from the original:
 * - The three "pixel matrix" numbers (skin density, foreground share, pixel
 *   motion) came from the invented pixel tracker, which is gone. Their slots
 *   now hold real model output: a hand is visible, thumbs up, pointing.
 * - When the legs are out of view, MediaPipe still guesses where they are.
 *   Those guesses jump around and were treated as data; they now count as 0.
 * - Min and max of the wrist distance skipped the first sample.
 */
import { KP, MIN_POINT_SCORE, type HandShape, type Keypoint, type PerceptionResult } from "./types";

/** How many numbers describe one example. */
export const FEATURE_COUNT = 44;

/** Moving window, and one recorded move: 25 samples, 60 ms apart (1.5 s). */
export const WINDOW_SIZE = 25;
export const WINDOW_INTERVAL_MS = 60;

/** Temporal numbers need at least this many samples. */
const MIN_WINDOW = 6;

/** The 13 points whose positions become numbers: nose, shoulders, elbows, wrists, hips, knees, ankles. */
export const SHAPE_POINTS = [
  KP.nose,
  KP.leftShoulder,
  KP.rightShoulder,
  KP.leftElbow,
  KP.rightElbow,
  KP.leftWrist,
  KP.rightWrist,
  KP.leftHip,
  KP.rightHip,
  KP.leftKnee,
  KP.rightKnee,
  KP.leftAnkle,
  KP.rightAnkle,
] as const;

const LEG_POINTS: ReadonlySet<number> = new Set([KP.leftKnee, KP.rightKnee, KP.leftAnkle, KP.rightAnkle]);

interface TorsoFrame {
  midShX: number;
  midShY: number;
  midHipX: number;
  midHipY: number;
  /** Shoulder-to-hip distance: the ruler every other number is measured with. */
  torsoLen: number;
}

function torsoFrame(pts: Keypoint[]): TorsoFrame {
  const lSh = pts[KP.leftShoulder];
  const rSh = pts[KP.rightShoulder];
  const lHip = pts[KP.leftHip];
  const rHip = pts[KP.rightHip];
  const midShX = (lSh.x + rSh.x) / 2;
  const midShY = (lSh.y + rSh.y) / 2;
  const midHipX = (lHip.x + rHip.x) / 2;
  const midHipY = (lHip.y + rHip.y) / 2;
  const torsoLen = Math.max(0.12, Math.hypot(midHipX - midShX, midHipY - midShY));
  return { midShX, midShY, midHipX, midHipY, torsoLen };
}

function hasPose(frame: PerceptionResult): boolean {
  return frame.hasPerson && frame.poseLandmarks.length >= 17;
}

const signal = (shape: HandShape | undefined, wanted: HandShape) => (shape === wanted ? 1 : 0);

/**
 * The 44 numbers for one moment, L2-normalised (length 1):
 * 26 positions, 4 leg numbers, 3 arm numbers, 5 hand numbers, 6 motion numbers.
 * Returns null without a person.
 */
export function extractFeatureVector(
  frame: PerceptionResult | null,
  window: readonly PerceptionResult[] = [],
): number[] | null {
  if (!frame || !hasPose(frame)) return null;

  const pts = frame.poseLandmarks;
  const { midShY, midHipX, midHipY, torsoLen } = torsoFrame(pts);
  const legs = frame.legsVisible;
  const features: number[] = [];

  // 1. Where each point is, measured from the middle of the hips in torso lengths (26).
  for (const index of SHAPE_POINTS) {
    if (!legs && LEG_POINTS.has(index)) {
      features.push(0, 0);
      continue;
    }
    const p = pts[index];
    features.push((p.x - midHipX) / torsoLen, (p.y - midHipY) / torsoLen);
  }

  // 2. Posture: standing has a long hip-to-knee drop, sitting a short one (4).
  if (legs) {
    const lKnee = pts[KP.leftKnee];
    const rKnee = pts[KP.rightKnee];
    const avgKneeY = (lKnee.y + rKnee.y) / 2;
    const avgAnkY = (pts[KP.leftAnkle].y + pts[KP.rightAnkle].y) / 2;
    features.push((avgKneeY - midHipY) / torsoLen);
    features.push((avgAnkY - avgKneeY) / torsoLen);
    features.push(calculateAngle(pts[KP.leftHip], lKnee, pts[KP.leftAnkle]) / 180);
    features.push(calculateAngle(pts[KP.rightHip], rKnee, pts[KP.rightAnkle]) / 180);
  } else {
    features.push(0, 0, 0, 0);
  }

  // 3. Arms: wrists above the shoulders (smaller y is higher), and the gap between them (3).
  const lWrist = pts[KP.leftWrist];
  const rWrist = pts[KP.rightWrist];
  features.push((midShY - lWrist.y) / torsoLen);
  features.push((midShY - rWrist.y) / torsoLen);
  features.push(Math.hypot(lWrist.x - rWrist.x, lWrist.y - rWrist.y) / torsoLen);

  // 4. Hand: one is visible, and which of the four shapes the gesture model reports (5).
  const shape = frame.primaryHand?.gesture;
  features.push(frame.primaryHand ? 1 : 0);
  features.push(signal(shape, "OPEN_HAND"));
  features.push(signal(shape, "FIST"));
  features.push(signal(shape, "THUMB_UP"));
  features.push(signal(shape, "POINTING"));

  // 5. Movement over the last 1.5 seconds: clapping, walking, waving (6).
  if (window.length >= MIN_WINDOW) {
    const seqLen = window.length;
    const posed = window.filter(hasPose);

    // A. Clapping: the wrists come together and pull apart.
    const wristDists = posed.map(
      (f) =>
        Math.hypot(
          f.poseLandmarks[KP.leftWrist].x - f.poseLandmarks[KP.rightWrist].x,
          f.poseLandmarks[KP.leftWrist].y - f.poseLandmarks[KP.rightWrist].y,
        ) / torsoLen,
    );
    const { range: clapRange, dips: clapOscillations } = clapStats(wristDists);
    features.push(clapRange);
    features.push(clapOscillations / (seqLen / 15));

    // B. Walking: ankles bob up and down, the hips sway.
    const lAnkVar = computeVariance(posed.map((f) => f.poseLandmarks[KP.leftAnkle].y));
    const rAnkVar = computeVariance(posed.map((f) => f.poseLandmarks[KP.rightAnkle].y));
    const hipXVar = computeVariance(posed.map((f) => f.poseLandmarks[KP.leftHip].x));
    features.push(legs ? Math.sqrt(lAnkVar) * 20 : 0);
    features.push(legs ? Math.sqrt(rAnkVar) * 20 : 0);
    features.push(Math.sqrt(hipXVar) * 25);

    // C. Waving: the raised wrist changes direction left and right.
    const wristXs = posed.map((f) => {
      const right = f.poseLandmarks[KP.rightWrist];
      return (right.y < midShY ? right : f.poseLandmarks[KP.leftWrist]).x;
    });
    features.push(countReversals(wristXs, WAVE_TURN * torsoLen) / (seqLen / 15));
  } else {
    features.push(0, 0, 0, 0, 0, 0);
  }

  const norm = Math.sqrt(features.reduce((sum, value) => sum + value * value, 0)) || 1;
  return features.map((value) => value / norm);
}

export function calculateAngle(
  a: { x: number; y: number } | undefined,
  b: { x: number; y: number } | undefined,
  c: { x: number; y: number } | undefined,
): number {
  if (!a || !b || !c) return 180;
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180) / Math.PI);
  if (angle > 180) angle = 360 - angle;
  return angle;
}

export function computeVariance(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / values.length;
}

/** Spread of the wrist gap, and how often it dropped below a clap (0.22 torso lengths). */
function clapStats(wristDists: readonly number[]) {
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  let dips = 0;
  wristDists.forEach((d, i) => {
    if (d < min) min = d;
    if (d > max) max = d;
    if (i > 0 && d < 0.22 && wristDists[i - 1] >= 0.22) dips++;
  });
  return { range: wristDists.length ? Math.max(0, max - min) : 0, dips };
}

/**
 * The wrist must come back this many torso lengths from its furthest point
 * before a change of direction counts. The original counted any two steps in
 * opposite directions, so tracking jitter on a hand held still "waved"
 * several times a second, and that noise was the largest number in every
 * still example.
 */
const WAVE_TURN = 0.06;

/** Direction changes in a row of x positions: a turn counts once it has moved back by `turn`. */
function countReversals(xs: readonly number[], turn: number): number {
  if (xs.length < 3) return 0;
  let reversals = 0;
  let direction = 0;
  let high = xs[0];
  let low = xs[0];
  for (let i = 1; i < xs.length; i++) {
    const x = xs[i];
    high = Math.max(high, x);
    low = Math.min(low, x);
    if (direction >= 0 && high - x > turn) {
      if (direction === 1) reversals++;
      direction = -1;
      low = x;
    } else if (direction <= 0 && x - low > turn) {
      if (direction === -1) reversals++;
      direction = 1;
      high = x;
    }
  }
  return reversals;
}

export interface TemporalMotion {
  isWalking: boolean;
  isClapping: boolean;
  isWaving: boolean;
  clapOscillations: number;
  walkVariance: number;
  waveReversals: number;
}

export const NO_MOTION: TemporalMotion = {
  isWalking: false,
  isClapping: false,
  isWaving: false,
  clapOscillations: 0,
  walkVariance: 0,
  waveReversals: 0,
};

/** Did the window really contain walking, clapping or waving? */
export function analyzeTemporalMotion(window: readonly PerceptionResult[] = []): TemporalMotion {
  const posed = window.filter(hasPose);
  if (window.length < MIN_WINDOW || posed.length === 0) return NO_MOTION;

  const { midShY, torsoLen } = torsoFrame(posed[0].poseLandmarks);

  // 1. Clapping: wrists oscillating toward and away from each other.
  const wristDists = posed.map(
    (f) =>
      Math.hypot(
        f.poseLandmarks[KP.leftWrist].x - f.poseLandmarks[KP.rightWrist].x,
        f.poseLandmarks[KP.leftWrist].y - f.poseLandmarks[KP.rightWrist].y,
      ) / torsoLen,
  );
  const { range: clapRange, dips: clapOscillations } = clapStats(wristDists);
  const isClapping = clapOscillations >= 1 && clapRange > 0.16;

  // 2. Walking: ankles alternating and the hips moving sideways. Needs the legs in view.
  const legs = posed.some((f) => f.legsVisible);
  const walkVariance = legs
    ? Math.sqrt(computeVariance(posed.map((f) => f.poseLandmarks[KP.leftAnkle].y))) +
      Math.sqrt(computeVariance(posed.map((f) => f.poseLandmarks[KP.rightAnkle].y))) +
      Math.sqrt(computeVariance(posed.map((f) => f.poseLandmarks[KP.leftHip].x)))
    : 0;
  const isWalking = walkVariance > 0.038;

  // 3. Waving: a raised wrist moving left and right.
  const wristXs: number[] = [];
  for (const f of posed) {
    const right = f.poseLandmarks[KP.rightWrist];
    const active = right.y < midShY ? right : f.poseLandmarks[KP.leftWrist];
    if (active.y < midShY + 0.1) wristXs.push(active.x);
  }
  const waveReversals = countReversals(wristXs, WAVE_TURN * torsoLen);
  const isWaving = waveReversals >= 1 && wristXs.length >= 4;

  return { isWalking, isClapping, isWaving, clapOscillations, walkVariance, waveReversals };
}

/* ── Shapes for pictures: the same 13 points, before they become numbers ── */

export interface ShapePoint {
  /** Torso lengths from the middle of the hips; +y is down. */
  x: number;
  y: number;
  visible: boolean;
}

/** The 13 measured points of one frame, as the classifier sees them (before normalising). */
export function bodyShape(frame: PerceptionResult | null): ShapePoint[] | null {
  if (!frame || !hasPose(frame)) return null;
  const pts = frame.poseLandmarks;
  const { midHipX, midHipY, torsoLen } = torsoFrame(pts);
  return SHAPE_POINTS.map((index) => {
    const p = pts[index];
    const visible = p.score > MIN_POINT_SCORE && (frame.legsVisible || !LEG_POINTS.has(index));
    return { x: (p.x - midHipX) / torsoLen, y: (p.y - midHipY) / torsoLen, visible };
  });
}

/** Point-by-point average. A point shows when at least half the shapes saw it. */
export function averageShape(shapes: ReadonlyArray<ShapePoint[] | null>): ShapePoint[] | null {
  const valid = shapes.filter((s): s is ShapePoint[] => s !== null);
  if (valid.length === 0) return null;
  return SHAPE_POINTS.map((_, i) => {
    const seen = valid.filter((s) => s[i].visible);
    if (seen.length === 0) return { x: 0, y: 0, visible: false };
    return {
      x: seen.reduce((sum, s) => sum + s[i].x, 0) / seen.length,
      y: seen.reduce((sum, s) => sum + s[i].y, 0) / seen.length,
      visible: seen.length * 2 >= valid.length,
    };
  });
}

/** Largest distance (in torso lengths) the wrists or hips travelled from where they started. */
export function movementAmount(sequence: readonly PerceptionResult[]): number {
  const posed = sequence.filter(hasPose);
  if (posed.length < 2) return 0;
  const first = posed[0].poseLandmarks;
  const { torsoLen } = torsoFrame(first);
  const tracked = [KP.leftWrist, KP.rightWrist, KP.leftHip, KP.rightHip];
  let most = 0;
  for (const frame of posed) {
    for (const index of tracked) {
      const a = frame.poseLandmarks[index];
      const b = first[index];
      if (a.score <= MIN_POINT_SCORE || b.score <= MIN_POINT_SCORE) continue;
      most = Math.max(most, Math.hypot(a.x - b.x, a.y - b.y) / torsoLen);
    }
  }
  return most;
}
