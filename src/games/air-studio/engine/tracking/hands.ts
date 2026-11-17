import { lerp } from "../music";
import { OneEuro } from "./one-euro";

/**
 * From 21 raw landmarks to a hand the instruments can read: smoothed points,
 * palm and fingertip, size-normalised velocities, finger extension, fist,
 * open hand and pinch. Copied from the original app's tracker (HandSlot and
 * ingest), split out so it runs without a camera and can be tested.
 */

export type HandLabel = "Left" | "Right";

export interface Pt {
  x: number;
  y: number;
}

export interface Hand {
  label: HandLabel;
  present: boolean;
  /** Screen-space (mirrored), smoothed landmarks, 0 to 1. */
  lm: Pt[];
  palm: Pt;
  tip: Pt;
  /** Size-normalised velocities in frame units per second (+y is downward). */
  vel: Pt;
  tipVel: Pt;
  speed: number;
  /** Wrist to middle knuckle, in frame heights. */
  size: number;
  /** Fingers extended, 0 to 4 (thumb not counted). */
  extended: number;
  fist: boolean;
  open: boolean;
  pinch: boolean;
  score: number;
  lastSeen: number;
  /** True on the first frame after (re)appearing: velocities are not reliable yet. */
  fresh: boolean;
}

export interface TrackFrame {
  /** performance.now() */
  time: number;
  /** Present hands only. */
  hands: Hand[];
  Left: Hand | null;
  Right: Hand | null;
}

export interface FoundHand {
  label: HandLabel;
  pts: Pt[];
  score: number;
}

/** One sample of the index fingertip's height, before and after smoothing (for the reveal). */
export interface TraceSample {
  t: number;
  raw: number;
  smooth: number;
}

const PALM = [0, 5, 9, 13, 17];
/** The reference hand size velocities are normalised to: wrist to middle knuckle, in frame heights. */
export const REF_SIZE = 0.12;
/** A hand that was missing longer than this starts fresh (filters and velocities reset). */
export const FRESH_GAP_MS = 150;
const TRACE_LENGTH = 90;

const avg = (pts: Pt[], idx: number[]): Pt => ({
  x: idx.reduce((a, i) => a + pts[i].x, 0) / idx.length,
  y: idx.reduce((a, i) => a + pts[i].y, 0) / idx.length,
});

export const opposite = (label: HandLabel): HandLabel => (label === "Left" ? "Right" : "Left");

export class HandSlot {
  private fx = Array.from({ length: 21 }, () => new OneEuro());
  private fy = Array.from({ length: 21 }, () => new OneEuro());
  private prevPalm: Pt | null = null;
  private prevTip: Pt | null = null;
  private vel: Pt = { x: 0, y: 0 };
  private tipVel: Pt = { x: 0, y: 0 };
  private lastT = 0;
  readonly hand: Hand;
  /** The last few seconds of fingertip height, raw and smoothed. */
  readonly trace: TraceSample[] = [];

  constructor(label: HandLabel) {
    this.hand = {
      label,
      present: false,
      lm: [],
      palm: { x: 0.5, y: 0.5 },
      tip: { x: 0.5, y: 0.5 },
      vel: { x: 0, y: 0 },
      tipVel: { x: 0, y: 0 },
      speed: 0,
      size: REF_SIZE,
      extended: 0,
      fist: false,
      open: false,
      pinch: false,
      score: 0,
      lastSeen: 0,
      fresh: true,
    };
  }

  reset() {
    this.fx.forEach((f) => f.reset());
    this.fy.forEach((f) => f.reset());
    this.prevPalm = null;
    this.prevTip = null;
    this.vel = { x: 0, y: 0 };
    this.tipVel = { x: 0, y: 0 };
  }

  /** Marks the hand as gone (the original app's ingest did this for unseen labels). */
  lose() {
    if (!this.hand.present) return;
    this.hand.present = false;
    this.hand.vel = { x: 0, y: 0 };
    this.hand.tipVel = { x: 0, y: 0 };
  }

  /**
   * @param raw 21 mirrored landmarks, 0 to 1
   * @param t performance.now()
   * @param aspect camera width / height
   * @param smoothing 0 to 100
   */
  update(raw: Pt[], t: number, aspect: number, score: number, smoothing: number) {
    const gap = t - this.hand.lastSeen;
    const fresh = !this.hand.present || gap > FRESH_GAP_MS;
    if (fresh) this.reset();
    const dt = Math.max(0.001, (t - (this.lastT || t - 33)) / 1000);
    this.lastT = t;
    const minCut = lerp(4, 0.5, smoothing / 100);
    const lm = raw.map((p, i) => {
      this.fx[i].minCutoff = minCut;
      this.fy[i].minCutoff = minCut;
      return { x: this.fx[i].filter(p.x, dt), y: this.fy[i].filter(p.y, dt) };
    });
    const rawPalm = avg(raw, PALM);
    const rawTip = raw[8];
    const d = (a: Pt, b: Pt) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
    const size = Math.max(0.03, d(raw[0], raw[9]));
    const norm = REF_SIZE / size;
    // Velocity: derivative of the raw palm (low noise thanks to the 5-point average) with a light EMA.
    const k = 0.55;
    if (this.prevPalm && this.prevTip && !fresh) {
      const vx = ((rawPalm.x - this.prevPalm.x) / dt) * norm * aspect;
      const vy = ((rawPalm.y - this.prevPalm.y) / dt) * norm;
      this.vel = { x: this.vel.x * (1 - k) + vx * k, y: this.vel.y * (1 - k) + vy * k };
      const tvx = ((rawTip.x - this.prevTip.x) / dt) * norm * aspect;
      const tvy = ((rawTip.y - this.prevTip.y) / dt) * norm;
      this.tipVel = { x: this.tipVel.x * (1 - k) + tvx * k, y: this.tipVel.y * (1 - k) + tvy * k };
    }
    this.prevPalm = rawPalm;
    this.prevTip = rawTip;
    // Finger extension: the tip is further from the wrist than its middle joint.
    let ext = 0;
    for (const [tip, pip] of [
      [8, 6],
      [12, 10],
      [16, 14],
      [20, 18],
    ]) {
      if (d(raw[tip], raw[0]) > d(raw[pip], raw[0]) * 1.12) ext++;
    }
    const pinch = d(raw[4], raw[8]) / size < 0.38;
    Object.assign(this.hand, {
      present: true,
      lm,
      palm: avg(lm, PALM),
      tip: lm[8],
      vel: this.vel,
      tipVel: this.tipVel,
      speed: Math.hypot(this.vel.x, this.vel.y),
      size,
      extended: ext,
      fist: ext <= 1 && !pinch,
      open: ext >= 3,
      pinch,
      score,
      lastSeen: t,
      fresh,
    });
    this.trace.push({ t, raw: rawTip.y, smooth: lm[8].y });
    if (this.trace.length > TRACE_LENGTH) this.trace.shift();
  }
}

