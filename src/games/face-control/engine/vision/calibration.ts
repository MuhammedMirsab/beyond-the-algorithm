/**
 * Per-player calibration. Everyone holds their head slightly differently and
 * has a different mouth shape, so instead of hard-coded thresholds we measure
 * this player's neutral pose and how far they comfortably tilt and open.
 * Profiles live in memory only and are discarded when the page closes.
 */
export interface CalibrationProfile {
  /** Raw roll (degrees) when looking straight at the screen. */
  neutralRoll: number;
  /** Raw yaw proxy when looking straight at the screen. */
  neutralYaw: number;
  /** Tilt (degrees) that gives full steering to the left / right. */
  rangeLeft: number;
  rangeRight: number;
  /** Yaw-proxy change that gives full steering when "tilt + turn" is enabled. */
  yawRange: number;
  /** Mouth ratio with the mouth relaxed / wide open. */
  mouthClosed: number;
  mouthOpen: number;
  calibrated: boolean;
}

export const DEFAULT_PROFILE: CalibrationProfile = {
  neutralRoll: 0,
  neutralYaw: 0,
  rangeLeft: 15,
  rangeRight: 15,
  yawRange: 0.12,
  mouthClosed: 0.03,
  mouthOpen: 0.38,
  calibrated: false,
};

export type CalibStep = "neutral" | "left" | "right" | "mouth" | "done";
export const CALIB_STEPS: Exclude<CalibStep, "done">[] = ["neutral", "left", "right", "mouth"];

export type CalibHint = "no-face" | "hold-still" | "close-mouth" | "other-way" | "a-bit-more" | "hold" | null;

export interface CalibSample {
  roll: number;
  yaw: number;
  mouth: number;
}

/**
 * What this player actually showed the camera, step by step. A step that was
 * skipped stays null, so nothing downstream can present a default as theirs.
 */
export interface CalibMeasured {
  /** Typical tilt (degrees) held toward each shoulder. */
  left: number | null;
  right: number | null;
  /** Mouth ratio (inner-lip gap / eye distance) relaxed and wide open. */
  mouthClosed: number | null;
  mouthOpen: number | null;
}

/** Minimum tilt (degrees) that counts as a deliberate tilt. */
export const TILT_TARGET = 7;
/** Extra mouth opening (ratio) that counts as a deliberate open mouth. */
export const MOUTH_TARGET = 0.12;

const NEUTRAL_HOLD = 1.2;
const TILT_HOLD = 0.6;
const MOUTH_HOLD = 0.45;

/** Which held tilt counts as "how far you tilt": the 70th percentile of the frames past TILT_TARGET. */
export const TILT_PERCENTILE = 0.7;
/** Which wide-open mouth counts as "how wide you open": the 80th percentile. */
export const MOUTH_PERCENTILE = 0.8;

export const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const percentile = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The tilt that gives full steering, from the tilt a player comfortably holds: a little less, within 8 to 24 degrees. */
export const reachFor = (held: number) => clamp(held * 0.85, 8, 24);

export class Calibrator {
  step: CalibStep = "neutral";
  /** 0..1 progress through the current step. */
  progress = 0;
  hint: CalibHint = "no-face";
  /** Live tilt relative to the measured neutral (+ = player's right), for the UI. */
  liveTilt = 0;
  /** Live mouth opening relative to neutral, 0..1, for the UI. */
  liveMouth = 0;
  /** Seconds spent in the current step (lets the UI offer a skip). */
  stepTime = 0;
  /** Raw measurements from the steps that were completed (not skipped). */
  readonly measured: CalibMeasured = { left: null, right: null, mouthClosed: null, mouthOpen: null };

  private readonly profile: CalibrationProfile = { ...DEFAULT_PROFILE };
  private window: CalibSample[] = [];
  private collected: CalibSample[] = [];
  private extremes: number[] = [];

  /** Advance with one tracking frame (null = no face). Returns the step that just completed, if any. */
  feed(sample: CalibSample | null, dt: number): CalibStep | null {
    if (this.step === "done") return null;
    this.stepTime += dt;
    switch (this.step) {
      case "neutral":
        return this.feedNeutral(sample, dt);
      case "left":
      case "right":
        return this.feedTilt(sample, dt, this.step);
      case "mouth":
        return this.feedMouth(sample, dt);
    }
  }

