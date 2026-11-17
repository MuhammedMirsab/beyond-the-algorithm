import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { settings, type Settings } from "../state/settings";
import { DEFAULT_PROFILE, type CalibrationProfile } from "./calibration";
import { computeMetrics, type FaceMetrics } from "./face-metrics";
import { OneEuroFilter } from "./one-euro";
import type { FaceTracker } from "./tracker";

export type TrackingStatus = "idle" | "searching" | "tracking" | "lost";

export type Guidance =
  | "ok"
  | "too-far"
  | "too-close"
  | "move-left"
  | "move-right"
  | "move-up"
  | "move-down"
  | "dark"
  | "no-face";

export interface ControlSnapshot {
  /** performance.now() of the frame. */
  t: number;
  status: TrackingStatus;
  hasFace: boolean;
  /** Smoothed raw metrics (see face-metrics.ts for sign conventions). */
  roll: number;
  yaw: number;
  mouth: number;
  /** Head tilt relative to the calibrated neutral, degrees, + = player's right. */
  tilt: number;
  /** Final steering value after range, sensitivity, dead zone and curve: -1 (left) .. 1 (right). */
  steer: number;
  /** Steering before the dead zone is applied (-1..1) — shows the needle moving inside the neutral zone. */
  steerRaw: number;
  /** Mouth opening relative to calibration: 0 = relaxed, 1 = the jump threshold. */
  mouthLevel: number;
  /** True while the mouth is past the jump threshold. */
  mouthOpen: boolean;
  /** True only on the frame a jump fired. */
  jumped: boolean;
  guidance: Guidance;
  /** Face box in mirrored (display) normalised coordinates. */
  box: FaceMetrics["box"] | null;
  /** Milliseconds since the face was last seen (0 while visible). */
  lostFor: number;
  /** Landmarks of the tracked face (raw, un-mirrored) for drawing overlays. */
  landmarks: NormalizedLandmark[] | null;
  /** Average model inference time (ms) and tracking rate (frames per second). */
  inferenceMs: number;
  fps: number;
  calibrated: boolean;
}

type Listener = (s: ControlSnapshot) => void;

/** Face missing for longer than this counts as "lost" (brief dropouts are ignored). */
const LOST_AFTER_MS = 400;
/** Minimum time between two jumps. */
const JUMP_COOLDOWN_MS = 260;
/** Detection is capped at ~32 Hz — more than any webcam delivers, cheaper on weak laptops. */
const MIN_INTERVAL_MS = 30;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Jump threshold as a fraction of this player's relaxed→wide-open range, per sensitivity level 1..5. */
const JUMP_FRACTION = [0.62, 0.52, 0.42, 0.34, 0.27];

/**
 * Mouth ratios where a jump fires (`openAt`) and where the trigger re-arms
 * (`releaseAt`, the hysteresis line), for this player's calibration.
 */
export function jumpThresholds(profile: Pick<CalibrationProfile, "mouthClosed" | "mouthOpen">, jumpSensitivity: number) {
  const span = Math.max(0.1, profile.mouthOpen - profile.mouthClosed);
  const frac = JUMP_FRACTION[clamp(Math.round(jumpSensitivity), 1, 5) - 1];
  return { openAt: profile.mouthClosed + frac * span, releaseAt: profile.mouthClosed + frac * 0.5 * span };
}

export class FaceController {
  status: TrackingStatus = "idle";
  profile: CalibrationProfile = { ...DEFAULT_PROFILE };
  last: ControlSnapshot;

  private video: HTMLVideoElement | null = null;
  private running = false;
  private rafId = 0;
  private rvfcId = 0;
  private timerId = 0;
  /** Frame scheduler: video frame callbacks → animation frames → plain timer (if the page stops painting). */
  private mode: "rvfc" | "raf" | "timer" = "raf";
  private lastFrameAt = 0;
  private lastDetect = 0;
  private lastVideoTime = -1;
  private watchdog = 0;

