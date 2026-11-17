/**
 * Camera + hand model + frame loop, as a small external store for React
 * (`useSyncExternalStore`). One instance per game mount.
 *
 * - One persistent <video> for the whole game. Views borrow it with
 *   `attachView`, so the feed never goes black when the screen changes (the
 *   original re-created the element and lost the stream).
 * - The model keeps loading while the browser asks for permission.
 * - The model is kept between visitors (it holds nothing about them); the
 *   camera is not.
 * - `dispose` stops the tracks, cancels the loop and closes the model. The
 *   instance can be started again afterwards (React StrictMode does that).
 *
 * Browser only: every method is called from effects or event handlers.
 */
import { cameraIssueFrom, type CameraIssue } from "@/components/game/camera-notice";
import type { ActiveBackend, CVFrameResult } from "../engine/types";
import { CameraManager } from "./cameraManager";
import { HandDetectionEngine, isDisposedError } from "./handDetectionEngine";

/** off → starting → (waiting, if the permission box stays open) → live, or error. */
export type CameraStatus = "off" | "starting" | "waiting" | "live" | "error";
export type ModelStatus = "idle" | "loading" | "ready" | "error";

export interface TrackerStatus {
  camera: CameraStatus;
  model: ModelStatus;
  issue: CameraIssue | null;
  backend: ActiveBackend | null;
}

export const INITIAL_TRACKER_STATUS: TrackerStatus = { camera: "off", model: "idle", issue: null, backend: null };

/** ~18 processed frames a second, like the original: smooth enough, easy on a booth laptop. */
const FRAME_INTERVAL_MS = 55;
/** Only say "Waiting for permission" if the browser's box is really open, not for a granted camera. */
const WAITING_DELAY_MS = 400;
/** Consecutive failing frames before the model is restarted (GPU) or given up on (CPU). */
const MAX_FRAME_ERRORS = 3;

type FrameListener = (frame: CVFrameResult) => void;

export class HandTracker {
  private status: TrackerStatus = INITIAL_TRACKER_STATUS;
  private readonly statusListeners = new Set<() => void>();
  private readonly frameListeners = new Set<FrameListener>();
  private camera: CameraManager | null = null;
  private engine: HandDetectionEngine | null = null;
  private video: HTMLVideoElement | null = null;
  /** Bumped by stop() and dispose(): callbacks from an older start() are ignored. */
  private generation = 0;
  private raf = 0;
  private lastFrameAt = 0;
  private frameErrors = 0;
  private waitingTimer: ReturnType<typeof setTimeout> | null = null;

  /* ── Store API ─────────────────────────────────────────────── */

  subscribe = (listener: () => void): (() => void) => {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  };

  getStatus = (): TrackerStatus => this.status;

  /** Every processed frame, about 18 a second while the camera and model run. */
  onFrame = (listener: FrameListener): (() => void) => {
    this.frameListeners.add(listener);
    return () => {
      this.frameListeners.delete(listener);
    };
  };

