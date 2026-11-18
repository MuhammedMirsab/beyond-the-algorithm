import type { Pt } from "./hands";

/**
 * The pretend hand for mouse and touch play (copied from the original app's
 * tracker), split out so it runs without a browser and can be tested. It
 * goes through exactly the same feature pipeline and gesture detectors as a
 * camera hand.
 */

/** Sim hands were drawn for a 4:3 stage; this keeps their shape on any stage. */
export const SIM_BASE_ASPECT = 4 / 3;

/**
 * A click or tap is played as a quick strike: the pretend hand appears this
 * far above the pointer (stage heights) and comes straight down onto it in
 * SIM_STRIKE_MS. That is about 28 hand lengths a second, faster than the
 * strictest strike threshold (21.7). Short and fast, so the strike detector's
 * aim point lands within 4% of the screen of the pointer (see the tests).
 * On a slow screen the stroke stretches past one frame, at the
 * same speed, so a click still counts (strokeFor).
 */
export const SIM_STRIKE_DIST = 0.1;
export const SIM_STRIKE_MS = 40;
/** The longest a stretched stroke may be, in stage heights. */
const SIM_STRIKE_MAX_DIST = 0.2;

/** A click's stroke for a screen drawing a frame every `frameMs`. */
export function strokeFor(frameMs: number): { ms: number; dist: number } {
  const ms = Math.max(SIM_STRIKE_MS, 1.2 * frameMs);
  return { ms, dist: Math.min(SIM_STRIKE_MAX_DIST, (SIM_STRIKE_DIST * ms) / SIM_STRIKE_MS) };
}

/** Landmarks averaged for the palm (as in hands.ts). */
const PALM_IDX = [0, 5, 9, 13, 17];

export type SimAnchor = "tip" | "palm";

/**
 * A synthetic 21-point hand in MediaPipe order, open or in a fist, with its
 * index fingertip or its palm centre at (cx, cy). `aspect` is the stage's
 * width / height, so the hand keeps its shape on any stage.
 */
export function simHandPoints(cx: number, cy: number, fist: boolean, aspect: number, anchor: SimAnchor): Pt[] {
  const sx = SIM_BASE_ASPECT / aspect;
  const s = 0.07;
  const pts: Pt[] = [];
  const base = { x: cx, y: cy + s * 2.2 };
  pts.push(base);
  const fingerX = [-0.9, -0.35, 0, 0.35, 0.7];
  for (let f = 0; f < 5; f++) {
    for (let j = 1; j <= 4; j++) {
      const ext = fist && f > 0 ? Math.min(j, 2) * 0.35 : j;
      pts.push({
        x: base.x + fingerX[f] * s * (f === 0 ? 0.6 + j * 0.25 : 1) * sx,
        y: base.y - s * (f === 0 ? 0.6 + j * 0.2 : 0.9 + ext * 0.38),
      });
    }
  }
  const at =
    anchor === "tip"
      ? pts[8]
      : { x: PALM_IDX.reduce((a, i) => a + pts[i].x, 0) / PALM_IDX.length, y: PALM_IDX.reduce((a, i) => a + pts[i].y, 0) / PALM_IDX.length };
  const dx = cx - at.x;
  const dy = cy - at.y;
  return pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

/**
 * Where the pretend right hand is on this frame of a click's stroke.
 * Frame 0: hidden (so the jump to the top never reads as a move up).
 * Frame 1: at the top. Then straight down onto the pointer over SIM_STRIKE_MS.
 */
export interface Stroke {
  /** -1 when no click is playing. */
  frame: number;
  t0: number;
  ms: number;
  dist: number;
}

export const NO_STROKE: Stroke = { frame: -1, t0: 0, ms: SIM_STRIKE_MS, dist: SIM_STRIKE_DIST };

/** A click that starts on the next frame, sized for the screen's frame rate. */
export const startStroke = (frameMs: number): Stroke => ({ frame: 0, t0: 0, ...strokeFor(frameMs) });

export function strokeStep(stroke: Stroke, now: number, pointerY: number): { stroke: Stroke; visible: boolean; y: number } {
  if (stroke.frame === 0) return { stroke: { ...stroke, frame: 1 }, visible: false, y: pointerY };
  if (stroke.frame === 1) return { stroke: { ...stroke, frame: 2, t0: now }, visible: true, y: pointerY - stroke.dist };
  if (stroke.frame >= 2) {
    const k = (now - stroke.t0) / stroke.ms;
    if (k >= 1) return { stroke: NO_STROKE, visible: true, y: pointerY };
    return { stroke, visible: true, y: pointerY - stroke.dist * (1 - k) };
  }
  return { stroke, visible: true, y: pointerY };
}
