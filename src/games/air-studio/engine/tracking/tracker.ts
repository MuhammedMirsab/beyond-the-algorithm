import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { cameraIssueFrom, type CameraIssue } from "@/components/game/camera-notice";
import { settings } from "../settings";
import { openCamera, stopStream } from "./camera";
import { EMPTY_FRAME, HandSet, type FoundHand, type HandLabel, type TrackFrame } from "./hands";
import { acquireHandModel, type Delegate, type HandModel, type ModelLease } from "./landmarker";
import { playArea } from "./reach";
import { NO_STROKE, simHandPoints, startStroke, strokeStep, type SimAnchor, type Stroke } from "./sim-hand";

/**
 * Camera, hand model and simulated hands, copied from the original app's
 * tracker. Frames are pulled with requestVideoFrameCallback (each camera
 * frame once) and handed to listeners outside React; a requestAnimationFrame
 * loop takes over if frame callbacks go quiet, so tracking never freezes.
 *
 * Nothing here touches the browser until start() or startSim() is called.
 */

export type TrackerState =
  | { status: "off" }
  /** The browser's permission prompt may be open. */
  | { status: "waiting" }
  /** Camera is live; the hand model is downloading or starting. */
  | { status: "loading"; progress: number }
  | { status: "running"; delegate: Delegate }
  | { status: "error"; issue: CameraIssue }
  | { status: "sim" };

export interface TrackerMetrics {
  /** Frames the hand model processed in the last second. */
  fps: number;
  /** Average time per detection, ms. */
  inferMs: number;
  /** Share of the last 60 frames with at least one hand. */
  detectRate: number;
  handCount: number;
  /** Average brightness of the picture, 0 to 255. */
  brightness: number;
  /** 0 to 1, how often the hand count flickered recently. */
  jitter: number;
  delegate: Delegate | "Simulated" | null;
}

const OFF: TrackerState = { status: "off" };
/** If requestVideoFrameCallback goes quiet this long, the requestAnimationFrame loop takes over. */
const STALL_MS = 400;
/** Shown until the first second of simulated frames has been counted. */
const SIM_HZ = 60;


class HandTracker {
  private stateValue: TrackerState = OFF;
  private readonly hands = new HandSet();
  private readonly frameListeners = new Set<(f: TrackFrame) => void>();
  private readonly stateListeners = new Set<() => void>();
  private videoEl: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private track: MediaStreamTrack | null = null;
  private lease: ModelLease | null = null;
  private model: HandModel | null = null;
  /** Bumped on every start and stop, so late async results from an old run are dropped. */
  private run = 0;
  private rafId = 0;
  private vfcId = 0;
  private lastVideoTime = -1;
  private lastVfcAt = 0;
  private lastFrame: TrackFrame = EMPTY_FRAME;
  private detHist: number[] = [];
  private frameTimes: number[] = [];
  private lumCanvas: HTMLCanvasElement | null = null;
  private lastLum = 0;
  private simTimer = 0;
  private sim = { x: 0.6, y: 0.4, fist: false, leftY: -1, visible: false };
  /** A click's stroke: frame -1 none, 0 hide the hand, 1 top of the stroke, 2 on the way down since t0. */
  private simStroke: Stroke = NO_STROKE;
  /** Width / height of the camera picture, or of the stage when simulating. */
  aspect = 4 / 3;
  /** Width / height of the stage, for simulated hands. */
  simAspect = 4 / 3;
  /**
   * Which point of a pretend hand sits on the pointer: the index fingertip
   * (keys, pitch) or the palm (pads and strums, which play where the palm is).
   */
  simAnchor: SimAnchor = "tip";
  metrics: TrackerMetrics = { fps: 0, inferMs: 0, detectRate: 0, handCount: 0, brightness: 128, jitter: 0, delegate: null };

  /* ── Subscriptions ─────────────────────────────────────────────── */

  get state(): TrackerState {
    return this.stateValue;
  }

  onState = (fn: () => void) => {
    this.stateListeners.add(fn);
    return () => {
      this.stateListeners.delete(fn);
    };
  };

  getState = () => this.stateValue;

  /** Every processed frame (camera rate, or 60 per second simulated). Never set React state per frame. */
  onFrame(fn: (f: TrackFrame) => void) {
    this.frameListeners.add(fn);
    return () => {
      this.frameListeners.delete(fn);
    };
  }

  get frame(): TrackFrame {
    return this.lastFrame;
  }

  get simulating() {
    return this.stateValue.status === "sim";
  }

  get cameraOn() {
    const s = this.stateValue.status;
    return s === "waiting" || s === "loading" || s === "running";
  }

  /** The last few seconds of a fingertip's height, raw and smoothed (the right hand when both are seen). */
  trace(label?: HandLabel) {
    const pick = label ?? (this.hands.slots.Right.trace.length >= this.hands.slots.Left.trace.length ? "Right" : "Left");
    return [...this.hands.slots[pick].trace];
  }

  private setState(next: TrackerState) {
    this.stateValue = next;
    this.stateListeners.forEach((fn) => fn());
  }

