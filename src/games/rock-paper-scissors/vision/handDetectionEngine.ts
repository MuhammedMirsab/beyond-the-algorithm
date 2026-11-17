/**
 * Runs MediaPipe on the camera frames and returns one classified hand per
 * frame. Copied from the original app with these changes:
 *
 * - The runtime and models are self-hosted (`@/lib/mediapipe`), so the wasm
 *   always matches the installed JS package (the original mixed a 0.10.22 CDN
 *   wasm with the 1.2.3 package).
 * - MediaPipe is imported lazily, inside `initialize`, so nothing touches the
 *   browser on the server.
 * - One hand only (`numHands: 1`): a second hand from the crowd used to block
 *   every round with "multiple hands".
 * - Try the GPU delegate, then the CPU, then the plain hand landmarker model
 *   (geometry only) as a last resort. `reinitializeOnCpu` recovers when a GPU
 *   that loaded fine starts failing mid-game.
 * - No console.error override.
 */
import type { GestureRecognizer, HandLandmarker } from "@mediapipe/tasks-vision";
import { MEDIAPIPE_MODELS, MEDIAPIPE_WASM } from "@/lib/mediapipe";
import type { ActiveBackend, CVFrameResult, FrameQualityIssue, HandLandmark } from "../engine/types";
import type { FrameQualityAnalysis } from "./cameraManager";
import { fuseGestureClassifications } from "./gestureClassifier";
import { assessHandFraming } from "./gestureGeometry";

const DETECTION_OPTIONS = {
  runningMode: "VIDEO",
  numHands: 1,
  minHandDetectionConfidence: 0.55,
  minHandPresenceConfidence: 0.55,
  minTrackingConfidence: 0.55,
} as const;

/** Which model ended up running: the gesture recognizer, or the hand landmarker fallback. */
export type ModelKind = "gesture" | "hand";

class DisposedError extends Error {
  constructor() {
    super("Hand detection engine was disposed while loading.");
    this.name = "DisposedError";
  }
}

export function isDisposedError(error: unknown): boolean {
  return error instanceof DisposedError;
}

function toHandedness(categoryName: string | undefined): "Left" | "Right" | "Unknown" {
  // MediaPipe 1.2.3 reports the subject's own hand for an unmirrored frame,
  // which is what we pass (the preview is mirrored with CSS only). This build
  // doesn't show handedness anywhere.
  return categoryName === "Left" ? "Left" : categoryName === "Right" ? "Right" : "Unknown";
}

export class HandDetectionEngine {
  private gestureRecognizer: GestureRecognizer | null = null;
  private handLandmarker: HandLandmarker | null = null;
  private activeBackend: ActiveBackend = "cpu";
  private modelKind: ModelKind = "gesture";
  private initialized = false;
  private initializingPromise: Promise<ActiveBackend> | null = null;
  /** Bumped by dispose(): a load that started in an older generation closes what it made and gives up. */
  private generation = 0;
  private lastTimestampMs = -1;
  private fpsSamples: number[] = [];
  private lastFrameAtMs = 0;

  public initialize(options: { forceCpu?: boolean } = {}): Promise<ActiveBackend> {
    if (this.initialized) return Promise.resolve(this.activeBackend);
    if (this.initializingPromise) return this.initializingPromise;
    const promise = this.load(options.forceCpu ?? false, this.generation).finally(() => {
      if (this.initializingPromise === promise) this.initializingPromise = null;
    });
    this.initializingPromise = promise;
    return promise;
  }

  private async load(forceCpu: boolean, generation: number): Promise<ActiveBackend> {
    const stale = () => generation !== this.generation;
    const { GestureRecognizer, HandLandmarker } = await import("@mediapipe/tasks-vision");
    if (stale()) throw new DisposedError();

    const attempts: Array<{ kind: ModelKind; delegate: "GPU" | "CPU" }> = [
      ...(forceCpu ? [] : [{ kind: "gesture" as const, delegate: "GPU" as const }]),
      { kind: "gesture", delegate: "CPU" },
      ...(forceCpu ? [] : [{ kind: "hand" as const, delegate: "GPU" as const }]),
      { kind: "hand", delegate: "CPU" },
    ];

    let lastError: unknown = null;
    for (const attempt of attempts) {
      try {
        if (attempt.kind === "gesture") {
          const recognizer = await GestureRecognizer.createFromOptions(MEDIAPIPE_WASM, {
            baseOptions: { modelAssetPath: MEDIAPIPE_MODELS.gesture, delegate: attempt.delegate },
            ...DETECTION_OPTIONS,
          });
          if (stale()) {
            recognizer.close();
            throw new DisposedError();
          }
          this.gestureRecognizer = recognizer;
        } else {
          const landmarker = await HandLandmarker.createFromOptions(MEDIAPIPE_WASM, {
            baseOptions: { modelAssetPath: MEDIAPIPE_MODELS.hand, delegate: attempt.delegate },
            ...DETECTION_OPTIONS,
          });
          if (stale()) {
            landmarker.close();
            throw new DisposedError();
          }
          this.handLandmarker = landmarker;
        }
        this.activeBackend = attempt.delegate === "GPU" ? "gpu" : "cpu";
        this.modelKind = attempt.kind;
        this.initialized = true;
        return this.activeBackend;
      } catch (error) {
        if (error instanceof DisposedError) throw error;
        lastError = error;
      }
    }
    throw lastError ?? new Error("The hand model could not be created.");
  }

