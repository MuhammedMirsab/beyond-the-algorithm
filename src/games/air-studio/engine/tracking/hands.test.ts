import { describe, expect, it } from "bun:test";
import { HandSet, HandSlot, REF_SIZE, type FoundHand, type Pt } from "./hands";

const ASPECT = 4 / 3;
const FRAME = 33;

/**
 * A synthetic 21-point hand (the original app's simulated hand), index tip at
 * (cx, cy). `scale` 1 is a hand about 0.09 frame heights from wrist to knuckle.
 */
function synthHand(cx: number, cy: number, { scale = 1, fist = false, pinch = false } = {}): Pt[] {
  const s = 0.07 * scale;
  const base = { x: cx, y: cy + s * 2.2 };
  const pts: Pt[] = [base];
  const fingerX = [-0.9, -0.35, 0, 0.35, 0.7];
  for (let f = 0; f < 5; f++) {
    for (let j = 1; j <= 4; j++) {
      const ext = fist && f > 0 ? Math.min(j, 2) * 0.35 : j;
      pts.push({ x: base.x + fingerX[f] * s * (f === 0 ? 0.6 + j * 0.25 : 1), y: base.y - s * (f === 0 ? 0.6 + j * 0.2 : 0.9 + ext * 0.38) });
    }
  }
  const dx = cx - pts[8].x;
  const dy = cy - pts[8].y;
  const out = pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  if (pinch) out[4] = { x: out[8].x + 0.005, y: out[8].y + 0.005 };
  return out;
}

/** Moves a hand down at `perSecond` frame heights a second for `frames` frames; returns the slot. */
function moveDown(scale: number, perSecond: number, frames = 12) {
  const slot = new HandSlot("Right");
  for (let i = 0; i < frames; i++) slot.update(synthHand(0.5, 0.3 + (perSecond * i * FRAME) / 1000, { scale }), 1000 + i * FRAME, ASPECT, 1, 50);
  return slot;
}

describe("HandSlot", () => {
  it("measures speed in hand sizes, so distance from the camera doesn't matter", () => {
    // The same move in hand lengths a second: a far (small) hand and a near (big) one.
    const far = moveDown(1, 0.6);
    const near = moveDown(2, 1.2);
    expect(far.hand.vel.y).toBeGreaterThan(0.5);
    expect(near.hand.vel.y).toBeCloseTo(far.hand.vel.y, 1);
    expect(far.hand.size * 2).toBeCloseTo(near.hand.size, 3);
  });

  it("normalises to a reference hand", () => {
    const slot = moveDown(1, 0.6, 30);
    // vel = frame heights per second * REF_SIZE / size
    expect(slot.hand.vel.y).toBeCloseTo((0.6 * REF_SIZE) / slot.hand.size, 1);
  });

  it("tells an open hand from a fist and a pinch", () => {
    const open = new HandSlot("Right");
    open.update(synthHand(0.5, 0.4), 0, ASPECT, 1, 50);
    expect(open.hand.extended).toBe(4);
    expect(open.hand.open).toBe(true);
    expect(open.hand.fist).toBe(false);

    const fist = new HandSlot("Right");
    fist.update(synthHand(0.5, 0.4, { fist: true }), 0, ASPECT, 1, 50);
    expect(fist.hand.extended).toBeLessThanOrEqual(1);
    expect(fist.hand.fist).toBe(true);

    const pinch = new HandSlot("Right");
    pinch.update(synthHand(0.5, 0.4, { pinch: true }), 0, ASPECT, 1, 50);
    expect(pinch.hand.pinch).toBe(true);
    expect(pinch.hand.fist).toBe(false);
  });

  it("marks a hand fresh when it appears or comes back after a gap", () => {
    const slot = new HandSlot("Left");
    slot.update(synthHand(0.5, 0.4), 0, ASPECT, 1, 50);
    expect(slot.hand.fresh).toBe(true);
    slot.update(synthHand(0.5, 0.42), FRAME, ASPECT, 1, 50);
    expect(slot.hand.fresh).toBe(false);
    // A jump after 400 ms without the hand must not read as a fast move.
    slot.update(synthHand(0.5, 0.8), FRAME + 400, ASPECT, 1, 50);
    expect(slot.hand.fresh).toBe(true);
    expect(slot.hand.vel.y).toBe(0);
  });

  it("keeps a trace of the fingertip, raw and smoothed", () => {
    const slot = new HandSlot("Right");
    for (let i = 0; i < 10; i++) slot.update(synthHand(0.5, 0.4 + (i % 2 ? 0.01 : 0)), i * FRAME, ASPECT, 1, 80);
    expect(slot.trace).toHaveLength(10);
    const spread = (k: "raw" | "smooth") => Math.max(...slot.trace.slice(3).map((s) => s[k])) - Math.min(...slot.trace.slice(3).map((s) => s[k]));
    expect(spread("smooth")).toBeLessThan(spread("raw"));
  });
});