  private setStatus(patch: Partial<TrackerStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const listener of this.statusListeners) listener();
    this.syncLoop();
  }

  /* ── Camera and model ──────────────────────────────────────── */

  /** Turns the camera on and loads the model (in parallel). Safe to call again to retry. */
  start(): void {
    const generation = ++this.generation;
    this.clearWaitingTimer();
    this.setStatus({ camera: "starting", issue: null });

    this.loadModel(generation);

    const camera = (this.camera ??= new CameraManager());
    const video = this.ensureVideo();
    this.waitingTimer = setTimeout(() => {
      if (this.generation === generation && this.status.camera === "starting") this.setStatus({ camera: "waiting" });
    }, WAITING_DELAY_MS);

    camera
      .startCamera(video, {
        onTrackEnded: () => {
          // Unplugged or taken by another app mid-game.
          if (this.generation === generation) this.setStatus({ camera: "error", issue: "missing" });
        },
      })
      .then(() => {
        if (this.generation !== generation) {
          camera.stopCamera(video);
          return;
        }
        this.clearWaitingTimer();
        this.setStatus({ camera: "live" });
      })
      .catch((error: unknown) => {
        if (this.generation !== generation) return;
        this.clearWaitingTimer();
        this.setStatus({ camera: "error", issue: cameraIssueFrom(error) });
      });
  }

  private loadModel(generation: number): void {
    const engine = (this.engine ??= new HandDetectionEngine());
    if (engine.isReady()) {
      this.setStatus({ model: "ready", backend: engine.getBackend() });
      return;
    }
    this.setStatus({ model: "loading" });
    engine
      .initialize()
      .then((backend) => {
        if (this.generation === generation) this.setStatus({ model: "ready", backend });
      })
      .catch((error: unknown) => {
        if (isDisposedError(error) || this.generation !== generation) return;
        this.setStatus({ model: "error", issue: "model" });
      });
  }

  /** Camera off; the model stays loaded for the next visitor. */
  stop(): void {
    this.generation += 1;
    this.clearWaitingTimer();
    this.camera?.stopCamera(this.video);
    const ready = this.engine?.isReady() ?? false;
    this.setStatus({ camera: "off", issue: null, model: ready ? "ready" : "idle" });
  }

  dispose(): void {
    this.generation += 1;
    this.clearWaitingTimer();
    this.stopLoop();
    this.camera?.dispose(this.video);
    this.camera = null;
    this.engine?.dispose();
    this.engine = null;
    this.video?.remove();
    this.video = null;
    this.frameErrors = 0;
    this.setStatus(INITIAL_TRACKER_STATUS);
  }

  private clearWaitingTimer(): void {
    if (this.waitingTimer) clearTimeout(this.waitingTimer);
    this.waitingTimer = null;
  }

  /* ── The one video element ─────────────────────────────────── */

  private ensureVideo(): HTMLVideoElement {
    if (!this.video) {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("muted", "");
      video.setAttribute("aria-hidden", "true");
      video.className = "absolute inset-0 size-full object-cover";
      this.video = video;
    }
    return this.video;
  }

  /** Shows the video inside `host` until the returned function is called. */
  attachView(host: HTMLElement): () => void {
    const video = this.ensureVideo();
    host.appendChild(video);
    // Moving a <video> in the DOM pauses it.
    void video.play().catch(() => undefined);
    return () => {
      if (video.parentElement === host) host.removeChild(video);
    };
  }

  /** The video's own size, so an overlay canvas can match it. */
  getVideoSize(): { width: number; height: number } | null {
    const video = this.video;
    if (!video || video.videoWidth === 0) return null;
    return { width: video.videoWidth, height: video.videoHeight };
  }

  /* ── Frame loop ────────────────────────────────────────────── */

  private syncLoop(): void {
    const shouldRun = this.status.camera === "live" && this.status.model === "ready";
    if (shouldRun && !this.raf) {
      this.frameErrors = 0;
      this.lastFrameAt = 0;
      this.raf = requestAnimationFrame(this.tick);
    } else if (!shouldRun) {
      this.stopLoop();
    }
  }

  private stopLoop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private tick = (now: number): void => {
    this.raf = requestAnimationFrame(this.tick);
    if (now - this.lastFrameAt < FRAME_INTERVAL_MS) return;
    this.lastFrameAt = now;

    const video = this.video;
    const camera = this.camera;
    const engine = this.engine;
    // Nothing to read while no view shows the video (results screen) or it has no frame yet.
    if (!video || !camera || !engine || !video.isConnected || video.readyState < 2 || !engine.isReady()) return;

    let frame: CVFrameResult;
    try {
      frame = engine.processVideoFrame(video, camera.analyzeFrameQuality(video));
      this.frameErrors = 0;
    } catch {
      this.frameErrors += 1;
      if (this.frameErrors >= MAX_FRAME_ERRORS) this.recover();
      return;
    }
    for (const listener of this.frameListeners) listener(frame);
  };

  /** A model that keeps failing: retry on the CPU once, then report it. */
  private recover(): void {
    this.stopLoop();
    const engine = this.engine;
    if (!engine || engine.getBackend() === "cpu") {
      this.setStatus({ model: "error", issue: "model" });
      return;
    }
    const generation = this.generation;
    this.setStatus({ model: "loading" });
    engine
      .reinitializeOnCpu()
      .then((backend) => {
        if (this.generation === generation) this.setStatus({ model: "ready", backend });
      })
      .catch((error: unknown) => {
        if (isDisposedError(error) || this.generation !== generation) return;
        this.setStatus({ model: "error", issue: "model" });
      });
  }
}
