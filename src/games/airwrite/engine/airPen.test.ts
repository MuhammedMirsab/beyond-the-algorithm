import { describe, expect, it } from "bun:test";
import { AirPen, DEFAULT_SETTINGS, TIMING, pinchThresholds } from "./airPen";
import { OneEuroFilter } from "./oneEuro";
import { LM, PinchDetector, pinchRatio, type Landmark } from "./gesture";
import { StrokeStore } from "./strokes";

/** Synthetic hand: palm ~0.2 tall, index tip at (x, y), thumb `gap` palm-lengths from the tip. */
function hand(x: number, y: number, gap: number): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x, y: y + 0.15 }));
  lm[LM.WRIST] = { x, y: y + 0.35 };
  lm[LM.MIDDLE_MCP] = { x, y: y + 0.15 };
  lm[LM.INDEX_MCP] = { x: x - 0.02, y: y + 0.16 };
  lm[LM.PINKY_MCP] = { x: x + 0.04, y: y + 0.18 };
  lm[LM.INDEX_TIP] = { x, y };
  lm[LM.THUMB_TIP] = { x, y: y + gap * 0.2 };
  return lm;
}

const OPEN = 0.9;
const PINCHED = 0.05;
const FRAME = 33;

describe("pinchRatio", () => {
  it("is scale invariant", () => {
    const small = pinchRatio(hand(0.5, 0.4, 0.5), 1);
    expect(small).toBeCloseTo(0.5, 1);
  });
});

describe("PinchDetector", () => {
  it("applies hysteresis and debounce", () => {
    const d = new PinchDetector({ enter: 0.3, exit: 0.42, debounceMs: 60 });
    expect(d.update(0.25, 0)).toBe(false); // candidate only
    expect(d.update(0.25, 30)).toBe(false);
    expect(d.update(0.25, 70)).toBe(true);
    expect(d.pinched).toBe(true);
    // Between enter and exit: stays pinched (hysteresis).
    d.update(0.38, 100);
    d.update(0.38, 200);
    expect(d.pinched).toBe(true);
    // A one-frame blip above exit is ignored (debounce).
    d.update(0.6, 230);
    d.update(0.2, 260);
    d.update(0.2, 400);
    expect(d.pinched).toBe(true);
  });
});

describe("OneEuroFilter", () => {
  it("smooths jitter at rest but follows fast motion", () => {
    const f = new OneEuroFilter(1.5, 8);
    let out = 0;
    for (let i = 0; i < 60; i++) out = f.filter(0.5 + (i % 2 ? 0.004 : -0.004), i * FRAME);
    expect(Math.abs(out - 0.5)).toBeLessThan(0.002);
    const g = new OneEuroFilter(1.5, 8);
    for (let i = 0; i < 30; i++) out = g.filter(i * 0.03, i * FRAME);
    expect(29 * 0.03 - out).toBeLessThan(0.05);
  });
});

describe("AirPen", () => {
  function run(frames: (Landmark[] | null)[]) {
    const store = new StrokeStore();
    const pen = new AirPen(store, DEFAULT_SETTINGS);
    let t = 0;
    for (const f of frames) {
      pen.update(f, t);
      t += FRAME;
    }
    return { store, pen, t };
  }

  it("does not draw while the hand is settling", () => {
    const frames = Array.from({ length: 6 }, (_, i) => hand(0.4 + i * 0.01, 0.4, OPEN));
    const { store } = run(frames);
    expect(store.current).toBeNull();
    expect(store.count).toBe(0);
  });

  it("draws while open, lifts on pinch, and trims the pinch hook", () => {
    const frames: Landmark[][] = [];
    for (let i = 0; i < 12; i++) frames.push(hand(0.35, 0.45, OPEN)); // settle
    for (let i = 0; i < 25; i++) frames.push(hand(0.35 + i * 0.01, 0.45, OPEN)); // write a line
    // Pinch: thumb closes while the index tip dips downward (the "hook").
    for (let i = 0; i < 4; i++) frames.push(hand(0.6, 0.45 + (i + 1) * 0.02, OPEN - (i + 1) * 0.2));
    for (let i = 0; i < 6; i++) frames.push(hand(0.6, 0.53, PINCHED));
    for (let i = 0; i < 10; i++) frames.push(hand(0.6 - i * 0.02, 0.6, PINCHED)); // move with pen up
    const { store } = run(frames);
    expect(store.current).toBeNull();
    expect(store.count).toBe(1);
    const pts = store.strokes[0].points;
    const ys = pts.map((p) => p.y);
    // The downward hook (y grows ~0.08 in camera space) must be mostly trimmed.
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.08);
  });

  it("starts a new stroke after releasing the pinch", () => {
    const frames: Landmark[][] = [];
    for (let i = 0; i < 12; i++) frames.push(hand(0.35, 0.45, OPEN));
    for (let i = 0; i < 10; i++) frames.push(hand(0.35 + i * 0.01, 0.45, OPEN));
    for (let i = 0; i < 6; i++) frames.push(hand(0.45, 0.45, PINCHED));
    for (let i = 0; i < 4; i++) frames.push(hand(0.45, 0.55, PINCHED));
    for (let i = 0; i < 12; i++) frames.push(hand(0.45 + i * 0.01, 0.55, OPEN));
    const { store } = run(frames);
    expect(store.count).toBe(1);
    expect(store.current).not.toBeNull();
  });

  it("ends the stroke when the hand is lost, but survives a brief dropout", () => {
    const frames: (Landmark[] | null)[] = [];
    for (let i = 0; i < 12; i++) frames.push(hand(0.35, 0.45, OPEN));
    for (let i = 0; i < 10; i++) frames.push(hand(0.35 + i * 0.01, 0.45, OPEN));
    frames.push(null, null); // ~66 ms dropout
    for (let i = 0; i < 5; i++) frames.push(hand(0.45 + i * 0.01, 0.45, OPEN));
    const brief = run(frames);
    expect(brief.store.current).not.toBeNull();
    expect(brief.store.count).toBe(0);

    const lost = run([...frames, ...Array.from({ length: Math.ceil(TIMING.lossTimeoutMs / FRAME) + 2 }, () => null)]);
    expect(lost.store.current).toBeNull();
    expect(lost.store.count).toBe(1);
  });

  it("maps a smaller writing zone at higher sensitivity", () => {
    const store = new StrokeStore();
    const low = new AirPen(store, { ...DEFAULT_SETTINGS, sensitivity: 0 }).region();
    const high = new AirPen(store, { ...DEFAULT_SETTINGS, sensitivity: 1 }).region();
    expect(high.w).toBeLessThan(low.w);
  });

  it("has exit above enter for every pinch setting", () => {
    for (const p of [0, 0.5, 1]) {
      const { enter, exit } = pinchThresholds(p);
      expect(exit).toBeGreaterThan(enter);
    }
  });
});