const found = (label: "Left" | "Right", x: number, score = 0.95): FoundHand => ({ label, pts: synthHand(x, 0.4), score });

describe("HandSet", () => {
  it("reads the model's labels the original app's way round at first", () => {
    const set = new HandSet();
    expect(set.labelFor("Left")).toBe("Right");
    expect(set.labelFor("Right")).toBe("Left");
  });

  it("splits two hands with the same label by screen side", () => {
    const set = new HandSet();
    const f = set.ingest([found("Right", 0.7), found("Right", 0.3)], 0, ASPECT, 50);
    expect(f.Left?.tip.x).toBeCloseTo(0.3, 2);
    expect(f.Right?.tip.x).toBeCloseTo(0.7, 2);
  });

  it("keeps a hand's identity when the label flickers", () => {
    const set = new HandSet();
    set.ingest([found("Left", 0.4)], 0, ASPECT, 50);
    const f = set.ingest([found("Right", 0.41)], FRAME, ASPECT, 50);
    expect(f.Left).not.toBeNull();
    expect(f.Right).toBeNull();
  });

  /** One camera frame as the tracker builds it: the model's label, read through labelFor(). */
  const camera = (set: HandSet, hands: { cat: "Left" | "Right"; x: number }[]) =>
    hands.map((h): FoundHand => ({ label: set.labelFor(h.cat), pts: synthHand(h.x, 0.4), score: 0.95 }));

  it("turns the labels around when the model already reports the person's own hand", () => {
    // A runtime that labels the person's left hand (on the left of the mirrored picture) "Left".
    const set = new HandSet();
    const own = [
      { cat: "Left" as const, x: 0.25 },
      { cat: "Right" as const, x: 0.75 },
    ];
    let f = set.ingest(camera(set, own), 0, ASPECT, 50);
    expect(f.Left?.tip.x).toBeCloseTo(0.75, 2); // wrong way round at first
    for (let i = 1; i <= 60; i++) f = set.ingest(camera(set, own), i * FRAME, ASPECT, 50);
    expect(set.labelsFlipped).toBe(false);
    expect(f.Left?.tip.x).toBeCloseTo(0.25, 2);
    expect(f.Right?.tip.x).toBeCloseTo(0.75, 2);
  });

  it("starts both hands fresh when it turns the labels around, so nothing reads as a strike", () => {
    const set = new HandSet();
    const own = [
      { cat: "Left" as const, x: 0.25 },
      { cat: "Right" as const, x: 0.75 },
    ];
    let flippedAt = -1;
    for (let i = 0; i <= 60 && flippedAt < 0; i++) {
      const f = set.ingest(camera(set, own), i * FRAME, ASPECT, 50);
      if (!set.labelsFlipped) {
        flippedAt = i;
        expect(f.Left?.fresh).toBe(true);
        expect(f.Right?.fresh).toBe(true);
      }
    }
    expect(flippedAt).toBeGreaterThan(30);
  });

  it("keeps the labels when the model reports mirrored hands, even through a moment of crossed arms", () => {
    // The original app's runtime: the person's left hand (on the left) comes back as "Right".
    const set = new HandSet();
    for (let i = 0; i < 40; i++) {
      set.ingest(camera(set, [{ cat: "Right", x: 0.25 }, { cat: "Left", x: 0.75 }]), i * FRAME, ASPECT, 50);
    }
    for (let i = 40; i < 70; i++) {
      set.ingest(camera(set, [{ cat: "Right", x: 0.75 }, { cat: "Left", x: 0.25 }]), i * FRAME, ASPECT, 50);
    }
    expect(set.labelsFlipped).toBe(true);
  });

  it("never checks the labels of simulated hands", () => {
    const set = new HandSet();
    for (let i = 0; i < 100; i++) set.ingest([found("Left", 0.75), found("Right", 0.25)], i * FRAME, ASPECT, 50, false);
    expect(set.labelsFlipped).toBe(true);
  });

  it("forgets hands that leave the picture", () => {
    const set = new HandSet();
    set.ingest([found("Left", 0.3), found("Right", 0.7)], 0, ASPECT, 50);
    const f = set.ingest([found("Right", 0.7)], FRAME, ASPECT, 50);
    expect(f.Left).toBeNull();
    expect(f.hands).toHaveLength(1);
  });
});
