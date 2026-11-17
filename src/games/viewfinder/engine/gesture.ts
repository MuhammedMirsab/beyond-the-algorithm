import { OneEuroFilter2D } from "./one-euro";
import { convexHull, dist, signedArea, type Vec2 } from "./geometry";

/** MediaPipe hand landmark indices we care about. */
export const LM = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
} as const;

/** MediaPipe's hand model marks this many landmarks on every hand it finds. */
export const POINTS_PER_HAND = 21;

/** The frame uses the thumb tip and index tip of each hand: 4 points in total. */
export const FRAME_POINTS = 4;

export type Slot = "left" | "right";

/** A detected hand, already mapped into display (CSS px) space. */
export interface RawHand {
  points: Vec2[]; // 21 landmarks
  depth: number[]; // per-landmark z in the same px scale (for 3D pinch distance)
}

export interface TrackedHand {
  slot: Slot;
  points: Vec2[];
  thumb: Vec2; // smoothed
  index: Vec2; // smoothed
  openness: number; // thumb↔index distance / palm size
  pinched: boolean;
}

export type GestureEvent =
  | { type: "lock" }
  | { type: "unlock" }
  | { type: "pinch"; slot: Slot; at: Vec2 };

export interface FrameState {
  hands: TrackedHand[];
  locked: boolean;
  /** Eased 0..1 visibility of the lens (drives fades). */
  active: number;
  /** Convex hull of the four smoothed fingertips (3–4 points); last known when tracking drops. */
  quad: Vec2[];
  /** Seconds since the current lock started. */
  lockedFor: number;
}

export const TUNING = {
  /** Frame must be open & valid this long before it locks (debounces flicker). */
  lockDelay: 0.05,
  /** Keep the lens up through brief tracking dropouts. */
  dropoutGrace: 0.25,
  /** Collapsed / pinched frames stay alive a bit longer so a pinch "click" never kills the lens. */
  collapseGrace: 0.6,
  /** Openness (thumb↔index / palm) needed to *start* a frame. */
  openToLock: 0.55,
  /** Pinch hysteresis on openness. */
  pinchIn: 0.3,
  pinchOut: 0.46,
  /** Frame must be locked this long before pinches switch lenses. */
  pinchArmDelay: 0.35,
  pinchCooldown: 0.45,
  /** Areas relative to the viewport. */
  minLockArea: 0.006,
  minHoldArea: 0.0015,
  fadeIn: 0.08,
  fadeOut: 0.16,
};

interface SlotMemory {
  wrist: Vec2 | null;
  lastSeen: number;
  thumb: OneEuroFilter2D;
  index: OneEuroFilter2D;
  pinched: boolean;
}

const makeSlot = (): SlotMemory => ({
  wrist: null,
  lastSeen: -Infinity,
  thumb: new OneEuroFilter2D(),
  index: new OneEuroFilter2D(),
  pinched: false,
});

/**
 * Turns raw two-hand landmarks into a stable "director's frame":
 * slot assignment (which hand is which, robust to crossing), 1€ smoothing of
 * the four fingertips, lock/unlock hysteresis, and pinch → lens events.
 */
export class FrameGesture {
  private readonly slots: Record<Slot, SlotMemory> = { left: makeSlot(), right: makeSlot() };
  private locked = false;
  private lockedAt = 0;
  private validFor = 0;
  private invalidFor = 0;
  private active = 0;
  private quad: Vec2[] = [];
  /** Separate clocks: lock timers advance only on tracked frames, the fade on every redraw. */
  private lastUpdateT = -1;
  private lastEaseT = -1;
  private lastPinchAt = -Infinity;

  reset() {
    this.slots.left = makeSlot();
    this.slots.right = makeSlot();
    this.locked = false;
    this.validFor = 0;
    this.invalidFor = 0;
    this.active = 0;
    this.quad = [];
    this.lastUpdateT = -1;
    this.lastEaseT = -1;
  }

  /** Advance the fade animation without new tracking data (between video frames). */
  animate(tSec: number) {
    this.ease(tSec);
    return this.active;
  }

