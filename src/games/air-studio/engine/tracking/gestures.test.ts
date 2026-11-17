import { describe, expect, it } from "bun:test";
import { Debounce, ShakeDetector, speedToVelocity, StrikeDetector, StrumDetector } from "./gestures";
import type { Hand } from "./hands";

/** A present, settled hand moving at `vel` (size-normalised units per second). */
function hand(vel: { x: number; y: number }, patch: Partial<Hand> = {}): Hand {
  return {
    label: "Right",
    present: true,
    lm: [],
    palm: { x: 0.5, y: 0.5 },
    tip: { x: 0.5, y: 0.4 },
    vel,
    tipVel: vel,
    speed: Math.hypot(vel.x, vel.y),
    size: 0.12,
    extended: 4,
    fist: false,
    open: true,
    pinch: false,
    score: 1,
    lastSeen: 0,
    fresh: false,
    ...patch,
  };
}

const THR = 1.5;

describe("StrikeDetector", () => {
  it("fires on the frame the downward speed crosses the threshold", () => {
    const d = new StrikeDetector();
    expect(d.update(hand({ x: 0, y: THR * 0.9 }), 0, THR)).toBeNull();
    const hit = d.update(hand({ x: 0, y: THR * 1.2 }), 33, THR);
    expect(hit).not.toBeNull();
    expect(hit?.vel).toBeCloseTo(THR * 1.2);
    // It aims a little below the palm: where the stroke is heading.
    expect(hit?.at.y).toBeGreaterThan(0.5);
  });

  it("ignores a mostly sideways swipe", () => {
    const d = new StrikeDetector();
    expect(d.update(hand({ x: THR * 3, y: THR * 1.2 }), 0, THR)).toBeNull();
  });

  it("never fires twice in one long downward move", () => {
    const d = new StrikeDetector();
    let hits = 0;
    for (let t = 0; t < 600; t += 33) if (d.update(hand({ x: 0, y: THR * 2 }), t, THR)) hits++;
    expect(hits).toBe(1);
  });

  it("re-arms only after the hand slows down, so a resting hand stays quiet", () => {
    const d = new StrikeDetector();
    expect(d.update(hand({ x: 0, y: THR * 2 }), 0, THR)).not.toBeNull();
    // Still moving down at half the threshold: not re-armed.
    for (let t = 33; t < 400; t += 33) d.update(hand({ x: 0, y: THR * 0.5 }), t, THR);
    expect(d.waiting).toBe(true);
    // At rest: re-arms, but rest alone plays nothing.
    for (let t = 400; t < 1500; t += 33) expect(d.update(hand({ x: 0, y: 0 }), t, THR)).toBeNull();
    expect(d.waiting).toBe(false);
    // The next real strike plays.
    expect(d.update(hand({ x: 0, y: THR * 2 }), 1500, THR)).not.toBeNull();
  });

  it("keeps a refractory window even if the hand stops at once", () => {
    const d = new StrikeDetector(70);
    expect(d.update(hand({ x: 0, y: THR * 2 }), 0, THR)).not.toBeNull();
    d.update(hand({ x: 0, y: 0 }), 30, THR);
    expect(d.waiting).toBe(true);
    d.update(hand({ x: 0, y: 0 }), 80, THR);
    expect(d.waiting).toBe(false);
  });

  it("re-arms when the hand is new or gone, without firing", () => {
    const d = new StrikeDetector();
    d.update(hand({ x: 0, y: THR * 2 }), 0, THR);
    expect(d.update(hand({ x: 0, y: THR * 2 }, { fresh: true }), 33, THR)).toBeNull();
    expect(d.waiting).toBe(false);
    d.update(hand({ x: 0, y: THR * 2 }), 200, THR);
    expect(d.update(hand({ x: 0, y: THR * 2 }, { present: false }), 233, THR)).toBeNull();
    expect(d.waiting).toBe(false);
  });

  it("uses the fingertip when asked", () => {
    const d = new StrikeDetector();
    const h = hand({ x: 0, y: 0 }, { tipVel: { x: 0, y: THR * 2 } });
    expect(d.update(h, 0, THR)).toBeNull();
    expect(new StrikeDetector().update(h, 0, THR, true)).not.toBeNull();
  });
});

describe("StrumDetector", () => {
  it("reads down and up strums, alternating", () => {
    const d = new StrumDetector();
    expect(d.update(hand({ x: 0, y: THR * 1.5 }), 0, THR)?.dir).toBe("down");
    expect(d.update(hand({ x: 0, y: -THR * 1.5 }), 100, THR)?.dir).toBe("up");
    expect(d.update(hand({ x: 0, y: THR * 1.5 }), 200, THR)?.dir).toBe("down");
  });

  it("needs a pause between two downstrokes", () => {
    const d = new StrumDetector();
    expect(d.update(hand({ x: 0, y: THR * 1.5 }), 0, THR)).not.toBeNull();
    expect(d.update(hand({ x: 0, y: THR * 1.5 }), 100, THR)).toBeNull();
    d.update(hand({ x: 0, y: 0 }), 200, THR);
    expect(d.update(hand({ x: 0, y: THR * 1.5 }), 300, THR)?.dir).toBe("down");
  });

  it("ignores strums closer together than its minimum interval", () => {
    const d = new StrumDetector(55);
    d.update(hand({ x: 0, y: THR * 1.5 }), 0, THR);
    expect(d.update(hand({ x: 0, y: -THR * 1.5 }), 30, THR)).toBeNull();
  });
});

describe("ShakeDetector", () => {
  it("counts direction reversals at speed and reports the peak", () => {
    const d = new ShakeDetector();
    expect(d.update(hand({ x: THR * 1.2, y: 0 }), 0, THR)).toBeNull(); // first direction: nothing yet
    const peak = d.update(hand({ x: -THR * 1.6, y: 0 }), 100, THR);
    expect(peak).toBeCloseTo(THR * 1.6);
    expect(d.update(hand({ x: THR * 1.3, y: 0 }), 200, THR)).toBeCloseTo(THR * 1.3);
  });

  it("ignores slow sideways movement", () => {
    const d = new ShakeDetector();
    expect(d.update(hand({ x: THR * 0.5, y: 0 }), 0, THR)).toBeNull();
    expect(d.update(hand({ x: -THR * 0.5, y: 0 }), 100, THR)).toBeNull();
  });
});

describe("Debounce", () => {
  it("switches on and off only after holding", () => {
    const d = new Debounce(90, 140);
    expect(d.update(true, 0)).toBe(false);
    expect(d.update(true, 50)).toBe(false);
    expect(d.update(true, 100)).toBe(true);
    // A one-frame blip does not switch it off.
    expect(d.update(false, 130)).toBe(true);
    expect(d.update(true, 160)).toBe(true);
    expect(d.update(false, 200)).toBe(true);
    expect(d.update(false, 360)).toBe(false);
  });
});

describe("speedToVelocity", () => {
  it("is a fixed loudness with no velocity response", () => {
    expect(speedToVelocity(THR, THR, 0)).toBeCloseTo(0.75);
    expect(speedToVelocity(THR * 5, THR, 0)).toBeCloseTo(0.75);
  });

  it("plays faster moves louder, within limits", () => {
    const soft = speedToVelocity(THR, THR, 100);
    const loud = speedToVelocity(THR * 2.5, THR, 100);
    expect(loud).toBeGreaterThan(soft);
    expect(speedToVelocity(THR * 50, THR, 100)).toBe(1);
    expect(speedToVelocity(0, THR, 100)).toBeGreaterThanOrEqual(0.15);
  });
});
