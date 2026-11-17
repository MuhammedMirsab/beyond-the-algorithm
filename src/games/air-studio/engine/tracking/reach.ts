import { lerp } from "../music";
import { settings, type Box } from "../settings";
import type { Pt } from "./hands";

/**
 * The play area: where the instruments are drawn and played, in mirrored
 * camera coordinates. The original app laid instruments out inside the
 * visitor's reach box. Here the camera fills the whole screen, so the part
 * that is visible between the header and the dock (the viewport) also
 * limits it; otherwise keys could sit under the dock or off screen.
 */

const FULL: Box = { x0: 0, x1: 1, y0: 0, y1: 1 };
/** Below this size the reach box is ignored and the visible area is used instead. */
const MIN_SPAN = 0.25;

let viewport: Box = FULL;

/** The part of the camera frame the visitor can see and play in (set by the stage). */
export function setViewport(box: Box) {
  viewport = box;
}

export function resetViewport() {
  viewport = FULL;
}

export function intersect(a: Box, b: Box): Box {
  return { x0: Math.max(a.x0, b.x0), x1: Math.min(a.x1, b.x1), y0: Math.max(a.y0, b.y0), y1: Math.min(a.y1, b.y1) };
}

/** Reach box ∩ visible area, falling back to the visible area when the overlap is too small to play in. */
export function playArea(reach: Box = settings.get().tracking.reach, view: Box = viewport): Box {
  const r = intersect(reach, view);
  if (r.x1 - r.x0 < MIN_SPAN || r.y1 - r.y0 < MIN_SPAN) return view;
  return r;
}

/** The downward speed a strike must reach. Sensitivity 0 to 100 (plus an instrument's offset) maps to 2.6 down to 0.55. */
export function strikeThreshold(sensOffset = 0, sensitivity = settings.get().tracking.sensitivity) {
  const s = Math.max(0, Math.min(100, sensitivity + sensOffset)) / 100;
  return lerp(2.6, 0.55, s);
}

/** A screen-space point inside the play area (0 to 1). */
export function toReach(p: Pt): Pt {
  const r = playArea();
  return { x: (p.x - r.x0) / Math.max(0.1, r.x1 - r.x0), y: (p.y - r.y0) / Math.max(0.1, r.y1 - r.y0) };
}

export function fromReach(p: Pt): Pt {
  const r = playArea();
  return { x: r.x0 + p.x * (r.x1 - r.x0), y: r.y0 + p.y * (r.y1 - r.y0) };
}