  update(raw: RawHand[], tSec: number, viewport: { w: number; h: number }, events: GestureEvent[]): FrameState {
    const dt = this.lastUpdateT < 0 ? 1 / 60 : Math.min(0.1, Math.max(1e-3, tSec - this.lastUpdateT));
    this.lastUpdateT = tSec;
    const viewportArea = viewport.w * viewport.h;

    const assignment = this.assign(raw, viewport.w);
    const hands: TrackedHand[] = [];

    for (const [hand, slot] of assignment) {
      const mem = this.slots[slot];
      // A hand that vanished for a while re-enters fresh: no smoothing from a stale position.
      if (tSec - mem.lastSeen > 0.3) {
        mem.thumb.reset();
        mem.index.reset();
        mem.pinched = false;
      }
      mem.lastSeen = tSec;
      mem.wrist = hand.points[LM.WRIST];

      const rawThumb = hand.points[LM.THUMB_TIP];
      const rawIndex = hand.points[LM.INDEX_TIP];
      const thumb = mem.thumb.filter(rawThumb.x, rawThumb.y, tSec);
      const index = mem.index.filter(rawIndex.x, rawIndex.y, tSec);

      const palm = Math.max(1, dist(hand.points[LM.WRIST], hand.points[LM.MIDDLE_MCP]));
      const dz = hand.depth[LM.THUMB_TIP] - hand.depth[LM.INDEX_TIP];
      const openness = Math.hypot(rawThumb.x - rawIndex.x, rawThumb.y - rawIndex.y, dz) / palm;

      const wasPinched = mem.pinched;
      mem.pinched = wasPinched ? openness < TUNING.pinchOut : openness < TUNING.pinchIn;

      if (!wasPinched && mem.pinched && this.locked) {
        const armed = tSec - this.lockedAt > TUNING.pinchArmDelay;
        const cooled = tSec - this.lastPinchAt > TUNING.pinchCooldown;
        if (armed && cooled) {
          this.lastPinchAt = tSec;
          events.push({ type: "pinch", slot, at: { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 } });
        }
      }

      hands.push({ slot, points: hand.points, thumb, index, openness, pinched: mem.pinched });
    }

    // Forget slots that have been gone for a while so re-entry falls back to screen side.
    for (const slot of ["left", "right"] as const) {
      if (tSec - this.slots[slot].lastSeen > 0.6) this.slots[slot].wrist = null;
    }

    const left = hands.find((h) => h.slot === "left");
    const right = hands.find((h) => h.slot === "right");

    let canLock = false;
    let canHold = false;
    if (left && right) {
      const hull = convexHull([left.index, left.thumb, right.index, right.thumb]);
      const area = Math.abs(signedArea(hull)) / viewportArea;
      canHold = hull.length >= 3 && area > TUNING.minHoldArea;
      canLock =
        hull.length === 4 &&
        area > TUNING.minLockArea &&
        left.openness > TUNING.openToLock &&
        right.openness > TUNING.openToLock;
      // The frame follows the fingers live — including while one side pinches.
      if (canHold) this.quad = hull;
    }

    if (!this.locked) {
      this.validFor = canLock ? this.validFor + dt : 0;
      if (this.validFor >= TUNING.lockDelay) {
        this.locked = true;
        this.lockedAt = tSec;
        this.invalidFor = 0;
        events.push({ type: "lock" });
      }
    } else {
      this.invalidFor = canHold ? 0 : this.invalidFor + dt;
      const anyPinched = hands.some((h) => h.pinched);
      const grace = anyPinched || (left && right) ? TUNING.collapseGrace : TUNING.dropoutGrace;
      if (this.invalidFor > grace) {
        this.locked = false;
        this.validFor = 0;
        events.push({ type: "unlock" });
      }
    }

    this.ease(tSec);

    return {
      hands,
      locked: this.locked,
      active: this.active,
      quad: this.quad,
      lockedFor: this.locked ? tSec - this.lockedAt : 0,
    };
  }

  private ease(tSec: number) {
    const dt = this.lastEaseT < 0 ? 0 : Math.min(0.1, Math.max(0, tSec - this.lastEaseT));
    this.lastEaseT = tSec;
    const target = this.locked ? 1 : 0;
    const tau = target > this.active ? TUNING.fadeIn : TUNING.fadeOut;
    this.active += (target - this.active) * (1 - Math.exp(-dt / tau));
    if (Math.abs(target - this.active) < 0.001) this.active = target;
  }

  /** Decide which detected hand is the left/right one on screen, preferring continuity. */
  private assign(raw: RawHand[], viewportW: number): Array<[RawHand, Slot]> {
    const hands = raw.slice(0, 2);
    const prevL = this.slots.left.wrist;
    const prevR = this.slots.right.wrist;
    const wrist = (h: RawHand) => h.points[LM.WRIST];

    if (hands.length === 1) {
      const w = wrist(hands[0]);
      if (prevL && prevR) return [[hands[0], dist(w, prevL) <= dist(w, prevR) ? "left" : "right"]];
      const prev = prevL ?? prevR;
      if (prev && dist(w, prev) < viewportW * 0.2) return [[hands[0], prevL ? "left" : "right"]];
      return [[hands[0], w.x < viewportW / 2 ? "left" : "right"]];
    }

    if (hands.length === 2) {
      const [a, b] = hands;
      if (prevL && prevR) {
        const keep = dist(wrist(a), prevL) + dist(wrist(b), prevR);
        const swap = dist(wrist(a), prevR) + dist(wrist(b), prevL);
        return keep <= swap ? [[a, "left"], [b, "right"]] : [[a, "right"], [b, "left"]];
      }
      return wrist(a).x <= wrist(b).x ? [[a, "left"], [b, "right"]] : [[a, "right"], [b, "left"]];
    }

    return [];
  }
}
