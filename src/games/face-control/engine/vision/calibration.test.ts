import { describe, expect, test } from "bun:test";
import { Calibrator, DEFAULT_PROFILE, TILT_TARGET, type CalibSample } from "./calibration";
import { jumpThresholds } from "./face-controller";

const DT = 1 / 30;

/** Feeds the same sample for `seconds` of 30 fps frames; returns the first completed step. */
function hold(c: Calibrator, sample: CalibSample | null, seconds: number) {
  let completed = null;
  for (let t = 0; t < seconds; t += DT) completed = c.feed(sample, DT) ?? completed;
  return completed;
}

// Raw roll is + when the player tilts toward their LEFT shoulder (see face-metrics.ts).
const neutral: CalibSample = { roll: 2, yaw: 0.01, mouth: 0.04 };
const tiltLeft = (deg: number): CalibSample => ({ ...neutral, roll: neutral.roll + deg });
const tiltRight = (deg: number): CalibSample => ({ ...neutral, roll: neutral.roll - deg });

describe("Calibrator", () => {
  test("starts at the neutral step and waits for a face", () => {
    const c = new Calibrator();
    expect(c.step).toBe("neutral");
    hold(c, null, 1);
    expect(c.hint).toBe("no-face");
    expect(c.step).toBe("neutral");
  });

  test("neutral needs a steady, closed-mouth pose and measures it", () => {
    const c = new Calibrator();
    expect(hold(c, { ...neutral, mouth: 0.3 }, 2)).toBeNull();
    expect(c.hint).toBe("close-mouth");
    expect(hold(c, neutral, 1.5)).toBe("neutral");
    expect(c.step).toBe("left");
    expect(c.measured.mouthClosed).toBeCloseTo(0.04, 5);
    const profile = c.result();
    expect(profile.neutralRoll).toBeCloseTo(2, 5);
    expect(profile.calibrated).toBe(true);
  });

  test("a tilt the wrong way says so and does not count", () => {
    const c = new Calibrator();
    hold(c, neutral, 1.5);
    hold(c, tiltRight(12), 1);
    expect(c.step).toBe("left");
    expect(c.hint).toBe("other-way");
  });

  test("tilts toward each shoulder set the steering ranges from what was held", () => {
    const c = new Calibrator();
    hold(c, neutral, 1.5);
    expect(hold(c, tiltLeft(16), 1)).toBe("left");
    expect(hold(c, tiltRight(12), 1)).toBe("right");
    expect(c.measured.left).toBeCloseTo(16, 5);
    expect(c.measured.right).toBeCloseTo(12, 5);
    const profile = c.result();
    expect(profile.rangeLeft).toBeCloseTo(16 * 0.85, 5);
    expect(profile.rangeRight).toBeCloseTo(12 * 0.85, 5);
  });

  test("tilt ranges are clamped to 8..24 degrees, but the measurement stays raw", () => {
    const c = new Calibrator();
    hold(c, neutral, 1.5);
    hold(c, tiltLeft(40), 1);
    hold(c, tiltRight(TILT_TARGET + 0.5), 1.5);
    const profile = c.result();
    expect(profile.rangeLeft).toBe(24);
    expect(profile.rangeRight).toBe(8);
    expect(c.measured.left).toBeCloseTo(40, 5);
  });

  test("an open mouth finishes calibration and sets the open ratio", () => {
    const c = new Calibrator();
    hold(c, neutral, 1.5);
    hold(c, tiltLeft(15), 1);
    hold(c, tiltRight(15), 1);
    expect(c.step).toBe("mouth");
    expect(hold(c, { ...neutral, mouth: 0.42 }, 1)).toBe("mouth");
    expect(c.step).toBe("done");
    expect(c.measured.mouthOpen).toBeCloseTo(0.42, 5);
    expect(c.result().mouthOpen).toBeCloseTo(0.42, 5);
  });

  test("a skipped step keeps the default and records no measurement", () => {
    const c = new Calibrator();
    hold(c, neutral, 1.5);
    expect(c.skip()).toBe("left");
    expect(c.step).toBe("right");
    expect(c.measured.left).toBeNull();
    expect(c.result().rangeLeft).toBe(DEFAULT_PROFILE.rangeLeft);
  });

  test("progress decays when the face disappears mid-step", () => {
    const c = new Calibrator();
    hold(c, neutral, 0.6);
    const before = c.progress;
    expect(before).toBeGreaterThan(0);
    hold(c, null, 0.2);
    expect(c.progress).toBeLessThan(before);
  });
});

describe("jumpThresholds", () => {
  const profile = { mouthClosed: 0.04, mouthOpen: 0.44 };

  test("the jump line sits between relaxed and wide open, lower when more sensitive", () => {
    const calm = jumpThresholds(profile, 1);
    const normal = jumpThresholds(profile, 3);
    const keen = jumpThresholds(profile, 5);
    expect(normal.openAt).toBeCloseTo(0.04 + 0.42 * 0.4, 5);
    expect(calm.openAt).toBeGreaterThan(normal.openAt);
    expect(keen.openAt).toBeLessThan(normal.openAt);
  });

  test("the trigger re-arms halfway down (hysteresis)", () => {
    const t = jumpThresholds(profile, 3);
    expect(t.releaseAt).toBeCloseTo(0.04 + 0.42 * 0.4 * 0.5, 5);
    expect(t.releaseAt).toBeLessThan(t.openAt);
  });

  test("a tiny mouth range still leaves a usable gap", () => {
    const t = jumpThresholds({ mouthClosed: 0.05, mouthOpen: 0.06 }, 3);
    expect(t.openAt).toBeCloseTo(0.05 + 0.1 * 0.42, 5);
  });
});