  /** The one video element the camera plays into. The stage puts it on screen. */
  get video(): HTMLVideoElement {
    if (!this.videoEl) {
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.autoplay = true;
      v.setAttribute("aria-hidden", "true");
      this.videoEl = v;
    }
    return this.videoEl;
  }

  /* ── Camera ────────────────────────────────────────────────────── */

  /** Turns the camera on (or tries again). Resolves when it runs or fails; never throws. */
  async start(): Promise<void> {
    this.stopAll();
    const run = ++this.run;
    this.setState({ status: "waiting" });
    let stream: MediaStream;
    try {
      stream = await openCamera();
    } catch (err) {
      if (run === this.run) this.setState({ status: "error", issue: cameraIssueFrom(err) });
      return;
    }
    if (run !== this.run) {
      stopStream(stream);
      return;
    }
    this.stream = stream;
    const video = this.video;
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      // Muted playback is always allowed; a spurious abort here is harmless.
    }
    if (run !== this.run) return;
    const track = stream.getVideoTracks()[0] ?? null;
    this.track = track;
    track?.addEventListener("ended", this.onEnded);
    const s = track?.getSettings();
    if (s?.width && s?.height) this.aspect = s.width / s.height;

    const lease = acquireHandModel({ minConfidence: settings.get().tracking.minConfidence });
    this.lease = lease;
    this.setState({ status: "loading", progress: lease.progress() });
    const offProgress = lease.onProgress((progress) => {
      if (run === this.run && this.stateValue.status === "loading") this.setState({ status: "loading", progress });
    });
    let model: HandModel;
    try {
      model = await lease.promise;
    } catch (err) {
      offProgress();
      console.error("[air-studio] hand tracking failed to start", err);
      if (run === this.run) {
        this.stopAll();
        this.setState({ status: "error", issue: "model" });
      }
      return;
    }
    offProgress();
    if (run !== this.run) return;
    this.model = model;
    this.metrics = { ...this.metrics, delegate: model.delegate, fps: 0 };
    this.frameTimes = [];
    this.detHist = [];
    this.setState({ status: "running", delegate: model.delegate });
    this.loop(run, video);
  }

  /** Unplugged, or taken by another app, mid-session. */
  private onEnded = () => {
    this.stopAll();
    this.setState({ status: "error", issue: "stopped" });
  };

  private loop(run: number, video: HTMLVideoElement) {
    const hasVfc = typeof video.requestVideoFrameCallback === "function";
    this.lastVfcAt = performance.now();
    this.lastVideoTime = -1;
    const onVideoFrame = () => {
      if (run !== this.run) return;
      this.lastVfcAt = performance.now();
      this.process(video);
      this.vfcId = video.requestVideoFrameCallback(onVideoFrame);
    };
    const onAnimationFrame = () => {
      if (run !== this.run) return;
      if (!hasVfc || performance.now() - this.lastVfcAt > STALL_MS) this.process(video);
      this.rafId = requestAnimationFrame(onAnimationFrame);
    };
    if (hasVfc) this.vfcId = video.requestVideoFrameCallback(onVideoFrame);
    this.rafId = requestAnimationFrame(onAnimationFrame);
  }

  private process(video: HTMLVideoElement) {
    const model = this.model;
    if (!model || video.readyState < 2) return;
    if (video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;
    const now = performance.now();
    let res: HandLandmarkerResult | null = null;
    try {
      res = model.detect(video, now);
    } catch (err) {
      console.warn("[air-studio] hand detection failed", err);
      return;
    }
    if (!res) return;
    this.metrics.inferMs = this.metrics.inferMs * 0.9 + (performance.now() - now) * 0.1;
    if (video.videoWidth) this.aspect = video.videoWidth / video.videoHeight;
    const found: FoundHand[] = res.landmarks.map((lm, i) => {
      const cat = res.handedness[i]?.[0];
      return { label: this.hands.labelFor(cat?.categoryName), pts: lm.map((p) => ({ x: 1 - p.x, y: p.y })), score: cat?.score ?? 0 };
    });
    this.emit(this.hands.ingest(found, now, this.aspect, settings.get().tracking.smoothing));
    this.measure(now, video);
  }

  private emit(frame: TrackFrame) {
    this.lastFrame = frame;
    this.frameListeners.forEach((fn) => fn(frame));
  }

  private measure(now: number, video: HTMLVideoElement) {
    this.frameTimes.push(now);
    while (this.frameTimes.length && now - this.frameTimes[0] > 1000) this.frameTimes.shift();
    this.metrics.fps = this.frameTimes.length;
    const n = this.lastFrame.hands.length;
    this.metrics.handCount = n;
    this.detHist.push(n);
    if (this.detHist.length > 60) this.detHist.shift();
    this.metrics.detectRate = this.detHist.filter((x) => x > 0).length / this.detHist.length;
    let flips = 0;
    for (let i = 1; i < this.detHist.length; i++) if (this.detHist[i] !== this.detHist[i - 1]) flips++;
    this.metrics.jitter = Math.min(1, flips / 12);
    if (now - this.lastLum > 500) {
      this.lastLum = now;
      if (!this.lumCanvas) {
        this.lumCanvas = document.createElement("canvas");
        this.lumCanvas.width = 32;
        this.lumCanvas.height = 24;
      }
      const c = this.lumCanvas.getContext("2d", { willReadFrequently: true });
      if (c) {
        c.drawImage(video, 0, 0, 32, 24);
        const d = c.getImageData(0, 0, 32, 24).data;
        let s = 0;
        for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        this.metrics.brightness = s / (d.length / 4);
      }
    }
  }

  /** Stops the camera or simulation and forgets the hands. */
  stop() {
    this.stopAll();
    this.setState(OFF);
  }

  private stopAll() {
    this.run++;
    cancelAnimationFrame(this.rafId);
    const v = this.videoEl;
    if (this.vfcId && v && typeof v.cancelVideoFrameCallback === "function") v.cancelVideoFrameCallback(this.vfcId);
    this.vfcId = 0;
    this.track?.removeEventListener("ended", this.onEnded);
    this.track = null;
    stopStream(this.stream);
    this.stream = null;
    if (v) v.srcObject = null;
    this.lease?.release();
    this.lease = null;
    this.model = null;
    cancelAnimationFrame(this.simTimer);
    this.simTimer = 0;
    this.sim = { x: 0.6, y: 0.4, fist: false, leftY: -1, visible: false };
    this.simStroke = NO_STROKE;
    this.hands.clear();
    this.lastFrame = EMPTY_FRAME;
    this.frameTimes = [];
    this.detHist = [];
    this.metrics = { fps: 0, inferMs: 0, detectRate: 0, handCount: 0, brightness: 128, jitter: 0, delegate: null };
  }

  /* ── Simulated hands (mouse and keyboard) ──────────────────────── */

  startSim() {
    this.stopAll();
    const run = ++this.run;
    this.setState({ status: "sim" });
    this.metrics = { fps: SIM_HZ, inferMs: 0, detectRate: 1, handCount: 0, brightness: 140, jitter: 0, delegate: "Simulated" };
    // In step with the screen, like pointer events, so every tick sees exactly one pointer move
    // (a free-running timer drifts against them and makes speeds stutter).
    const tick = () => {
      if (run !== this.run) return;
      this.simTick();
      this.simTimer = requestAnimationFrame(tick);
    };
    this.simTimer = requestAnimationFrame(tick);
  }

  /** The mouse is the right hand (its fingertip or palm, see simAnchor), in stage coordinates (0 to 1). */
  simPointer(x: number, y: number) {
    this.sim.x = x;
    this.sim.y = y;
    this.sim.visible = true;
  }

  /**
   * A click or tap: the pretend hand comes down onto the pointer fast, so it
   * goes through the same strike detection as a real hand. It vanishes for
   * one frame first, so the jump up to the start of the stroke never reads
   * as an upward move (an up strum on the guitar).
   */
  simStrike(x: number, y: number) {
    this.sim.x = x;
    this.sim.y = y;
    this.sim.visible = true;
    // Sized for how fast this screen draws: at least two frames of movement.
    const fps = this.metrics.fps;
    this.simStroke = startStroke(fps > 0 ? 1000 / fps : 1000 / SIM_HZ);
  }

  simHide() {
    this.sim.visible = false;
    this.simStroke = NO_STROKE;
  }

  simFist(on: boolean) {
    this.sim.fist = on;
  }

  /** Keys 1 to 6 place the left hand at one of six heights in the play area; 0 hides it. */
  simLeftSlot(slot: number) {
    if (slot <= 0) {
      this.sim.leftY = -1;
      return;
    }
    const r = playArea();
    const slots = 6;
    this.sim.leftY = r.y0 + ((Math.min(slot, slots) - 0.5) / slots) * (r.y1 - r.y0);
  }

  get simState() {
    return this.sim;
  }

  private simTick() {
    const now = performance.now();
    const aspect = this.simAspect;
    // A click: gone for one frame, back at the top of the stroke, then straight down onto the pointer.
    const step = strokeStep(this.simStroke, now, this.sim.y);
    this.simStroke = step.stroke;
    const found: FoundHand[] = [];
    if (this.sim.visible && step.visible) found.push({ label: "Right", pts: simHandPoints(this.sim.x, step.y, this.sim.fist, aspect, this.simAnchor), score: 1 });
    if (this.sim.leftY >= 0) found.push({ label: "Left", pts: simHandPoints(0.22, this.sim.leftY, false, aspect, this.simAnchor), score: 1 });
    this.aspect = aspect;
    // Simulated hands share the whole feature pipeline with camera hands.
    this.emit(this.hands.ingest(found, now, aspect, settings.get().tracking.smoothing, false));
    this.metrics.handCount = found.length;
    this.frameTimes.push(now);
    while (this.frameTimes.length && now - this.frameTimes[0] > 1000) this.frameTimes.shift();
    this.metrics.fps = this.frameTimes.length;
  }
}

export const tracker = new HandTracker();
