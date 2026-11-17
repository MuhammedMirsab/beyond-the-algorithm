import { beforeEach, describe, expect, test } from "bun:test";
import type { Vec2 } from "./geometry";
import { FrameGesture, LM, TUNING, type FrameState, type GestureEvent, type RawHand } from "./gesture";

/**
 * Synthetic landmarks: only the points FrameGesture reads are placed
 * (wrist, middle knuckle for the palm size, thumb tip, index tip).
 * The palm is 100 px, so openness = thumb-to-index distance / 100.
 */
function hand(wrist: Vec2, thumb: Vec2, index: Vec2): RawHand {
  const points: Vec2[] = Array.from({ length: 21 }, () => ({ ...wrist }));
  points[LM.WRIST] = wrist;
  points[LM.MIDDLE_MCP] = { x: wrist.x, y: wrist.y - 100 };
  points[LM.INDEX_MCP] = { x: wrist.x, y: wrist.y - 90 };
  points[LM.THUMB_TIP] = thumb;
  points[LM.INDEX_TIP] = index;
  return { points, depth: new Array(21).fill(0) };
}

const VIEW = { w: 1280, h: 720 };
const FPS = 30;

/** Left hand on screen: index up, thumb across. An "L". */
const leftL = () => hand({ x: 300, y: 600 }, { x: 450, y: 520 }, { x: 300, y: 300 });
const rightL = () => hand({ x: 980, y: 600 }, { x: 830, y: 520 }, { x: 980, y: 300 });
/** The same hands with thumb and index tips together. */
const leftPinch = () => hand({ x: 300, y: 600 }, { x: 305, y: 305 }, { x: 300, y: 300 });
const rightPinch = () => hand({ x: 980, y: 600 }, { x: 975, y: 305 }, { x: 980, y: 300 });

let gesture: FrameGesture;
let t: number;

beforeEach(() => {
  gesture = new FrameGesture();
  t = 0;
});

/** Feed `frames` camera frames of the same hands; returns the events and the last state. */
function feed(hands: () => RawHand[], frames: number) {
  const events: GestureEvent[] = [];
  let state: FrameState | null = null;
  for (let i = 0; i < frames; i++) {
    t += 1 / FPS;
    state = gesture.update(hands(), t, VIEW, events);
  }
  if (!state) throw new Error("no frames fed");
  return { events, state };
}

const types = (events: GestureEvent[]) => events.map((e) => e.type);

/** Lock a frame and wait until pinches are armed. */
function lockAndArm() {
  const { events } = feed(() => [leftL(), rightL()], Math.ceil((TUNING.pinchArmDelay + 0.2) * FPS));
  expect(types(events)).toEqual(["lock"]);
}

describe("FrameGesture", () => {
  test("locks after both hands hold an L for a moment", () => {
    const first = feed(() => [leftL(), rightL()], 1);
    expect(first.state.locked).toBe(false);

    const { events, state } = feed(() => [leftL(), rightL()], 4);
    expect(types(events)).toEqual(["lock"]);
    expect(state.locked).toBe(true);
    expect(state.hands.map((h) => h.slot).sort()).toEqual(["left", "right"]);
    // The frame is the hull of the 4 fingertips.
    expect(state.quad).toHaveLength(4);
  });

  test("never locks with one hand", () => {
    const { events, state } = feed(() => [leftL()], 60);
    expect(events).toHaveLength(0);
    expect(state.locked).toBe(false);
    expect(state.hands).toHaveLength(1);
  });

  test("never locks while the fingers are closed", () => {
    const { events, state } = feed(() => [leftPinch(), rightPinch()], 60);
    expect(events).toHaveLength(0);
    expect(state.locked).toBe(false);
  });

  test("assigns slots by screen side, whatever order the model returns the hands in", () => {
    const { state } = feed(() => [rightL(), leftL()], 1);
    const left = state.hands.find((h) => h.slot === "left");
    const right = state.hands.find((h) => h.slot === "right");
    expect(left?.points[LM.WRIST].x).toBe(300);
    expect(right?.points[LM.WRIST].x).toBe(980);
  });

  test("keeps each hand in its slot when they swap places in the result list", () => {
    feed(() => [leftL(), rightL()], 3);
    // Same positions, reversed order: continuity by wrist position, not array order.
    const { state } = feed(() => [rightL(), leftL()], 1);
    expect(state.hands.find((h) => h.slot === "left")?.points[LM.WRIST].x).toBe(300);
  });

  test("a pinch on the right hand asks for the next lens", () => {
    lockAndArm();
    const { events, state } = feed(() => [leftL(), rightPinch()], 2);
    expect(events).toEqual([expect.objectContaining({ type: "pinch", slot: "right" })]);
    // The frame stays up through the pinch "click".
    expect(state.locked).toBe(true);
  });

  test("a pinch on the left hand asks for the previous lens", () => {
    lockAndArm();
    const { events } = feed(() => [leftPinch(), rightL()], 2);
    expect(events).toEqual([expect.objectContaining({ type: "pinch", slot: "left" })]);
  });

  test("pinches only count once the frame has been up for the arm delay", () => {
    const locking = feed(() => [leftL(), rightL()], 3);
    expect(types(locking.events)).toEqual(["lock"]);
    const early = feed(() => [leftL(), rightPinch()], 2);
    expect(early.events).toHaveLength(0);
  });

  test("a second pinch inside the cooldown is ignored", () => {
    lockAndArm();
    const first = feed(() => [leftL(), rightPinch()], 1);
    expect(types(first.events)).toEqual(["pinch"]);
    feed(() => [leftL(), rightL()], 2); // open again (past the release threshold)
    const second = feed(() => [leftL(), rightPinch()], 1);
    expect(second.events).toHaveLength(0);
    // After the cooldown a new pinch works.
    feed(() => [leftL(), rightL()], Math.ceil(TUNING.pinchCooldown * FPS));
    const third = feed(() => [leftL(), rightPinch()], 1);
    expect(types(third.events)).toEqual(["pinch"]);
  });

  test("unlocks once the hands have been gone longer than the dropout grace", () => {
    lockAndArm();
    const graceFrames = Math.floor(TUNING.dropoutGrace * FPS);
    const brief = feed(() => [], graceFrames - 1);
    expect(brief.events).toHaveLength(0);
    expect(brief.state.locked).toBe(true);

    const gone = feed(() => [], 4);
    expect(types(gone.events)).toEqual(["unlock"]);
    expect(gone.state.locked).toBe(false);
  });

  test("reset forgets the lock and the frame", () => {
    lockAndArm();
    gesture.reset();
    const { state } = feed(() => [], 1);
    expect(state.locked).toBe(false);
    expect(state.quad).toHaveLength(0);
    expect(state.active).toBe(0);
  });

  test("the lens fades in after a lock", () => {
    const { state } = feed(() => [leftL(), rightL()], 15);
    expect(state.locked).toBe(true);
    expect(state.active).toBeGreaterThan(0.9);
  });
});