  /** A GPU delegate that loaded fine can still fail on some drivers: start again on the CPU. */
  public async reinitializeOnCpu(): Promise<ActiveBackend> {
    this.generation += 1;
    this.closeTasks();
    this.initialized = false;
    this.initializingPromise = null;
    return this.initialize({ forceCpu: true });
  }

  public getBackend(): ActiveBackend {
    return this.activeBackend;
  }

  public getModelKind(): ModelKind {
    return this.modelKind;
  }

  public isReady(): boolean {
    return this.initialized && Boolean(this.gestureRecognizer || this.handLandmarker);
  }

  /**
   * Processes one video frame.
   * Uses GestureRecognizer as primary pipeline (returns landmarks, handedness, AND gesture label/score),
   * falling back to HandLandmarker if GestureRecognizer is unavailable.
   */
  public processVideoFrame(video: HTMLVideoElement, frameQuality: FrameQualityAnalysis): CVFrameResult {
    const startPerf = performance.now();
    const nowMs = Math.max(this.lastTimestampMs + 1, Math.round(startPerf));
    this.lastTimestampMs = nowMs;

    if (this.lastFrameAtMs > 0) {
      const dt = Math.max(1, startPerf - this.lastFrameAtMs);
      this.fpsSamples.push(1000 / dt);
      if (this.fpsSamples.length > 20) this.fpsSamples.shift();
    }
    this.lastFrameAtMs = startPerf;
    const avgFps =
      this.fpsSamples.length > 0 ? Math.round(this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length) : 0;

    if (!this.isReady() || video.readyState < 2 || video.videoWidth === 0) {
      return {
        timestamp: Date.now(),
        handCount: 0,
        landmarks: null,
        allHandsLandmarks: [],
        handedness: "Unknown",
        gesture: "none",
        confidence: 0,
        mediapipeGesture: "none",
        mediapipeConfidence: 0,
        geometricGesture: "none",
        geometricConfidence: 0,
        secondaryGesture: "none",
        secondaryConfidence: 0,
        qualityIssues: ["no_hand"],
        inferenceLatencyMs: 0,
        fps: avgFps,
        backend: this.activeBackend,
        brightnessScore: frameQuality.brightnessScore,
        motionScore: frameQuality.motionScore,
      };
    }

    let allHands: HandLandmark[][] = [];
    let handedness: "Left" | "Right" | "Unknown" = "Unknown";
    let mpCategory: string | null = null;
    let mpScore = 0;

    if (this.gestureRecognizer) {
      const rec = this.gestureRecognizer.recognizeForVideo(video, nowMs);
      if (rec.landmarks && rec.landmarks.length > 0) {
        allHands = rec.landmarks.map((hand) => hand.map((lm) => ({ x: lm.x, y: lm.y, z: lm.z })));
      }
      handedness = toHandedness(rec.handedness?.[0]?.[0]?.categoryName);
      if (rec.gestures?.[0]?.[0]) {
        mpCategory = rec.gestures[0][0].categoryName;
        mpScore = rec.gestures[0][0].score;
      }
    }

    // Fallback model: landmarks only, the gesture comes from the geometry rules.
    if (allHands.length === 0 && this.handLandmarker) {
      const hlRes = this.handLandmarker.detectForVideo(video, nowMs);
      if (hlRes.landmarks && hlRes.landmarks.length > 0) {
        allHands = hlRes.landmarks.map((hand) => hand.map((lm) => ({ x: lm.x, y: lm.y, z: lm.z })));
        handedness = toHandedness(hlRes.handedness?.[0]?.[0]?.categoryName);
      }
    }

    const primaryLandmarks = allHands[0] ?? null;
    const fused = fuseGestureClassifications(primaryLandmarks, mpCategory, mpScore);
    const qualityIssues: FrameQualityIssue[] = assessHandFraming(allHands);

    if (frameQuality.isLowLight) qualityIssues.push("low_light");
    if (frameQuality.isHighMotionBlur) qualityIssues.push("motion_blur");
    if (primaryLandmarks && fused.confidence < 0.62 && !qualityIssues.includes("low_confidence")) {
      qualityIssues.push("low_confidence");
    }

    const inferenceLatencyMs = Math.round((performance.now() - startPerf) * 10) / 10;

    return {
      timestamp: Date.now(),
      handCount: allHands.length,
      landmarks: primaryLandmarks,
      allHandsLandmarks: allHands,
      handedness,
      gesture: fused.gesture,
      confidence: fused.confidence,
      mediapipeGesture: fused.mediapipeGesture,
      mediapipeConfidence: fused.mediapipeConfidence,
      geometricGesture: fused.geometricGesture,
      geometricConfidence: fused.geometricConfidence,
      secondaryGesture: fused.secondaryGesture,
      secondaryConfidence: fused.secondaryConfidence,
      qualityIssues,
      inferenceLatencyMs,
      fps: avgFps,
      backend: this.activeBackend,
      brightnessScore: Math.round(frameQuality.brightnessScore),
      motionScore: Math.round(frameQuality.motionScore * 100) / 100,
    };
  }

  private closeTasks(): void {
    try {
      this.gestureRecognizer?.close();
    } catch {
      // Already closed or never started: nothing to free.
    }
    try {
      this.handLandmarker?.close();
    } catch {
      // Same as above.
    }
    this.gestureRecognizer = null;
    this.handLandmarker = null;
  }

  public dispose(): void {
    this.generation += 1;
    this.closeTasks();
    this.initialized = false;
    this.initializingPromise = null;
    this.lastTimestampMs = -1;
    this.fpsSamples = [];
    this.lastFrameAtMs = 0;
  }
}
