import { median, percentile, reachFor, TILT_PERCENTILE, TILT_TARGET } from "./calibration";

/** One tracking frame, as far as the stats care. Tilt is in degrees from the visitor's neutral, + = their right. */
export interface FaceSample {
  t: number;
  hasFace: boolean;
  /** Smoothed tilt (what steers). */
  tilt: number;
  /** The same tilt before smoothing. */
  tiltRaw: number;
  /** Mouth ratio: inner-lip gap / eye distance. */
  mouth: number;
  /** Past the jump line this frame. */
  mouthOpen: boolean;
}

/** A few seconds of the visitor's own tilt, before and after the 1€ filter. */
export interface TiltTrace {
  /** Seconds from the first frame. */
  t: number[];
  raw: number[];
  smooth: number[];
}

export interface FaceStatsSummary {
  /** Typical tilt held toward each shoulder, degrees (null: never tilted that way). */
  left: number | null;
  right: number | null;
  /** Typical mouth ratio at the top of a jump (null: never jumped with the mouth). */
  mouthOpen: number | null;
  jumps: number;
  trace: TiltTrace | null;
}

/** Enough frames past the target (~0.2 s at 30 fps) to say how far someone tilts. */
const MIN_TILT_FRAMES = 6;
/** Keep the most recent frames only, so a long game never grows memory. */
const MAX_FRAMES = 900;
/** Length of the smoothing trace: about three seconds of tracking. */
const TRACE_FRAMES = 90;
/** A shorter trace is still worth showing if that is all there is. */
const MIN_TRACE_FRAMES = 30;

const push = (xs: number[], v: number) => {
  xs.push(v);
  if (xs.length > MAX_FRAMES) xs.shift();
};

/**
 * What this visitor actually did with their face while playing: how far they
 * tilt each way, how wide they open their mouth to jump, and a short trace of
 * raw against smoothed tilt. Memory only; the session drops it on Next player.
 *
 * Practice uses it in place of the old tilt calibration steps: the tilt
 * someone holds there sets their steering range with the same rule the
 * calibrator used (reachFor), so nobody has to sit through four poses first.
 */
export class FaceStats {
  private left: number[] = [];
  private right: number[] = [];
  private peaks: number[] = [];
  private peak = 0;
  private open = false;
  private window: { t: number; raw: number; smooth: number }[] = [];
  private kept: { t: number; raw: number; smooth: number }[] | null = null;

  feed(s: FaceSample) {
    if (!s.hasFace) {
      this.endJump();
      this.window = [];
      return;
    }
    if (s.tilt <= -TILT_TARGET) push(this.left, -s.tilt);
    else if (s.tilt >= TILT_TARGET) push(this.right, s.tilt);

    if (s.mouthOpen) {
      this.open = true;
      this.peak = Math.max(this.peak, s.mouth);
    } else if (this.open) {
      this.endJump();
    }

    this.window.push({ t: s.t, raw: s.tiltRaw, smooth: s.tilt });
    if (this.window.length > TRACE_FRAMES) this.window.shift();
    if (this.window.length === TRACE_FRAMES) this.kept = this.window.slice();
  }

  private endJump() {
    if (this.open && this.peak > 0) push(this.peaks, this.peak);
    this.open = false;
    this.peak = 0;
  }

  /** Typical tilt held toward one shoulder, the way calibration measured it, or null. */
  held(side: "left" | "right"): number | null {
    const xs = side === "left" ? this.left : this.right;
    return xs.length >= MIN_TILT_FRAMES ? percentile(xs, TILT_PERCENTILE) : null;
  }

  /** The steering range this visitor's tilt suggests for one side, or null to keep the current one. */
  reach(side: "left" | "right"): number | null {
    const held = this.held(side);
    return held === null ? null : reachFor(held);
  }

  summary(): FaceStatsSummary {
    const peaks = this.open && this.peak > 0 ? [...this.peaks, this.peak] : this.peaks;
    const frames = this.kept ?? (this.window.length >= MIN_TRACE_FRAMES ? this.window : null);
    const t0 = frames?.[0]?.t ?? 0;
    return {
      left: this.held("left"),
      right: this.held("right"),
      mouthOpen: peaks.length ? median(peaks) : null,
      jumps: peaks.length,
      trace: frames
        ? { t: frames.map((f) => (f.t - t0) / 1000), raw: frames.map((f) => f.raw), smooth: frames.map((f) => f.smooth) }
        : null,
    };
  }

  reset() {
    this.left = [];
    this.right = [];
    this.peaks = [];
    this.peak = 0;
    this.open = false;
    this.window = [];
    this.kept = null;
  }
}
