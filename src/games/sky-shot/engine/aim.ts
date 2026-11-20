/**
 * Turns hand landmarks into an aim point and a trigger.
 *
 * Aim: the index fingertip, pushed a little further along the finger,
 * mirrored (the camera faces the player) and stretched from a comfortable
 * box in the middle of the camera picture to the whole screen. A One-Euro
 * filter takes out jitter while keeping fast swings responsive.
 *
 * Trigger: "finger gun". The thumb stands up, then drops onto the side of
 * the index finger. Distances are divided by the hand's own size, and the
 * open-thumb reference adapts to each player's hand.
 */

export interface Point {
  x: number;
  y: number;
}

/** MediaPipe landmark (normalised to the video frame). */
export interface Landmark {
  x: number;
  y: number;
  z: number;
}

class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private t = 0;
  constructor(
    private minCutoff: number,
    private beta: number,
    private dCutoff = 1,
  ) {}

  reset() {
    this.x = null;
  }

  filter(value: number, tSec: number): number {
    if (this.x === null) {
      this.x = value;
      this.t = tSec;
      return value;
    }
    const dt = Math.max(1e-3, tSec - this.t);
    this.t = tSec;
    const a = (cutoff: number) => {
      const tau = 1 / (2 * Math.PI * cutoff);
      return 1 / (1 + tau / dt);
    };
    const dRaw = (value - this.x) / dt;
    const ad = a(this.dCutoff);
    this.dx = ad * dRaw + (1 - ad) * this.dx;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const ax = a(cutoff);
    this.x = ax * value + (1 - ax) * this.x;
    return this.x;
  }
}

/** The part of the camera picture that maps to the whole screen. */
const BOX = { x0: 0.17, x1: 0.83, y0: 0.1, y1: 0.68 };
/** How far past the fingertip the aim point sits, in finger lengths. */
const REACH = 0.3;
/** Fire and re-arm levels, as shares of the player's open-thumb distance. */
const FIRE_AT = 0.58;
const ARM_AT = 0.78;
const COOLDOWN_MS = 230;
/** On firing, aim where the finger was this long ago (before the thumb moved it). */
const LOOKBACK_MS = 90;

export interface AimReading {
  /** Filtered aim, 0..1 across the stage. */
  aim: Point;
  fired: boolean;
  /** Where the shot lands (aim from just before the trigger moved). */
  shotAt: Point;
  /** 0 = thumb down, 1 = fully up; for the reticle's "cocked" look. */
  cock: number;
}

export class HandAim {
  private fx = new OneEuro(1.1, 0.012);
  private fy = new OneEuro(1.1, 0.012);
  private history: { t: number; x: number; y: number }[] = [];
  private openRef = 0.75;
  private armed = false;
  private lastShot = -1e9;
  private lastSeen = -1e9;

  /** `aspect` = video width / height, so x and y distances are comparable. */
  update(lm: Landmark[], tMs: number, aspect: number): AimReading {
    if (tMs - this.lastSeen > 400) {
      // Hand came back: start fresh so the dot doesn't sweep in from the old spot.
      this.fx.reset();
      this.fy.reset();
      this.history = [];
      this.armed = false;
    }
    this.lastSeen = tMs;

    const tip = lm[8];
    const pip = lm[6];
    const rawX = tip.x + (tip.x - pip.x) * REACH;
    const rawY = tip.y + (tip.y - pip.y) * REACH;
    const u = (1 - rawX - BOX.x0) / (BOX.x1 - BOX.x0);
    const v = (rawY - BOX.y0) / (BOX.y1 - BOX.y0);
    const t = tMs / 1000;
    // Filter in "pixel-like" units so beta is easy to reason about.
    const x = clamp(this.fx.filter(u * 1000, t) / 1000, -0.02, 1.02);
    const y = clamp(this.fy.filter(v * 1000, t) / 1000, -0.02, 1.02);
    this.history.push({ t: tMs, x, y });
    while (this.history.length > 0 && tMs - this.history[0].t > 400) this.history.shift();

    // Trigger.
    const d2 = (a: Landmark, b: Landmark) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
    const size = Math.max(1e-4, d2(lm[0], lm[9]));
    const thumb = Math.min(d2(lm[4], lm[5]), d2(lm[4], lm[6])) / size;
    // Track the open-thumb distance: rise quickly, fall slowly, never below a floor.
    this.openRef = thumb > this.openRef ? this.openRef + (thumb - this.openRef) * 0.3 : this.openRef * 0.998 + thumb * 0.002;
    this.openRef = clamp(this.openRef, 0.42, 1.4);
    const level = thumb / this.openRef;

    let fired = false;
    if (level > ARM_AT) this.armed = true;
    if (this.armed && level < FIRE_AT && tMs - this.lastShot > COOLDOWN_MS) {
      fired = true;
      this.armed = false;
      this.lastShot = tMs;
    }

    let shotAt: Point = { x, y };
    if (fired) {
      for (let i = this.history.length - 1; i >= 0; i--) {
        if (tMs - this.history[i].t >= LOOKBACK_MS) {
          shotAt = { x: this.history[i].x, y: this.history[i].y };
          break;
        }
      }
      if (this.history.length > 0 && tMs - this.history[0].t < LOOKBACK_MS) shotAt = { x: this.history[0].x, y: this.history[0].y };
    }

    const cock = clamp((level - FIRE_AT) / (ARM_AT - FIRE_AT), 0, 1);
    return { aim: { x, y }, fired, shotAt, cock };
  }
}

/** Of several hands, keep the biggest one, preferring the one we already follow. */
export function pickHand(hands: Landmark[][], prevTip: Point | null): Landmark[] | null {
  let best: Landmark[] | null = null;
  let bestScore = -Infinity;
  for (const h of hands) {
    if (h.length < 21) continue;
    const size = Math.hypot(h[0].x - h[9].x, h[0].y - h[9].y);
    const near = prevTip ? Math.hypot(h[8].x - prevTip.x, h[8].y - prevTip.y) : 0;
    const score = size - near * 0.35;
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  return best;
}

export function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}