  private readonly rollF = new OneEuroFilter();
  private readonly yawF = new OneEuroFilter();
  private readonly mouthF = new OneEuroFilter();

  private prevCenter: { x: number; y: number } | null = null;
  private lastSeen = 0;
  private armed = true;
  private lastJump = -Infinity;
  private steerHold = 0;

  private infAvg = 0;
  private fpsCount = 0;
  private fpsWindowStart = 0;
  private fps = 0;
  private errors = 0;

  private lumaCanvas: HTMLCanvasElement | null = null;
  private luma = 1;
  private frameNo = 0;

  private readonly listeners = new Set<Listener>();
  private readonly jumpListeners = new Set<() => void>();
  private readonly errorListeners = new Set<(err: unknown) => void>();
  private cfg: Settings = settings.get();
  private readonly unsubSettings: () => void;

  constructor(private readonly tracker: FaceTracker) {
    this.last = this.emptySnapshot(performance.now());
    this.applySmoothing();
    this.unsubSettings = settings.subscribe((s) => {
      const smoothingChanged = s.smoothing !== this.cfg.smoothing;
      this.cfg = s;
      if (smoothingChanged) this.applySmoothing();
    });
  }

  get delegate() {
    return this.tracker.delegate;
  }

  onFrame(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onJump(fn: () => void) {
    this.jumpListeners.add(fn);
    return () => this.jumpListeners.delete(fn);
  }

  onError(fn: (err: unknown) => void) {
    this.errorListeners.add(fn);
    return () => this.errorListeners.delete(fn);
  }

  setProfile(profile: CalibrationProfile) {
    this.profile = { ...profile };
    this.armed = true;
  }

  start(video: HTMLVideoElement) {
    this.stop();
    this.video = video;
    this.running = true;
    this.status = "searching";
    this.lastSeen = 0;
    this.prevCenter = null;
    this.rollF.reset();
    this.yawF.reset();
    this.mouthF.reset();
    this.fpsWindowStart = performance.now();
    this.lastFrameAt = performance.now();
    this.mode = "requestVideoFrameCallback" in HTMLVideoElement.prototype ? "rvfc" : "raf";
    this.schedule();
    // If frame callbacks stall (the browser stopped presenting the video, or stopped painting
    // the page), step down to the next scheduler so tracking never silently freezes.
    this.watchdog = window.setInterval(() => {
      if (!this.running || document.hidden) return;
      if (performance.now() - this.lastFrameAt < 700) return;
      if (this.mode === "rvfc") this.mode = "raf";
      else if (this.mode === "raf") this.mode = "timer";
      else return;
      this.schedule();
    }, 500);
  }

  stop() {
    this.running = false;
    this.cancelScheduled();
    window.clearInterval(this.watchdog);
    this.status = "idle";
  }

  private cancelScheduled() {
    cancelAnimationFrame(this.rafId);
    window.clearTimeout(this.timerId);
    if (this.video && this.rvfcId) this.video.cancelVideoFrameCallback?.(this.rvfcId);
    this.rvfcId = 0;
  }

  dispose() {
    this.stop();
    this.unsubSettings();
    this.listeners.clear();
    this.jumpListeners.clear();
    this.errorListeners.clear();
  }

  /** Re-arms the jump trigger (used after overlays so a held-open mouth can't fire twice). */
  rearm(requireClose = true) {
    this.armed = !requireClose;
    this.lastJump = performance.now();
  }

  private applySmoothing() {
    const s = this.cfg.smoothing;
    this.rollF.minCutoff = lerp(3.2, 0.7, s);
    this.rollF.beta = lerp(0.09, 0.025, s);
    this.yawF.minCutoff = lerp(3.2, 0.7, s);
    this.yawF.beta = lerp(15, 4, s);
    this.mouthF.minCutoff = lerp(7, 2.5, s);
    this.mouthF.beta = lerp(5, 1.5, s);
  }

  private schedule() {
    if (!this.running || !this.video) return;
    this.cancelScheduled();
    const mode = this.mode;
    if (mode === "rvfc") this.rvfcId = this.video.requestVideoFrameCallback(() => this.tick(mode));
    else if (mode === "raf") this.rafId = requestAnimationFrame(() => this.tick(mode));
    else this.timerId = window.setTimeout(() => this.tick(mode), MIN_INTERVAL_MS);
  }

  private tick(from: "rvfc" | "raf" | "timer") {
    if (!this.running) return;
    if (from !== this.mode) return; // stale callback from a previous scheduler
    const video = this.video!;
    const now = performance.now();
    this.lastFrameAt = now;
    this.schedule();

    if (video.readyState < 2 || video.videoWidth === 0) return;
    if (from !== "rvfc" && video.currentTime === this.lastVideoTime) return;
    if (now - this.lastDetect < MIN_INTERVAL_MS) return;
    this.lastVideoTime = video.currentTime;
    this.lastDetect = now;

    let landmarks: NormalizedLandmark[][];
    const t0 = performance.now();
    try {
      landmarks = this.tracker.detect(video, now).faceLandmarks;
      this.errors = 0;
    } catch (err) {
      if (++this.errors === 15) this.errorListeners.forEach((fn) => fn(err));
      return;
    }
    const inf = performance.now() - t0;
    this.infAvg = this.infAvg ? lerp(this.infAvg, inf, 0.1) : inf;
    this.fpsCount++;
    if (now - this.fpsWindowStart >= 1000) {
      this.fps = (this.fpsCount * 1000) / (now - this.fpsWindowStart);
      this.fpsCount = 0;
      this.fpsWindowStart = now;
    }
    if (++this.frameNo % 20 === 1) this.sampleLuma(video);

    this.process(landmarks, video.videoWidth, video.videoHeight, now);
  }

  /** Picks the player's face: the biggest one, preferring the face we tracked last frame. */
  private pickFace(faces: NormalizedLandmark[][], w: number, h: number) {
    let best: { lms: NormalizedLandmark[]; m: FaceMetrics } | null = null;
    let bestScore = -Infinity;
    for (const lms of faces) {
      const m = computeMetrics(lms, w, h);
      if (!m) continue;
      let score = m.eyeDistPx;
      if (this.prevCenter) {
        const d = Math.hypot(m.box.cx - this.prevCenter.x, m.box.cy - this.prevCenter.y);
        score *= 1 - Math.min(0.6, d * 1.5);
      }
      if (score > bestScore) {
        bestScore = score;
        best = { lms, m };
      }
    }
    return best;
  }

  private process(faces: NormalizedLandmark[][], w: number, h: number, now: number) {
    const tSec = now / 1000;
    const face = this.pickFace(faces, w, h);
    const cfg = this.cfg;
    const p = this.profile;

    if (!face) {
      const lostFor = this.lastSeen ? now - this.lastSeen : Infinity;
      if (this.status === "tracking" && lostFor > LOST_AFTER_MS) this.status = "lost";
      // Brief dropouts: let steering fade instead of snapping to zero.
      this.steerHold *= 0.8;
      if (Math.abs(this.steerHold) < 0.02) this.steerHold = 0;
      const snap: ControlSnapshot = {
        ...this.last,
        t: now,
        status: this.status,
        hasFace: false,
        steer: this.status === "lost" ? 0 : this.steerHold,
        steerRaw: 0,
        mouthOpen: false,
        mouthLevel: 0,
        jumped: false,
        guidance: "no-face",
        lostFor: Number.isFinite(lostFor) ? lostFor : 0,
        landmarks: null,
        inferenceMs: this.infAvg,
        fps: this.fps,
        calibrated: p.calibrated,
      };
      this.emit(snap);
      return;
    }

    if (this.status !== "tracking") {
      // Re-acquired: restart filters so a stale value can't leak into the new pose.
      this.rollF.reset();
      this.yawF.reset();
      this.mouthF.reset();
    }
    this.status = "tracking";
    this.lastSeen = now;
    this.prevCenter = { x: face.m.box.cx, y: face.m.box.cy };

    const roll = this.rollF.filter(face.m.roll, tSec);
    const yaw = this.yawF.filter(face.m.yaw, tSec);
    const mouth = this.mouthF.filter(face.m.mouth, tSec);

    // --- Steering -------------------------------------------------------
    const tilt = -(roll - p.neutralRoll); // + = player's right
    const sens = cfg.steerSensitivity;
    let n = tilt / ((tilt >= 0 ? p.rangeRight : p.rangeLeft) / sens);
    if (cfg.steerMode === "tilt-turn") {
      const turn = -(yaw - p.neutralYaw);
      n += turn / (p.yawRange / sens);
    }
    n = clamp(n, -1, 1);
    const dz = cfg.deadZone;
    const mag = Math.abs(n) <= dz ? 0 : (Math.abs(n) - dz) / (1 - dz);
    const steer = Math.sign(n) * Math.pow(mag, 1.2);
    this.steerHold = steer;

    // --- Jump (threshold + hysteresis + cooldown) -------------------------
    const { openAt, releaseAt } = jumpThresholds(p, cfg.jumpSensitivity);
    const mouthLevel = clamp((mouth - p.mouthClosed) / (openAt - p.mouthClosed), 0, 1.6);
    const isOpen = mouth >= openAt;
    if (!this.armed && mouth <= releaseAt) this.armed = true;
    let jumped = false;
    if (this.armed && isOpen && now - this.lastJump >= JUMP_COOLDOWN_MS) {
      this.armed = false;
      this.lastJump = now;
      jumped = true;
    }

    const box = { ...face.m.box, cx: 1 - face.m.box.cx };
    const snap: ControlSnapshot = {
      t: now,
      status: "tracking",
      hasFace: true,
      roll,
      yaw,
      mouth,
      tilt,
      steer,
      steerRaw: n,
      mouthLevel,
      mouthOpen: isOpen,
      jumped,
      guidance: this.guidance(box),
      box,
      lostFor: 0,
      landmarks: face.lms,
      inferenceMs: this.infAvg,
      fps: this.fps,
      calibrated: p.calibrated,
    };
    this.emit(snap);
    if (jumped) this.jumpListeners.forEach((fn) => fn());
  }

  private guidance(box: FaceMetrics["box"]): Guidance {
    if (box.w > 0.62) return "too-close";
    if (box.w < 0.13) return "too-far";
    if (box.cx < 0.2) return "move-right";
    if (box.cx > 0.8) return "move-left";
    if (box.cy < 0.18) return "move-down";
    if (box.cy > 0.82) return "move-up";
    if (this.luma < 0.16) return "dark";
    return "ok";
  }

  /** Average brightness of the frame centre — lets us tell players when the room is too dark. */
  private sampleLuma(video: HTMLVideoElement) {
    try {
      if (!this.lumaCanvas) {
        this.lumaCanvas = document.createElement("canvas");
        this.lumaCanvas.width = 32;
        this.lumaCanvas.height = 18;
      }
      const ctx = this.lumaCanvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, 32, 18);
      const { data } = ctx.getImageData(8, 3, 16, 12);
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      this.luma = sum / (data.length / 4) / 255;
    } catch {
      this.luma = 1;
    }
  }

  private emit(s: ControlSnapshot) {
    this.last = s;
    this.listeners.forEach((fn) => fn(s));
  }

  private emptySnapshot(t: number): ControlSnapshot {
    return {
      t,
      status: "idle",
      hasFace: false,
      roll: 0,
      yaw: 0,
      mouth: 0,
      tilt: 0,
      steer: 0,
      steerRaw: 0,
      mouthLevel: 0,
      mouthOpen: false,
      jumped: false,
      guidance: "no-face",
      box: null,
      lostFor: 0,
      landmarks: null,
      inferenceMs: 0,
      fps: 0,
      calibrated: false,
    };
  }
}
