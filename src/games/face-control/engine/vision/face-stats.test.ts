import { describe, expect, test } from "bun:test";
import { reachFor, TILT_TARGET } from "./calibration";
import { FaceStats, type FaceSample } from "./face-stats";

const FRAME_MS = 1000 / 30;

/** Feeds `frames` identical frames (30 fps) starting at `t0`; returns the next time. */
function feed(stats: FaceStats, sample: Omit<FaceSample, "t">, frames: number, t0 = 0) {
  for (let i = 0; i < frames; i++) stats.feed({ ...sample, t: t0 + i * FRAME_MS });
  return t0 + frames * FRAME_MS;
}

const still: Omit<FaceSample, "t"> = { hasFace: true, tilt: 0, tiltRaw: 0.4, mouth: 0.05, mouthOpen: false };

describe("FaceStats", () => {
  test("knows nothing until the visitor has tilted past the target for a moment", () => {
    const stats = new FaceStats();
    feed(stats, still, 60);
    feed(stats, { ...still, tilt: -(TILT_TARGET + 3) }, 3);
    expect(stats.held("left")).toBeNull();
    expect(stats.reach("left")).toBeNull();
    expect(stats.summary().left).toBeNull();
  });

  test("measures how far each way, and turns it into a steering range with the calibration rule", () => {
    const stats = new FaceStats();
    feed(stats, { ...still, tilt: -14 }, 20);
    feed(stats, { ...still, tilt: 10 }, 20);
    expect(stats.held("left")).toBeCloseTo(14, 5);
    expect(stats.held("right")).toBeCloseTo(10, 5);
    expect(stats.reach("left")).toBeCloseTo(reachFor(14), 5);
    expect(stats.reach("right")).toBeCloseTo(reachFor(10), 5);
  });

  test("small tilts below the target never count", () => {
    const stats = new FaceStats();
    feed(stats, { ...still, tilt: TILT_TARGET - 0.5 }, 60);
    expect(stats.held("right")).toBeNull();
  });

  test("a jump is the widest the mouth opened while past the jump line", () => {
    const stats = new FaceStats();
    let t = feed(stats, still, 10);
    t = feed(stats, { ...still, mouth: 0.3, mouthOpen: true }, 3, t);
    t = feed(stats, { ...still, mouth: 0.42, mouthOpen: true }, 2, t);
    t = feed(stats, still, 5, t);
    t = feed(stats, { ...still, mouth: 0.36, mouthOpen: true }, 4, t);
    feed(stats, still, 5, t);
    const summary = stats.summary();
    expect(summary.jumps).toBe(2);
    expect(summary.mouthOpen).toBeCloseTo((0.42 + 0.36) / 2, 5);
  });

  test("losing the face ends a jump in progress", () => {
    const stats = new FaceStats();
    feed(stats, { ...still, mouth: 0.4, mouthOpen: true }, 3);
    stats.feed({ ...still, hasFace: false, t: 500 });
    expect(stats.summary().jumps).toBe(1);
  });

  test("keeps about three seconds of raw and smoothed tilt, from one unbroken stretch of tracking", () => {
    const stats = new FaceStats();
    expect(stats.summary().trace).toBeNull();
    const t = feed(stats, { ...still, tilt: 3, tiltRaw: 3.6 }, 120);
    const trace = stats.summary().trace;
    expect(trace?.t.length).toBe(90);
    expect(trace?.t[0]).toBe(0);
    expect(trace?.raw[0]).toBeCloseTo(3.6, 5);
    expect(trace?.smooth[0]).toBeCloseTo(3, 5);
    // A dropout starts a new stretch; the last full one is kept meanwhile.
    stats.feed({ ...still, hasFace: false, t });
    feed(stats, still, 10, t + 100);
    expect(stats.summary().trace?.t.length).toBe(90);
  });

  test("reset forgets the visitor", () => {
    const stats = new FaceStats();
    feed(stats, { ...still, tilt: -15, mouth: 0.4, mouthOpen: true }, 100);
    stats.reset();
    expect(stats.summary()).toEqual({ left: null, right: null, mouthOpen: null, jumps: 0, trace: null });
  });
});
