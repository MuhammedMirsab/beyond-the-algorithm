import type { Box } from "../engine/settings";
import type { TrackFrame } from "../engine/tracking/hands";

/**
 * The quick hand check before playing, from the original app's calibration:
 * both hands in view for 1.5 seconds, then (optionally) six seconds of
 * sweeping to the edges of a comfortable reach. Pure: frames in, state out.
 */

export const BOTH_HANDS_MS = 1500;
export const REACH_MS = 6000;
/** A reach box smaller than this on either side is not used. */
export const MIN_REACH = 0.3;

export type ReachState = { status: "idle" } | { status: "measuring"; until: number } | { status: "done"; box: Box } | { status: "too-small" };

export class HandCheck {
  bothMs = 0;
  private lastT = 0;
  reach: ReachState = { status: "idle" };
  private xs: number[] = [];
  private ys: number[] = [];
  /** How far the hands have gone so far while measuring (for drawing). */
  extent: Box | null = null;

  get bothDone() {
    return this.bothMs >= BOTH_HANDS_MS;
  }

  /** 0 to 1. */
  get bothProgress() {
    return Math.min(1, this.bothMs / BOTH_HANDS_MS);
  }

  startReach(now: number) {
    this.xs = [];
    this.ys = [];
    this.extent = null;
    this.reach = { status: "measuring", until: now + REACH_MS };
  }

  /** Feeds one frame. Returns a finished reach box once, when measuring ends with enough room. */
  onFrame(f: TrackFrame): Box | null {
    const now = f.time;
    const dt = this.lastT ? Math.min(100, now - this.lastT) : 0;
    this.lastT = now;
    if (f.Left && f.Right) this.bothMs += dt;
    if (this.reach.status !== "measuring") return null;
    for (const h of f.hands) {
      this.xs.push(h.palm.x, h.tip.x);
      this.ys.push(h.palm.y, h.tip.y);
      const e = this.extent ?? { x0: h.tip.x, x1: h.tip.x, y0: h.tip.y, y1: h.tip.y };
      this.extent = {
        x0: Math.min(e.x0, h.palm.x, h.tip.x),
        x1: Math.max(e.x1, h.palm.x, h.tip.x),
        y0: Math.min(e.y0, h.palm.y, h.tip.y),
        y1: Math.max(e.y1, h.palm.y, h.tip.y),
      };
    }
    if (now < this.reach.until) return null;
    const box = reachBox(this.xs, this.ys);
    this.reach = box ? { status: "done", box } : { status: "too-small" };
    return box;
  }
}

/** The 3rd to 97th percentile of where the hands went, plus a margin; null when too small. */
export function reachBox(xs: number[], ys: number[]): Box | null {
  if (xs.length <= 30) return null;
  const q = (a: number[], p: number) => {
    const s = [...a].sort((x, y) => x - y);
    return s[Math.floor(p * (s.length - 1))];
  };
  const m = 0.04;
  const r: Box = {
    x0: Math.max(0, q(xs, 0.03) - m),
    x1: Math.min(1, q(xs, 0.97) + m),
    y0: Math.max(0, q(ys, 0.03) - m),
    y1: Math.min(1, q(ys, 0.97) + m),
  };
  return r.x1 - r.x0 > MIN_REACH && r.y1 - r.y0 > MIN_REACH ? r : null;
}

/** Plain advice from the hand size (wrist to middle knuckle, in frame heights) and brightness (0 to 255). */
export function distanceHint(avgSize: number | null): { ok: boolean; text: string } | null {
  if (avgSize === null) return null;
  if (avgSize < 0.065) return { ok: false, text: "You're a little far away. Come about 20 cm closer." };
  if (avgSize > 0.2) return { ok: false, text: "You're too close. Lean back so both hands fit." };
  return { ok: true, text: "Good distance." };
}

export function lightHint(brightness: number): { ok: boolean; text: string } {
  if (brightness < 55) return { ok: false, text: "It's too dark for the camera. Face a light." };
  if (brightness < 80) return { ok: false, text: "A bit dark. More light in front of you helps." };
  return { ok: true, text: "Good light." };
}
