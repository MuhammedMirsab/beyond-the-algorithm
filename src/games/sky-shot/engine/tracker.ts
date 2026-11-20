/**
 * MediaPipe Hand Landmarker from the self-hosted copy (@/lib/mediapipe), so
 * it runs on exhibition Wi-Fi with nothing leaving the laptop. GPU first,
 * CPU fallback; `?delegate=cpu` forces CPU. Looks for two hands so the
 * player's own hand can be picked out of a crowd (see pickHand).
 */
import type { HandLandmarker } from "@mediapipe/tasks-vision";
import { MEDIAPIPE_MODELS, MEDIAPIPE_WASM } from "@/lib/mediapipe";
import type { Landmark } from "./aim";

export class HandTracker {
  private lastTs = -1;
  private closed = false;

  private constructor(
    private readonly landmarker: HandLandmarker,
    readonly delegate: "GPU" | "CPU",
  ) {}

  static async create(): Promise<HandTracker> {
    const { HandLandmarker } = await import("@mediapipe/tasks-vision");
    const forced = new URLSearchParams(window.location.search).get("delegate")?.toUpperCase();
    const order: ("GPU" | "CPU")[] = forced === "CPU" ? ["CPU"] : ["GPU", "CPU"];
    let lastErr: unknown;
    for (const delegate of order) {
      try {
        const landmarker = await HandLandmarker.createFromOptions(MEDIAPIPE_WASM, {
          baseOptions: { modelAssetPath: MEDIAPIPE_MODELS.hand, delegate },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        return new HandTracker(landmarker, delegate);
      } catch (err) {
        console.warn(`[sky-shot] ${delegate} hand tracking unavailable`, err);
        lastErr = err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("Hand tracking could not start on this device.");
  }

  detect(video: HTMLVideoElement, tMs: number): Landmark[][] {
    if (this.closed) return [];
    // MediaPipe needs strictly increasing timestamps.
    const ts = Math.max(Math.round(tMs), this.lastTs + 1);
    this.lastTs = ts;
    const result = this.landmarker.detectForVideo(video, ts);
    return result.landmarks ?? [];
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.landmarker.close();
  }
}
