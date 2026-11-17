import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { LENSES, wrapLens } from "./lenses";
import { bounds, centroid, edgeLines } from "./geometry";
import { FrameGesture, type FrameState, type GestureEvent, type RawHand } from "./gesture";
import { Overlay } from "./overlay";
import { Renderer } from "./renderer";
import type { EngineStore } from "./store";
import type { HandTracker } from "./tracker";

export type Fit = "cover" | "contain";

export interface EngineOptions {
  video: HTMLVideoElement;
  glCanvas: HTMLCanvasElement;
  overlayCanvas: HTMLCanvasElement;
  tracker: HandTracker;
  store: EngineStore;
  mirror: boolean;
  fit: Fit;
  lens?: number;
  /** Start with the hand skeleton ("Show what the AI sees") on. */
  skeleton?: boolean;
}

/** The GL layer is resolution-bound by the 720p camera — cap it. Chrome stays crisp at full DPR. */
const GL_DPR_CAP = 1.5;
const UI_DPR_CAP = 2;
const TRANSITION_S = 0.42;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** Number of lenses set in a bit mask (lens i ↔ bit i). */
const countBits = (mask: number) => {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n++;
  return n;
};

/**
 * Frame-locked pipeline. For every new camera frame, in one rendering step:
 *
 *   requestVideoFrameCallback ─▶ detectForVideo(video) ─▶ gesture/1€ ─▶ texSubImage2D(video) ─▶ draw
 *
 * Inference and texture upload read the *same* frame, so the lens mask can
 * never lag the image. rVFC fires right before rAF in the same frame, so
 * there's no extra frame of latency; between camera frames we only redraw
 * for animations (fades, wipes, ripples).
 *
 * Changes from the original: no capture to disk (the booth never saves
 * pictures of visitors), prefers-reduced-motion freezes decorative motion,
 * and the engine counts what the "How it works" reveal reports.
 */
export class ViewfinderEngine {
  private readonly video: HTMLVideoElement;
  private readonly tracker: HandTracker;
  private readonly store: EngineStore;
  private readonly renderer: Renderer;
  private readonly overlay: Overlay;
  private readonly glCanvas: HTMLCanvasElement;
  private readonly gesture = new FrameGesture();
  private readonly edges = new Float32Array(12);
  private readonly resizeObserver: ResizeObserver;
  private readonly motionQuery: MediaQueryList | null;

  private mirror: boolean;
  private fit: Fit;
  private skeleton: boolean;
  private lens: number;
  private prevLens: number;
  private lensChangedAt = -Infinity;
  private reducedMotion = false;
  private state: FrameState = { hands: [], locked: false, active: 0, quad: [], lockedFor: 0 };

  private cssW = 1;
  private cssH = 1;
  private running = false;
  private disposed = false;
  private raf = 0;
  private vfc = 0;
  private pendingFrame = false;
  private pendingMeta: VideoFrameCallbackMetadata | null = null;
  private lastVfcAt = -Infinity;
  private lastVideoTime = -1;
  private lastDraw = 0;
  /** performance.now() of the last frame with a hand in it (the booth's "nobody here" clock). */
  private lastHandAt = 0;
  private stats = { since: 0, frames: 0, inferSum: 0, latencySum: 0, latencyN: 0 };
  /** Whole-session counters for the reveal. `tried` is a bit mask of lenses seen in a locked frame. */
  private session = { frames: 0, hands: 0, locks: 0, tried: 0 };

  constructor(opts: EngineOptions) {
    this.video = opts.video;
    this.tracker = opts.tracker;
    this.store = opts.store;
    this.glCanvas = opts.glCanvas;
    this.mirror = opts.mirror;
    this.fit = opts.fit;
    this.skeleton = opts.skeleton ?? false;
    this.lens = wrapLens(opts.lens ?? 0);
    this.prevLens = this.lens;
    this.renderer = new Renderer(opts.glCanvas);
    try {
      this.overlay = new Overlay(opts.overlayCanvas);
    } catch (err) {
      this.renderer.dispose();
      throw err;
    }

    this.motionQuery = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    this.reducedMotion = this.motionQuery?.matches ?? false;
    this.motionQuery?.addEventListener("change", this.onMotionChange);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(opts.glCanvas);
    this.resize();

    this.store.update({
      lens: this.lens,
      delegate: this.tracker.delegate,
      bench: this.tracker.timings,
      mirror: this.mirror,
      skeleton: this.skeleton,
      locked: false,
      hands: 0,
    });
  }

