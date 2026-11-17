import type { FaceLandmarker, FaceLandmarkerOptions, FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { MEDIAPIPE_MODELS, MEDIAPIPE_WASM } from "@/lib/mediapipe";

/**
 * Loads MediaPipe Face Landmarker from the self-hosted runtime and model
 * (public/mediapipe, shared by every camera game). Nothing is fetched from a
 * third-party CDN.
 */

/** Approximate sizes, used when the server compresses responses (no usable Content-Length). */
const WASM_BYTES = 14_670_000;
const MODEL_BYTES = 3_760_000;

export type Delegate = "GPU" | "CPU";

export interface LoadProgress {
  stage: "download" | "initialise";
  /** 0..1 */
  fraction: number;
  /** Bytes downloaded so far and expected in total (runtime + model). */
  loaded: number;
  total: number;
}

export class FaceTracker {
  private lastTs = 0;

  constructor(
    private readonly landmarker: FaceLandmarker,
    readonly delegate: Delegate,
    readonly warmMs: number,
  ) {}

  /** Synchronous inference on the frame currently shown by `source`. */
  detect(source: HTMLVideoElement | HTMLCanvasElement, nowMs: number): FaceLandmarkerResult {
    // VIDEO mode requires strictly increasing timestamps.
    const ts = Math.max(nowMs, this.lastTs + 1);
    this.lastTs = ts;
    return this.landmarker.detectForVideo(source, ts);
  }

  close() {
    try {
      this.landmarker.close();
    } catch {
      /* already closed */
    }
  }
}

async function fetchBytes(url: string, fallbackTotal: number, onBytes: (loaded: number, total: number) => void) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url} (HTTP ${res.status})`);
  const encoded = res.headers.get("content-encoding");
  const declared = Number(res.headers.get("content-length"));
  const total = !encoded && declared > 0 ? declared : fallbackTotal;
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    onBytes(buf.byteLength, buf.byteLength);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onBytes(loaded, Math.max(total, loaded));
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  onBytes(loaded, loaded);
  return bytes;
}

/** A neutral grey frame used to warm up and time a backend before real frames arrive. */
function probeFrame() {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#6b6560";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1] ?? Infinity;
};

function benchmark(landmarker: FaceLandmarker, frame: HTMLCanvasElement, runs = 5) {
  const times: number[] = [];
  for (let i = 0; i <= runs; i++) {
    const t0 = performance.now();
    landmarker.detectForVideo(frame, i + 1);
    if (i > 0) times.push(performance.now() - t0);
  }
  return median(times);
}

/** GPU is kept unless it fails or is clearly slow on this machine. */
const GPU_GOOD_ENOUGH_MS = 18;

async function createTracker(onProgress: (p: LoadProgress) => void, forced: Delegate | null): Promise<FaceTracker> {
  const vision = await import("@mediapipe/tasks-vision");

  const loaded = { wasm: 0, model: 0 };
  const totals = { wasm: WASM_BYTES, model: MODEL_BYTES };
  const report = () => {
    const total = totals.wasm + totals.model;
    const done = loaded.wasm + loaded.model;
    onProgress({ stage: "download", fraction: Math.min(1, done / total), loaded: done, total });
  };
  report();

  const [wasmBytes, modelBytes] = await Promise.all([
    fetchBytes(MEDIAPIPE_WASM.wasmBinaryPath, WASM_BYTES, (l, t) => {
      loaded.wasm = l;
      totals.wasm = t;
      report();
    }),
    fetchBytes(MEDIAPIPE_MODELS.face, MODEL_BYTES, (l, t) => {
      loaded.model = l;
      totals.model = t;
      report();
    }),
  ]);
  const size = wasmBytes.byteLength + modelBytes.byteLength;
  onProgress({ stage: "initialise", fraction: 1, loaded: size, total: size });

  // Hand the already-downloaded binary to the Emscripten loader via a blob URL (no second request).
  const wasmUrl = URL.createObjectURL(new Blob([wasmBytes as BlobPart], { type: "application/wasm" }));
  const fileset = { wasmLoaderPath: MEDIAPIPE_WASM.wasmLoaderPath, wasmBinaryPath: wasmUrl };

  const options = (delegate: Delegate): FaceLandmarkerOptions => ({
    baseOptions: { modelAssetBuffer: modelBytes.slice(), delegate },
    runningMode: "VIDEO",
    // Two faces so a visitor standing behind the player can't steal control:
    // the controller picks the closest (largest) face and sticks with it.
    numFaces: 2,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });

  const probe = probeFrame();
  const tryBackend = async (delegate: Delegate) => {
    try {
      const landmarker = await vision.FaceLandmarker.createFromOptions(fileset, options(delegate));
      try {
        return { landmarker, ms: benchmark(landmarker, probe) };
      } catch (err) {
        landmarker.close();
        throw err;
      }
    } catch (err) {
      console.warn(`[face-control] ${delegate} backend unavailable`, err);
      return null;
    }
  };

  try {
    if (forced) {
      const only = await tryBackend(forced);
      if (only) return new FaceTracker(only.landmarker, forced, only.ms);
    }

    const gpu = await tryBackend("GPU");
    if (gpu && gpu.ms <= GPU_GOOD_ENOUGH_MS) return new FaceTracker(gpu.landmarker, "GPU", gpu.ms);

    const cpu = await tryBackend("CPU");
    if (gpu && (!cpu || gpu.ms <= cpu.ms)) {
      cpu?.landmarker.close();
      return new FaceTracker(gpu.landmarker, "GPU", gpu.ms);
    }
    gpu?.landmarker.close();
    if (!cpu) throw new Error("No MediaPipe backend could be initialised on this device.");
    return new FaceTracker(cpu.landmarker, "CPU", cpu.ms);
  } finally {
    URL.revokeObjectURL(wasmUrl);
  }
}

/** Reads `?delegate=gpu|cpu` (a booth debugging switch) from a query string. */
export function parseDelegate(search: string): Delegate | null {
  const value = new URLSearchParams(search).get("delegate")?.toUpperCase();
  return value === "GPU" || value === "CPU" ? value : null;
}

let shared: Promise<FaceTracker> | null = null;
const listeners = new Set<(p: LoadProgress) => void>();
let lastProgress: LoadProgress = { stage: "download", fraction: 0, loaded: 0, total: WASM_BYTES + MODEL_BYTES };

/** How many mounted games hold the tracker, and the pending close when that drops to zero. */
let holders = 0;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
/** Keep the model warm briefly after the last holder leaves (StrictMode remounts, quick back-and-forth). */
const CLOSE_AFTER_MS = 20_000;

/**
 * One tracker per page session, shared while a Face Control screen is open.
 * Retried from scratch if loading failed.
 */
export function loadFaceTracker(onProgress?: (p: LoadProgress) => void, forced: Delegate | null = null): Promise<FaceTracker> {
  if (onProgress) {
    listeners.add(onProgress);
    onProgress(lastProgress);
  }
  if (!shared) {
    shared = createTracker((p) => {
      lastProgress = p;
      listeners.forEach((fn) => fn(p));
    }, forced).catch((err: unknown) => {
      shared = null;
      lastProgress = { stage: "download", fraction: 0, loaded: 0, total: WASM_BYTES + MODEL_BYTES };
      throw err;
    });
  }
  const promise = shared;
  if (onProgress) promise.finally(() => listeners.delete(onProgress)).catch(() => {});
  return promise;
}

/** Stops listening for progress without affecting the load itself. */
export function unlistenFaceTracker(onProgress: (p: LoadProgress) => void) {
  listeners.delete(onProgress);
}

/** Call when a game that uses the tracker mounts. Cancels a pending close. */
export function holdFaceTracker() {
  holders++;
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

/**
 * Call when that game unmounts. When nobody holds the tracker any more, the
 * landmarker is closed after a short grace period, freeing its GPU memory for
 * the other camera games on the booth laptop.
 */
export function releaseFaceTracker() {
  holders = Math.max(0, holders - 1);
  if (holders > 0 || closeTimer) return;
  closeTimer = setTimeout(() => {
    closeTimer = null;
    if (holders > 0 || !shared) return;
    const pending = shared;
    shared = null;
    lastProgress = { stage: "download", fraction: 0, loaded: 0, total: WASM_BYTES + MODEL_BYTES };
    pending.then((t) => t.close()).catch(() => {});
  }, CLOSE_AFTER_MS);
}
