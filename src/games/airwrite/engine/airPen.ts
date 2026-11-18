/**
 * AirPen turns raw hand landmarks into pen strokes.
 *
 *  landmarks ─► mirror + map into the "writing zone" ─► One Euro smoothing
 *            └► pinch ratio ─► hysteresis + debounce ─► pen up / pen down
 *
 * It also handles the awkward real-world bits: a settle period when a hand
 * first appears, trimming the little hook a pinch leaves on the end of a
 * stroke, breaking strokes on tracking teleports, and ending strokes cleanly
 * when the hand leaves the frame.
 */
import { PointFilter } from "./oneEuro";
import { Debounced, LM, PinchDetector, isOpenPalm, palmCenter, palmSize, pinchRatio, type Landmark } from "./gesture";
import type { StrokeSink } from "./strokes";

export interface PenSettings {
  /** 0..1 - higher means less hand movement covers the whole canvas. */
  sensitivity: number;
  /** 0..1 - higher means steadier but slightly laggier lines. */
  smoothing: number;
  /** 0..1 - higher means the pinch triggers with fingers further apart. */
  pinch: number;
  /** Centre of the writing zone in (mirrored) camera coordinates. */
  center: { x: number; y: number };
}

export const DEFAULT_SETTINGS: PenSettings = {
  sensitivity: 0,
  smoothing: 0.5,
  pinch: 0.5,
  center: { x: 0.5, y: 0.5 },
};

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Eraser {
  x: number;
  y: number;
  /** Radius in canvas-height units. */
  r: number;
  /** False while the palm is open but hasn't wiped yet. */
  active: boolean;
}

export interface PenFrame {
  handVisible: boolean;
  penDown: boolean;
  settling: boolean;
  /** Open palm detected: eraser mode. */
  palm: boolean;
  eraser: Eraser | null;
  /** Smoothed fingertip on the canvas (0..1), or null when no hand. */
  cursor: { x: number; y: number } | null;
  pinchRatio: number | null;
  /** Writing zone in mirrored camera coordinates (for the preview overlay). */
  region: Region;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const TIMING = {
  /** Debounce for pinch (pen lift) and release (pen down). */
  debounceMs: 60,
  /** Pen stays up this long after a hand appears so the entry swoop isn't drawn. */
  settleMs: 260,
  /** Brief tracking dropouts shorter than this don't break the stroke. */
  lossTimeoutMs: 180,
  /** Never trim more than this from the end of a stroke on pinch. */
  maxTrimMs: 220,
  /** Movement below this (canvas units) is not recorded as a new point. */
  minStep: 0.0012,
  /** A jump larger than this in one frame is a tracking glitch: break the stroke. */
  teleport: 0.28,
  /** Palm must stay open this long to enter eraser mode, closed this long to leave. */
  palmOnMs: 120,
  palmOffMs: 160,
  /** Horizontal palm travel (canvas widths) within the window that counts as a wipe. */
  wipeTravel: 0.14,
  wipeWindowMs: 700,
};

export function pinchThresholds(pinch: number) {
  const enter = lerp(0.18, 0.42, clamp(pinch, 0, 1));
  return { enter, exit: enter + 0.12 };
}

export function filterParams(smoothing: number) {
  const s = clamp(smoothing, 0, 1);
  return { minCutoff: lerp(3.2, 0.7, s), beta: lerp(14, 4, s) };
}

export class AirPen {
  private sink: StrokeSink;
  private settings: PenSettings;
  private filter: PointFilter;
  private pinch: PinchDetector;
  private videoAspect = 16 / 9;
  private canvasAspect = 16 / 9;
  private enabled = true;

  private handVisible = false;
  private penDown = false;
  private acquiredAt = 0;
  private lostSince: number | null = null;
  private closingSince: number | null = null;
  private last: { x: number; y: number } | null = null;
  private cursor: { x: number; y: number } | null = null;
  private lastRatio: number | null = null;
  private lastRawTip: { x: number; y: number } | null = null;

  private palm = new Debounced(TIMING.palmOnMs, TIMING.palmOffMs);
  private palmFilter = new PointFilter(2, 6);
  private eraser: Eraser | null = null;
  private wiping = false;
  private palmTrail: { x: number; y: number; t: number }[] = [];
  /** Settle again after the palm closes, so the hand's re-shaping isn't drawn. */
  private resumeAt = 0;