  /** Skip the current step and keep the default value for it. */
  skip(): CalibStep | null {
    if (this.step === "done") return null;
    const skipped = this.step;
    if (skipped === "neutral" && this.collected.length > 5) {
      this.finishNeutral();
    }
    this.advance();
    return skipped;
  }

  result(): CalibrationProfile {
    return { ...this.profile, calibrated: true };
  }

  private advance() {
    const order: CalibStep[] = ["neutral", "left", "right", "mouth", "done"];
    this.step = order[order.indexOf(this.step) + 1] ?? "done";
    this.progress = 0;
    this.stepTime = 0;
    this.window = [];
    this.extremes = [];
    this.hint = null;
  }

  private decay(dt: number, seconds: number) {
    this.progress = Math.max(0, this.progress - dt / seconds);
  }

  private feedNeutral(s: CalibSample | null, dt: number): CalibStep | null {
    if (!s) {
      this.hint = "no-face";
      this.decay(dt, 0.5);
      if (this.progress === 0) this.collected = [];
      return null;
    }
    this.window.push(s);
    if (this.window.length > 15) this.window.shift();
    const rolls = this.window.map((w) => w.roll);
    const spread = Math.max(...rolls) - Math.min(...rolls);
    const mouthOpen = s.mouth > 0.2;
    const steady = this.window.length >= 5 && spread < 3.5 && !mouthOpen;

    if (steady) {
      this.hint = "hold";
      this.collected.push(s);
      this.progress = Math.min(1, this.progress + dt / NEUTRAL_HOLD);
    } else {
      this.hint = mouthOpen ? "close-mouth" : "hold-still";
      this.decay(dt, 0.8);
      if (this.progress === 0) this.collected = [];
    }

    if (this.progress >= 1) {
      this.finishNeutral();
      this.advance();
      return "neutral";
    }
    return null;
  }

  private finishNeutral() {
    this.profile.neutralRoll = median(this.collected.map((c) => c.roll));
    this.profile.neutralYaw = median(this.collected.map((c) => c.yaw));
    this.measured.mouthClosed = median(this.collected.map((c) => c.mouth));
    this.profile.mouthClosed = clamp(this.measured.mouthClosed, 0, 0.2);
    this.profile.mouthOpen = Math.max(this.profile.mouthOpen, this.profile.mouthClosed + 0.2);
  }

  private feedTilt(s: CalibSample | null, dt: number, dir: "left" | "right"): CalibStep | null {
    if (!s) {
      this.hint = "no-face";
      this.decay(dt, 0.6);
      return null;
    }
    // + = player's right (see face-metrics: raw roll is + when tilting to their left).
    const tilt = -(s.roll - this.profile.neutralRoll);
    this.liveTilt = tilt;
    const signed = dir === "left" ? -tilt : tilt;

    if (signed >= TILT_TARGET) {
      this.hint = "hold";
      this.extremes.push(signed);
      this.progress = Math.min(1, this.progress + dt / TILT_HOLD);
    } else {
      this.hint = signed <= -TILT_TARGET ? "other-way" : signed > 2.5 ? "a-bit-more" : null;
      this.decay(dt, 1.2);
    }

    if (this.progress >= 1) {
      const held = percentile(this.extremes, TILT_PERCENTILE);
      const reach = reachFor(held);
      this.measured[dir] = held;
      if (dir === "left") this.profile.rangeLeft = reach;
      else this.profile.rangeRight = reach;
      this.advance();
      return dir;
    }
    return null;
  }

  private feedMouth(s: CalibSample | null, dt: number): CalibStep | null {
    if (!s) {
      this.hint = "no-face";
      this.decay(dt, 0.6);
      return null;
    }
    const closed = this.profile.mouthClosed;
    const delta = s.mouth - closed;
    this.liveMouth = clamp(delta / 0.3, 0, 1);

    if (delta >= MOUTH_TARGET) {
      this.hint = "hold";
      this.extremes.push(s.mouth);
      this.progress = Math.min(1, this.progress + dt / MOUTH_HOLD);
    } else {
      this.hint = delta > MOUTH_TARGET * 0.4 ? "a-bit-more" : null;
      this.decay(dt, 1);
    }

    if (this.progress >= 1) {
      this.measured.mouthOpen = percentile(this.extremes, MOUTH_PERCENTILE);
      this.profile.mouthOpen = Math.max(closed + 0.14, this.measured.mouthOpen);
      this.advance();
      return "mouth";
    }
    return null;
  }
}