/** Synthetic open palm: all four fingers straight up from the knuckles. */
function palmHand(x: number, y: number): Landmark[] {
  const lm = hand(x, y, OPEN);
  const knuckleY = y + 0.16;
  const fingers: [number, number, number, number][] = [
    [LM.INDEX_MCP, LM.INDEX_PIP, LM.INDEX_TIP, -0.03],
    [LM.MIDDLE_MCP, LM.MIDDLE_PIP, LM.MIDDLE_TIP, -0.01],
    [LM.RING_MCP, LM.RING_PIP, LM.RING_TIP, 0.01],
    [LM.PINKY_MCP, LM.PINKY_PIP, LM.PINKY_TIP, 0.03],
  ];
  for (const [mcp, pip, tip, dx] of fingers) {
    lm[mcp] = { x: x + dx, y: knuckleY };
    lm[pip] = { x: x + dx, y: knuckleY - 0.08 };
    lm[tip] = { x: x + dx, y: knuckleY - 0.17 };
  }
  lm[LM.THUMB_TIP] = { x: x - 0.09, y: knuckleY };
  return lm;
}

describe("AirPen eraser", () => {
  function drawLine(pen: AirPen, t0: number) {
    let t = t0;
    for (let i = 0; i < 12; i++, t += FRAME) pen.update(hand(0.35, 0.45, OPEN), t);
    for (let i = 0; i < 25; i++, t += FRAME) pen.update(hand(0.35 + i * 0.01, 0.45, OPEN), t);
    for (let i = 0; i < 8; i++, t += FRAME) pen.update(hand(0.6, 0.45, PINCHED), t);
    return t;
  }

  it("a still open palm shows the eraser but erases nothing", () => {
    const store = new StrokeStore();
    const pen = new AirPen(store, DEFAULT_SETTINGS);
    let t = drawLine(pen, 0);
    const before = store.strokes.length;
    let frame = pen.update(palmHand(0.47, 0.4), t);
    for (let i = 0; i < 20; i++) frame = pen.update(palmHand(0.47, 0.4), (t += FRAME));
    expect(frame.palm).toBe(true);
    expect(frame.eraser?.active).toBe(false);
    expect(store.strokes.length).toBe(before);
    expect(store.current).toBeNull();
  });

  it("wiping the open palm left and right erases the ink, and undo restores it", () => {
    const store = new StrokeStore();
    const pen = new AirPen(store, DEFAULT_SETTINGS);
    let t = drawLine(pen, 0);
    const original = store.strokes;
    expect(original.length).toBe(1);
    // Palm roughly over the line (palm centre sits below the fingertip), wiping.
    for (let i = 0; i < 40; i++) {
      const x = 0.47 + 0.12 * Math.sin(i * 0.5);
      pen.update(palmHand(x, 0.3), (t += FRAME));
    }
    const frame = pen.update(palmHand(0.47, 0.3), (t += FRAME));
    expect(frame.eraser?.active).toBe(true);
    const remaining = store.strokes.reduce((n, s) => n + s.points.length, 0);
    const before = original.reduce((n, s) => n + s.points.length, 0);
    expect(remaining).toBeLessThan(before * 0.5);
    store.undo();
    expect(store.strokes).toBe(original);
  });

  it("does not draw while the palm is open, and resumes after it closes", () => {
    const store = new StrokeStore();
    const pen = new AirPen(store, DEFAULT_SETTINGS);
    let t = 0;
    for (let i = 0; i < 20; i++) pen.update(palmHand(0.4 + i * 0.002, 0.3), (t += FRAME));
    expect(store.current).toBeNull();
    for (let i = 0; i < 20; i++) pen.update(hand(0.4 + i * 0.01, 0.45, OPEN), (t += FRAME));
    expect(store.current).not.toBeNull();
  });
});