  constructor(sink: StrokeSink, settings: PenSettings = DEFAULT_SETTINGS) {
    this.sink = sink;
    this.settings = { ...settings, center: { ...settings.center } };
    const f = filterParams(settings.smoothing);
    this.filter = new PointFilter(f.minCutoff, f.beta);
    this.pinch = new PinchDetector({ ...pinchThresholds(settings.pinch), debounceMs: TIMING.debounceMs });
  }

  setSettings(settings: PenSettings) {
    this.settings = { ...settings, center: { ...settings.center } };
    const f = filterParams(settings.smoothing);
    this.filter.configure(f.minCutoff, f.beta);
    this.pinch.config = { ...pinchThresholds(settings.pinch), debounceMs: TIMING.debounceMs };
  }

  setAspects(videoAspect: number, canvasAspect: number) {
    if (videoAspect > 0 && Number.isFinite(videoAspect)) this.videoAspect = videoAspect;
    if (canvasAspect > 0 && Number.isFinite(canvasAspect)) this.canvasAspect = canvasAspect;
  }

  /** While disabled (e.g. result sheet open) the cursor still tracks but nothing is drawn. */
  setEnabled(enabled: boolean, tMs = performance.now()) {
    this.enabled = enabled;
    if (!enabled && this.penDown) this.liftPen(tMs);
    if (!enabled) this.stopWiping();
  }

  private stopWiping() {
    if (this.wiping) this.sink.eraseEnd();
    this.wiping = false;
    this.palmTrail = [];
  }