  start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.stats.since = performance.now();
    this.lastHandAt = performance.now();
    if (typeof this.video.requestVideoFrameCallback === "function") {
      this.vfc = this.video.requestVideoFrameCallback(this.onVideoFrame);
    }
    this.raf = requestAnimationFrame(this.onAnimationFrame);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (typeof this.video.cancelVideoFrameCallback === "function") this.video.cancelVideoFrameCallback(this.vfc);
    this.resizeObserver.disconnect();
    this.motionQuery?.removeEventListener("change", this.onMotionChange);
    this.renderer.dispose();
    this.overlay.dispose();
  }

  // ───────────────────────────── controls

  setLens(index: number) {
    const next = wrapLens(index);
    if (next === this.lens) return;
    this.prevLens = this.lens;
    this.lens = next;
    this.lensChangedAt = performance.now() / 1000;
    if (this.state.locked) this.session.tried |= 1 << next;
    this.store.update({ lens: next, lensesTried: countBits(this.session.tried) });
  }

  stepLens(delta: number) {
    this.setLens(this.lens + delta);
  }

  setMirror(mirror: boolean) {
    this.mirror = mirror;
    this.gesture.reset();
    this.store.update({ mirror });
  }

  setSkeleton(skeleton: boolean) {
    this.skeleton = skeleton;
    this.store.update({ skeleton });
  }

  setFit(fit: Fit) {
    this.fit = fit;
  }

  /** Milliseconds since a hand was last in the picture (counts from start()). */
  handsAbsentFor(now = performance.now()) {
    return now - this.lastHandAt;
  }

  /** Exact session counters right now (the store only receives them twice a second). */
  sessionCounts() {
    return {
      framesTracked: this.session.frames,
      handsFound: this.session.hands,
      locks: this.session.locks,
      lensesTried: countBits(this.session.tried),
    };
  }

  // ───────────────────────────── loop

  private onMotionChange = (e: MediaQueryListEvent) => {
    this.reducedMotion = e.matches;
  };

  private onVideoFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
    if (!this.running) return;
    this.pendingFrame = true;
    this.pendingMeta = meta;
    this.lastVfcAt = performance.now();
    this.vfc = this.video.requestVideoFrameCallback(this.onVideoFrame);
  };

  private onAnimationFrame = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.onAnimationFrame);
    this.tick(now);
  };

  private tick(now: number) {
    const video = this.video;
    const t = now / 1000;
    // If rVFC is unsupported or silent (e.g. element not composited), fall back to polling currentTime.
    const vfcAlive = now - this.lastVfcAt < 1000;
    const fresh = this.pendingFrame || (!vfcAlive && video.currentTime !== this.lastVideoTime);

    if (fresh && video.readyState >= 2 && video.videoWidth > 0) {
      this.pendingFrame = false;
      this.lastVideoTime = video.currentTime;
      const meta = this.pendingMeta;
      this.pendingMeta = null;
      const rect = this.videoRect();

      // 1 · inference on this exact frame
      const t0 = performance.now();
      let result: HandLandmarkerResult | null = null;
      try {
        result = this.tracker.detect(video, t0);
      } catch (err) {
        console.error("[viewfinder] detect failed", err);
      }
      const inferMs = performance.now() - t0;

      // 2 · gesture interpretation
      const events: GestureEvent[] = [];
      const raw = result ? this.toRaw(result, rect) : [];
      this.state = this.gesture.update(raw, t, { w: this.cssW, h: this.cssH }, events);
      this.handle(events, t);

      // 3 · same frame to the GPU, then composite
      this.renderer.upload(video);
      this.draw(t, rect);

      this.stats.frames++;
      this.stats.inferSum += inferMs;
      if (meta?.captureTime) {
        this.stats.latencySum += performance.now() - meta.captureTime;
        this.stats.latencyN++;
      }
      this.session.frames++;
      this.session.hands += this.state.hands.length;
      if (this.state.hands.length > 0) this.lastHandAt = performance.now();
    } else if (now - this.lastDraw >= 15) {
      // Between camera frames: keep animations smooth (≤ ~60 Hz), image unchanged.
      this.state = { ...this.state, active: this.gesture.animate(t) };
      this.draw(t, this.videoRect());
    }

    this.flushStats(now);
  }

  private handle(events: GestureEvent[], t: number) {
    for (const e of events) {
      if (e.type === "lock") {
        this.session.locks++;
        this.session.tried |= 1 << this.lens;
        this.store.update({
          locked: true,
          everLocked: true,
          locks: this.session.locks,
          lensesTried: countBits(this.session.tried),
        });
      } else if (e.type === "unlock") {
        this.store.update({ locked: false });
      } else if (e.type === "pinch") {
        // Screen-right hand → next lens, screen-left hand → previous.
        this.stepLens(e.slot === "right" ? 1 : -1);
        this.overlay.ripple(e.at, LENSES[this.lens].accent, t);
        this.store.update({ pinches: this.store.getSnapshot().pinches + 1 });
      }
    }
  }

  private draw(t: number, rect: { x: number; y: number; w: number; h: number }) {
    const s = this.state;
    const quad = s.quad;
    if (quad.length >= 3) edgeLines(quad, this.renderer.dpr, this.edges);
    // Reduced motion: lenses switch without the scan wipe, and shader time
    // stands still (no film-grain flicker, no animated noise or glitching).
    const mix = this.reducedMotion ? 1 : Math.min(1, Math.max(0, (t - this.lensChangedAt) / TRANSITION_S));

    this.renderer.draw({
      videoRect: rect,
      mirror: this.mirror,
      edges: this.edges,
      center: quad.length ? centroid(quad) : { x: 0, y: 0 },
      box: quad.length ? bounds(quad) : { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      active: quad.length >= 3 ? s.active : 0,
      time: this.reducedMotion ? 0 : t,
      lens: this.lens,
      prevLens: this.prevLens,
      mix: easeOutCubic(mix),
    });

    const lens = LENSES[this.lens];
    this.overlay.draw({
      state: s,
      lensIndex: this.lens,
      lensName: lens.name,
      accent: lens.accent,
      time: t,
      showSkeleton: this.skeleton,
      reducedMotion: this.reducedMotion,
    });

    this.lastDraw = performance.now();
  }

  private flushStats(now: number) {
    const elapsed = now - this.stats.since;
    if (elapsed < 500) return;
    const { frames, inferSum, latencySum, latencyN } = this.stats;
    this.store.update({
      fps: Math.round((frames * 1000) / elapsed),
      inferenceMs: frames ? Math.round((inferSum / frames) * 10) / 10 : 0,
      latencyMs: latencyN ? Math.round(latencySum / latencyN) : null,
      hands: this.state.hands.length,
      framesTracked: this.session.frames,
      handsFound: this.session.hands,
    });
    this.stats = { since: now, frames: 0, inferSum: 0, latencySum: 0, latencyN: 0 };
  }

  // ───────────────────────────── geometry

  private resize() {
    if (this.disposed) return;
    const rect = this.glCanvas.getBoundingClientRect();
    this.cssW = Math.max(1, rect.width);
    this.cssH = Math.max(1, rect.height);
    const dpr = window.devicePixelRatio || 1;
    this.renderer.resize(this.cssW, this.cssH, Math.min(dpr, GL_DPR_CAP));
    this.overlay.resize(this.cssW, this.cssH, Math.min(dpr, UI_DPR_CAP));
    // Resizing clears both canvases; repaint now so rotation/fullscreen never flashes black.
    if (this.running) this.draw(performance.now() / 1000, this.videoRect());
  }

  /** Where the video sits on screen (CSS px) for the current fit mode. */
  private videoRect() {
    const vw = this.video.videoWidth || 16;
    const vh = this.video.videoHeight || 9;
    const sx = this.cssW / vw;
    const sy = this.cssH / vh;
    const s = this.fit === "cover" ? Math.max(sx, sy) : Math.min(sx, sy);
    const w = vw * s;
    const h = vh * s;
    return { x: (this.cssW - w) / 2, y: (this.cssH - h) / 2, w, h };
  }

  /** Normalised landmarks → display space (mirrored like the image). */
  private toRaw(result: HandLandmarkerResult, rect: { x: number; y: number; w: number; h: number }): RawHand[] {
    return result.landmarks.map((lms) => ({
      points: lms.map((l) => ({ x: rect.x + (this.mirror ? 1 - l.x : l.x) * rect.w, y: rect.y + l.y * rect.h })),
      depth: lms.map((l) => l.z * rect.w),
    }));
  }
}
