/**
 * MediaPipe Hand Landmarker, self-hosted under /mediapipe (see @/lib/mediapipe)
 * so it works on exhibition Wi-Fi. Tries the GPU delegate first and falls
 * back to CPU. `?delegate=cpu` forces CPU for troubleshooting.
 *
 * The library is imported lazily, inside create(), so nothing touches the
 * browser on the server. One landmarker is shared through leases: StrictMode's
 * double mount reuses it, and it closes a few seconds after the last user lets go.
 */
import type { HandLandmarker, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { MEDIAPIPE_MODELS, MEDIAPIPE_WASM } from "@/lib/mediapipe";

export type Delegate = "GPU" | "CPU";

/** Rough sizes, only used to weight progress when the server sends no content-length. */
const MODEL_EST = 7.8e6;
const WASM_EST = 14.7e6;

async function fetchBytes(url: string, onProgress?: (loaded: number, total: number) => void): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  const total = Number(res.headers.get("content-length") ?? 0);
  if (!res.body || !onProgress) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

export class HandTracker {
  readonly delegate: Delegate;
  private landmarker: HandLandmarker;
  private lastTs = -1;
  private closed = false;

  private constructor(landmarker: HandLandmarker, delegate: Delegate) {
    this.landmarker = landmarker;
    this.delegate = delegate;
  }

  static async create(onProgress?: (fraction: number) => void): Promise<HandTracker> {
    const { HandLandmarker } = await import("@mediapipe/tasks-vision");

    let modelLoaded = 0;
    let wasmLoaded = 0;
    let modelTotal = MODEL_EST;
    let wasmTotal = WASM_EST;
    const report = () => onProgress?.(Math.min(0.97, (modelLoaded + wasmLoaded) / (modelTotal + wasmTotal)));

    const [modelBytes, wasmBytes] = await Promise.all([
      fetchBytes(MEDIAPIPE_MODELS.hand, (loaded, total) => {
        modelLoaded = loaded;
        if (total > 0) modelTotal = total;
        report();
      }),
      fetchBytes(MEDIAPIPE_WASM.wasmBinaryPath, (loaded, total) => {
        wasmLoaded = loaded;
        if (total > 0) wasmTotal = total;
        report();
      }),
    ]);

    const wasmUrl = URL.createObjectURL(new Blob([wasmBytes as BlobPart], { type: "application/wasm" }));
    const fileset = { wasmLoaderPath: MEDIAPIPE_WASM.wasmLoaderPath, wasmBinaryPath: wasmUrl };

    const forced = new URLSearchParams(window.location.search).get("delegate")?.toUpperCase();
    const order: Delegate[] = forced === "CPU" ? ["CPU"] : ["GPU", "CPU"];
    let lastErr: unknown;
    try {
      for (const delegate of order) {
        try {
          const landmarker = await HandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetBuffer: modelBytes.slice(), delegate },
            runningMode: "VIDEO",
            numHands: 1,
            minHandDetectionConfidence: 0.6,
            minHandPresenceConfidence: 0.55,
            minTrackingConfidence: 0.5,
          });
          onProgress?.(1);
          return new HandTracker(landmarker, delegate);
        } catch (err) {
          console.warn(`[airwrite] ${delegate} hand tracking unavailable`, err);
          lastErr = err;
        }
      }
    } finally {
      URL.revokeObjectURL(wasmUrl);
    }
    throw lastErr instanceof Error ? lastErr : new Error("Hand tracking could not start on this device.");
  }

  /** Returns the 21 landmarks of the tracked hand, or null. */
  detect(video: HTMLVideoElement, tMs: number): NormalizedLandmark[] | null {
    if (this.closed) return null;
    // MediaPipe requires strictly increasing timestamps.
    const ts = Math.max(Math.round(tMs), this.lastTs + 1);
    this.lastTs = ts;
    const result = this.landmarker.detectForVideo(video, ts);
    return result.landmarks?.[0] ?? null;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.landmarker.close();
  }
}

/* ── Shared instance ─────────────────────────────────────────────── */

/** How long an unused landmarker stays warm (StrictMode remounts, a quick Next player). */
const CLOSE_GRACE_MS = 10_000;

interface Entry {
  promise: Promise<HandTracker>;
  users: number;
  closeTimer: ReturnType<typeof setTimeout> | null;
  load: { progress: number; listeners: Set<(fraction: number) => void> };
}

let current: Entry | null = null;

export interface TrackerLease {
  promise: Promise<HandTracker>;
  /** Download progress so far, 0 to 1. */
  progress(): number;
  onProgress(fn: (fraction: number) => void): () => void;
  /** Call exactly once when this user is done. Safe to call twice. */
  release(): void;
}

export function acquireHandTracker(): TrackerLease {
  if (!current) {
    const load: Entry["load"] = { progress: 0, listeners: new Set() };
    const promise = HandTracker.create((fraction) => {
      // Only report visible steps: one re-render per percent, not per network chunk.
      if (fraction < 1 && fraction - load.progress < 0.01) return;
      load.progress = fraction;
      load.listeners.forEach((fn) => fn(fraction));
    });
    const created: Entry = { promise, users: 0, closeTimer: null, load };
    // A failed load is forgotten, so "Try again" starts a fresh one.
    promise.catch(() => {
      if (current === created) current = null;
    });
    current = created;
  }

  const entry = current;
  entry.users += 1;
  if (entry.closeTimer) {
    clearTimeout(entry.closeTimer);
    entry.closeTimer = null;
  }

  let released = false;
  return {
    promise: entry.promise,
    progress: () => entry.load.progress,
    onProgress: (fn) => {
      entry.load.listeners.add(fn);
      return () => {
        entry.load.listeners.delete(fn);
      };
    },
    release: () => {
      if (released) return;
      released = true;
      entry.users -= 1;
      if (entry.users > 0) return;
      entry.closeTimer = setTimeout(() => {
        entry.closeTimer = null;
        if (entry.users > 0) return;
        if (current === entry) current = null;
        entry.promise.then(
          (tracker) => tracker.close(),
          () => {},
        );
      }, CLOSE_GRACE_MS);
    },
  };
}

export { HAND_CONNECTIONS } from "./gesture";