  /**
   * The writing zone: the part of the camera image that maps onto the canvas.
   * At the default sensitivity (0) it holds the whole camera picture, so the
   * pen works wherever the camera sees the hand and letters are never cut off
   * at an edge. Higher sensitivity zooms in on a smaller zone. The scale is the
   * same on both axes, so letters keep the shape they were written in.
   */
  region(): Region {
    const zoom = lerp(1, 0.4, clamp(this.settings.sensitivity, 0, 1));
    // Smallest canvas-shaped rectangle that holds the whole picture
    // (in camera units, h = w * videoAspect / canvasAspect).
    const ratio = this.canvasAspect / this.videoAspect;
    const w = (ratio >= 1 ? ratio : 1) * zoom;
    const h = (ratio >= 1 ? 1 : 1 / ratio) * zoom;
    // A zone wider (or taller) than the picture stays centred on it.
    const cx = w >= 1 ? 0.5 : clamp(this.settings.center.x, w / 2, 1 - w / 2);
    const cy = h >= 1 ? 0.5 : clamp(this.settings.center.y, h / 2, 1 - h / 2);
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  /** Current raw fingertip in mirrored camera space, used for calibration. */
  rawFingertip() {
    return this.lastRawTip ? { ...this.lastRawTip } : null;
  }

  /** Forget the hand entirely (camera stopped, page left). Ends any open stroke. */
  reset(tMs = performance.now()) {
    this.liftPen(tMs);
    this.stopWiping();
    this.palm.reset();
    this.palmFilter.reset();
    this.eraser = null;
    this.handVisible = false;
    this.cursor = null;
    this.lastRatio = null;
    this.lastRawTip = null;
    this.lostSince = null;
    this.closingSince = null;
    this.filter.reset();
    this.pinch.reset();
  }

  private liftPen(tMs: number, trimAfter?: number) {
    if (!this.penDown) return;
    this.sink.end(trimAfter !== undefined ? { trimAfter: Math.max(trimAfter, tMs - TIMING.maxTrimMs) } : {});
    this.penDown = false;
    this.last = null;
  }

  private frame(): PenFrame {
    return {
      handVisible: this.handVisible,
      penDown: this.penDown,
      settling: this.handVisible && !this.penDown && !this.palm.value && this.lastSettling,
      palm: this.handVisible && this.palm.value,
      eraser: this.handVisible && this.palm.value ? this.eraser : null,
      cursor: this.cursor,
      pinchRatio: this.lastRatio,
      region: this.region(),
    };
  }
  private lastSettling = false;

  update(landmarks: Landmark[] | null, tMs: number): PenFrame {
    if (!landmarks || landmarks.length < 21) {
      this.lostSince ??= tMs;
      if (this.handVisible && tMs - this.lostSince > TIMING.lossTimeoutMs) {
        // Tracking right before loss is unreliable; drop the last few frames.
        this.liftPen(tMs, this.lostSince - 40);
        this.stopWiping();
        this.palm.reset();
        this.palmFilter.reset();
        this.eraser = null;
        this.handVisible = false;
        this.cursor = null;
        this.lastRatio = null;
        this.lastRawTip = null;
        this.filter.reset();
        this.pinch.reset();
        this.closingSince = null;
      }
      return this.frame();
    }

    this.lostSince = null;
    if (!this.handVisible) {
      this.handVisible = true;
      this.acquiredAt = tMs;
      this.filter.reset();
      this.pinch.reset();
    }

    // Mirror horizontally so moving your hand right moves the pen right.
    const tip = landmarks[LM.INDEX_TIP];
    const raw = { x: 1 - tip.x, y: tip.y };
    this.lastRawTip = raw;

    const ratio = pinchRatio(landmarks, this.videoAspect);
    this.lastRatio = ratio;
    const flipped = this.pinch.update(ratio, tMs);
    if (ratio < this.pinch.config.exit) this.closingSince ??= tMs;
    else this.closingSince = null;

    const r = this.region();
    const toCanvas = (x: number, y: number) => ({
      x: clamp((x - r.x) / r.w, -0.02, 1.02),
      y: clamp((y - r.y) / r.h, -0.02, 1.02),
    });

    // ── Eraser: open palm, wiped side to side ────────────────
    const palmFlipped = this.palm.update(isOpenPalm(landmarks, this.videoAspect), tMs);
    if (this.palm.value) {
      if (this.penDown) this.liftPen(tMs, tMs - 120); // fingers opening drag the tip a little
      const c = palmCenter(landmarks);
      const m = toCanvas(1 - c.x, c.y);
      const pc = this.palmFilter.filter(m.x, m.y, tMs);
      const radius = clamp(((palmSize(landmarks, this.videoAspect) / r.h) * 0.62), 0.05, 0.17);
      this.cursor = null;

      this.palmTrail.push({ x: pc.x, y: pc.y, t: tMs });
      while (this.palmTrail.length && tMs - this.palmTrail[0].t > TIMING.wipeWindowMs) this.palmTrail.shift();

      if (this.enabled && !this.wiping) {
        let travel = 0;
        for (let i = 1; i < this.palmTrail.length; i++) travel += Math.abs(this.palmTrail[i].x - this.palmTrail[i - 1].x);
        if (travel >= TIMING.wipeTravel) {
          // Wipe recognised: erase along the whole swipe that triggered it.
          this.wiping = true;
          this.sink.eraseBegin();
          for (let i = 1; i < this.palmTrail.length; i++)
            this.sink.eraseSegment(this.palmTrail[i - 1], this.palmTrail[i], radius, this.canvasAspect);
        }
      } else if (this.enabled && this.wiping && this.eraser) {
        this.sink.eraseSegment(this.eraser, pc, radius, this.canvasAspect);
      }
      this.eraser = { x: pc.x, y: pc.y, r: radius, active: this.wiping };
      return this.frame();
    }
    if (palmFlipped) {
      // Palm just closed: finish erasing and let the hand settle before drawing.
      this.stopWiping();
      this.eraser = null;
      this.palmFilter.reset();
      this.filter.reset();
      this.resumeAt = tMs;
    }

    const mapped = toCanvas(raw.x, raw.y);
    const p = this.filter.filter(mapped.x, mapped.y, tMs);
    this.cursor = p;

    const settling = tMs - Math.max(this.acquiredAt, this.resumeAt) < TIMING.settleMs;
    this.lastSettling = settling;
    const wantDown = this.enabled && !this.pinch.pinched && !settling;

    if (this.penDown && !wantDown) {
      // A pinch pulls the index tip toward the thumb before it registers;
      // trim that approach so strokes don't end in a hook.
      const trimAfter = flipped && this.pinch.pinched ? (this.closingSince ?? tMs) - 50 : undefined;
      this.liftPen(tMs, trimAfter);
    } else if (!this.penDown && wantDown) {
      this.sink.begin({ x: p.x, y: p.y, t: tMs });
      this.penDown = true;
      this.last = p;
    } else if (this.penDown && this.last) {
      const step = Math.hypot((p.x - this.last.x) * this.canvasAspect, p.y - this.last.y);
      if (step > TIMING.teleport * this.canvasAspect) {
        this.sink.end();
        this.sink.begin({ x: p.x, y: p.y, t: tMs });
        this.last = p;
      } else if (step >= TIMING.minStep) {
        this.sink.add({ x: p.x, y: p.y, t: tMs });
        this.last = p;
      }
    }
    return this.frame();
  }
}