/** Votes before the left/right reading of the hand model is turned around (see HandSet.vote). */
const FLIP_AFTER = 45;
const VOTE_LIMIT = 60;

/**
 * Both hands: assigns each detection to the Left or Right slot and returns
 * the frame the instruments read.
 */
export class HandSet {
  readonly slots: Record<HandLabel, HandSlot> = { Left: new HandSlot("Left"), Right: new HandSlot("Right") };
  /**
   * The hand model labels hands as if the picture were mirrored, so for a raw
   * webcam frame its "Left" is the person's right hand (the original app
   * flips it). Newer model runtimes may already report the person's own hand,
   * so this is checked against where the hands are whenever both are in view.
   */
  private flipped = true;
  private votes = 0;

  /** The person's hand for the model's handedness label. */
  labelFor(categoryName: string | undefined): HandLabel {
    const asReported: HandLabel = categoryName === "Left" ? "Left" : "Right";
    return this.flipped ? opposite(asReported) : asReported;
  }

  /** Whether the model's labels are currently turned around. */
  get labelsFlipped() {
    return this.flipped;
  }

  /**
   * With both hands in view, the person's left hand is on the left of the
   * mirrored picture. A steady run of frames that say otherwise means the
   * labels are the wrong way round for this runtime: turn them around.
   * Returns true when it just flipped.
   */
  private vote(found: FoundHand[]): boolean {
    if (found.length !== 2 || found[0].label === found[1].label) return false;
    if (found[0].score < 0.7 || found[1].score < 0.7) return false;
    const left = found[0].label === "Left" ? found[0] : found[1];
    const right = left === found[0] ? found[1] : found[0];
    const gap = right.pts[0].x - left.pts[0].x;
    if (Math.abs(gap) < 0.15) return false;
    this.votes = Math.max(-VOTE_LIMIT, Math.min(VOTE_LIMIT, this.votes + (gap > 0 ? 1 : -1)));
    if (this.votes > -FLIP_AFTER) return false;
    this.flipped = !this.flipped;
    this.votes = FLIP_AFTER;
    for (const f of found) f.label = opposite(f.label);
    return true;
  }

  /**
   * One camera (or simulated) frame. `checkLabels` is false for simulated
   * hands, whose labels are always right.
   */
  ingest(found: FoundHand[], now: number, aspect: number, smoothing: number, checkLabels = true): TrackFrame {
    // Only frames where the model told the two hands apart say anything about its labels.
    if (checkLabels && this.vote(found)) {
      // Identities swapped: start both hands fresh so no jump reads as a strike.
      this.slots.Left.lose();
      this.slots.Right.lose();
    }
    if (found.length === 2 && found[0].label === found[1].label) {
      // Conflicting labels: decide by screen side.
      const [a, b] = found[0].pts[0].x < found[1].pts[0].x ? [found[0], found[1]] : [found[1], found[0]];
      a.label = "Left";
      b.label = "Right";
    } else if (found.length === 1) {
      // Label stickiness: keep identity when the hand hasn't moved far but the classifier flipped.
      const f = found[0];
      const other = this.slots[opposite(f.label)].hand;
      const same = this.slots[f.label].hand;
      if (other.present && !same.present && Math.hypot(other.palm.x - f.pts[9].x, other.palm.y - f.pts[9].y) < 0.12) f.label = other.label;
    }
    const seen = new Set<HandLabel>();
    for (const f of found) {
      this.slots[f.label].update(f.pts, now, aspect, f.score, smoothing);
      seen.add(f.label);
    }
    for (const label of ["Left", "Right"] as const) if (!seen.has(label)) this.slots[label].lose();
    const L = this.slots.Left.hand.present ? this.slots.Left.hand : null;
    const R = this.slots.Right.hand.present ? this.slots.Right.hand : null;
    const hands: Hand[] = [];
    if (L) hands.push(L);
    if (R) hands.push(R);
    return { time: now, hands, Left: L, Right: R };
  }

  /** Forget both hands (camera off, Next player). Keeps the label check: it describes the runtime, not the visitor. */
  clear() {
    for (const label of ["Left", "Right"] as const) {
      this.slots[label].lose();
      this.slots[label].reset();
      this.slots[label].trace.length = 0;
    }
  }
}

export const EMPTY_FRAME: TrackFrame = { time: 0, hands: [], Left: null, Right: null };
