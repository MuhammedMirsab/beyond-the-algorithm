import { describe, expect, it } from "bun:test";
import type { Hand, TrackFrame } from "../engine/tracking/hands";
import { BOTH_HANDS_MS, distanceHint, HandCheck, lightHint, REACH_MS, reachBox } from "./hand-check";

function hand(label: "Left" | "Right", x: number, y: number): Hand {
  return {
    label,
    present: true,
    lm: [],
    palm: { x, y },
    tip: { x, y: y - 0.1 },
    vel: { x: 0, y: 0 },
    tipVel: { x: 0, y: 0 },
    speed: 0,
    size: 0.1,
    extended: 4,
    fist: false,
    open: true,
    pinch: false,
    score: 1,
    lastSeen: 0,
    fresh: false,
  };
}

const frame = (t: number, hands: Hand[]): TrackFrame => ({
  time: t,
  hands,
  Left: hands.find((h) => h.label === "Left") ?? null,
  Right: hands.find((h) => h.label === "Right") ?? null,
});

describe("HandCheck", () => {
  it("passes after both hands stay in view for 1.5 seconds", () => {
    const c = new HandCheck();
    let t = 0;
    for (; t < BOTH_HANDS_MS - 100; t += 33) c.onFrame(frame(t, [hand("Left", 0.3, 0.5), hand("Right", 0.7, 0.5)]));
    expect(c.bothDone).toBe(false);
    // One hand only: no progress.
    const before = c.bothMs;
    for (let i = 0; i < 10; i++, t += 33) c.onFrame(frame(t, [hand("Right", 0.7, 0.5)]));
    expect(c.bothMs).toBe(before);
    for (let i = 0; i < 10; i++, t += 33) c.onFrame(frame(t, [hand("Left", 0.3, 0.5), hand("Right", 0.7, 0.5)]));
    expect(c.bothDone).toBe(true);
    expect(c.bothProgress).toBe(1);
  });

  it("measures the reach from where the hands went", () => {
    const c = new HandCheck();
    c.startReach(0);
    let box = null;
    for (let t = 0; t <= REACH_MS + 33 && !box; t += 33) {
      const k = (t / REACH_MS) * Math.PI * 4;
      box = c.onFrame(frame(t, [hand("Left", 0.3 + 0.2 * Math.sin(k), 0.5 + 0.3 * Math.cos(k)), hand("Right", 0.7 + 0.2 * Math.cos(k), 0.5 + 0.3 * Math.sin(k))]));
    }
    expect(box).not.toBeNull();
    expect(c.reach.status).toBe("done");
    if (box) {
      expect(box.x0).toBeLessThan(0.15);
      expect(box.x1).toBeGreaterThan(0.85);
    }
  });

  it("refuses a reach that is too small", () => {
    const c = new HandCheck();
    c.startReach(0);
    for (let t = 0; t <= REACH_MS + 33; t += 33) c.onFrame(frame(t, [hand("Right", 0.5, 0.5)]));
    expect(c.reach.status).toBe("too-small");
  });
});

describe("reachBox", () => {
  it("needs enough samples", () => {
    expect(reachBox([0, 1], [0, 1])).toBeNull();
  });

  it("drops the extremes and adds a margin, inside the picture", () => {
    const xs = Array.from({ length: 101 }, (_, i) => i / 100);
    const box = reachBox(xs, xs);
    expect(box).not.toBeNull();
    expect(box?.x0).toBe(0);
    expect(box?.x1).toBe(1);
  });
});

describe("hints", () => {
  it("talks about distance from the hand's size", () => {
    expect(distanceHint(null)).toBeNull();
    expect(distanceHint(0.05)?.ok).toBe(false);
    expect(distanceHint(0.1)?.ok).toBe(true);
    expect(distanceHint(0.25)?.ok).toBe(false);
  });

  it("talks about light from the picture's brightness", () => {
    expect(lightHint(40).ok).toBe(false);
    expect(lightHint(70).ok).toBe(false);
    expect(lightHint(140).ok).toBe(true);
  });
});
