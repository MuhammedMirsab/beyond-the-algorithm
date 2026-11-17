import type { HandLandmarker, HandLandmarkerOptions, HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { MEDIAPIPE_MODELS, MEDIAPIPE_WASM } from "@/lib/mediapipe";
import { createProgressHub } from "./progress";

/** The arcade's self-hosted runtime and model, shared (and HTTP-cached) by every camera game. */
const WASM_LOADER = MEDIAPIPE_WASM.wasmLoaderPath;
const WASM_BINARY = MEDIAPIPE_WASM.wasmBinaryPath;
const MODEL = MEDIAPIPE_MODELS.hand;

/** Approximate decoded sizes, used when the response is compressed (no usable Content-Length). */
const WASM_BYTES = 14_670_000;
const MODEL_BYTES = 7_820_000;

export type Delegate = "GPU" | "CPU";
export type LoadStage = "download" | "compile" | "benchmark";

export interface DelegateTimings {
  GPU: number | null;
  CPU: number | null;
}

export interface LoadProgress {
  stage: LoadStage;
  /** 0..1 for the download stage. */
  fraction: number;
  loadedBytes: number;
  totalBytes: number;
  /** Benchmark results so far (the benchmark stage reports the GPU time while the CPU is tested). */
  timings?: DelegateTimings;
}

export class HandTracker {
  private lastTs = 0;

  constructor(
    private readonly landmarker: HandLandmarker,
    readonly delegate: Delegate,
    /** Median warm inference per backend measured at startup (null = not tried / unavailable). */
    readonly timings: DelegateTimings,
  ) {}

  /**
   * Synchronous inference on the frame currently held by `source`.
   * Called inside the frame loop right before the same frame is uploaded to the
   * renderer, so landmarks and pixels always come from the same instant.
   */
  detect(source: TexImageSource, nowMs: number): HandLandmarkerResult {
    const ts = Math.max(nowMs, this.lastTs + 1);
    this.lastTs = ts;
    return this.landmarker.detectForVideo(source, ts);
  }

  close() {
    this.landmarker.close();
  }
}

async function fetchBytes(url: string, fallbackTotal: number, onBytes: (loaded: number, total: number) => void) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Failed to load ${url} (HTTP ${res.status})`);
  const encoded = res.headers.get("content-encoding");
  const declared = Number(res.headers.get("content-length"));
  const total = !encoded && declared > 0 ? declared : fallbackTotal;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onBytes(loaded, total);
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

function probeCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 640, 360);
    g.addColorStop(0, "#3a3330");
    g.addColorStop(1, "#141210");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[s.length >> 1] ?? Infinity;
};

/**
 * Times warm inferences on a probe frame. The first call compiles kernels and
 * is discarded. Uses small timestamps — live frames use performance.now(),
 * which is always larger, so VIDEO-mode monotonicity holds.
 */
function benchmark(landmarker: HandLandmarker, frame: HTMLCanvasElement, runs = 7) {
  const times: number[] = [];
  for (let i = 0; i <= runs; i++) {
    const t0 = performance.now();
    landmarker.detectForVideo(frame, i + 1);
    if (i > 0) times.push(performance.now() - t0);
  }
  return median(times);
}

/** Prefer the GPU unless the CPU path is clearly faster on this machine. */
const CPU_MARGIN = 0.8;

async function createTracker(onProgress: (p: LoadProgress) => void, preferred?: Delegate): Promise<HandTracker> {
  const vision = await import("@mediapipe/tasks-vision");

  // Download runtime + model in parallel with one combined progress bar.
  const loaded = { wasm: 0, model: 0 };
  const totals = { wasm: WASM_BYTES, model: MODEL_BYTES };
  const report = () => {
    const l = loaded.wasm + loaded.model;
    const t = totals.wasm + totals.model;
    onProgress({ stage: "download", fraction: Math.min(1, l / t), loadedBytes: l, totalBytes: t });
  };
  report();
  const [wasmBytes, modelBytes] = await Promise.all([
    fetchBytes(WASM_BINARY, WASM_BYTES, (l, t) => {
      loaded.wasm = l;
      totals.wasm = t;
      report();
    }),
    fetchBytes(MODEL, MODEL_BYTES, (l, t) => {
      loaded.model = l;
      totals.model = t;
      report();
    }),
  ]);

  // Hand the already-downloaded binary to the Emscripten loader via a blob URL (no second request).
  const wasmUrl = URL.createObjectURL(new Blob([wasmBytes as BlobPart], { type: "application/wasm" }));
  const fileset = { wasmLoaderPath: WASM_LOADER, wasmBinaryPath: wasmUrl };

  const options = (delegate: Delegate): HandLandmarkerOptions => ({
    baseOptions: { modelAssetBuffer: modelBytes.slice(), delegate },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.55,
    minTrackingConfidence: 0.5,
  });

  const probe = probeCanvas();
  const timings: DelegateTimings = { GPU: null, CPU: null };

  /** Create + warm + time one backend. Returns null if the backend can't run here. */
  const tryBackend = async (delegate: Delegate) => {
    try {
      const landmarker = await vision.HandLandmarker.createFromOptions(fileset, options(delegate));
      try {
        timings[delegate] = benchmark(landmarker, probe);
        return landmarker;
      } catch (err) {
        landmarker.close();
        throw err;
      }
    } catch (err) {
      console.warn(`[viewfinder] ${delegate} delegate unavailable`, err);
      return null;
    }
  };

  try {
    onProgress({ stage: "compile", fraction: 1, loadedBytes: 0, totalBytes: 0 });
    if (preferred) {
      const only = await tryBackend(preferred);
      if (only) return new HandTracker(only, preferred, timings);
    }

    // Real-time matters more than ideology: measure both backends on this device and keep the faster.
    const gpu = await tryBackend("GPU");
    onProgress({ stage: "benchmark", fraction: 1, loadedBytes: 0, totalBytes: 0, timings: { ...timings } });
    const cpu = await tryBackend("CPU");
    if (!gpu && !cpu) throw new Error("No MediaPipe backend could be initialised");

    const useCpu = !gpu || (cpu !== null && (timings.CPU ?? Infinity) < (timings.GPU ?? Infinity) * CPU_MARGIN);
    const [keep, drop, delegate] = useCpu ? ([cpu!, gpu, "CPU"] as const) : ([gpu!, cpu, "GPU"] as const);
    drop?.close();
    console.info(
      `[viewfinder] backend ${delegate} — GPU ${timings.GPU?.toFixed(1) ?? "n/a"} ms, CPU ${timings.CPU?.toFixed(1) ?? "n/a"} ms`,
    );
    return new HandTracker(keep, delegate, timings);
  } finally {
    URL.revokeObjectURL(wasmUrl);
  }
}

let shared: Promise<HandTracker> | null = null;
/** The resolved tracker, so a restart can tell synchronously that nothing needs loading. */
let ready: HandTracker | null = null;
/** Bumped by disposeHandTracker so a load that finishes after the game unmounted is closed, not kept. */
let generation = 0;
const progress = createProgressHub<LoadProgress>();

/** True when the tracker is loaded and kept (Play again skips the loading stages). */
export const isHandTrackerReady = () => ready !== null;

/**
 * One tracker while the game is on screen, so "Play again" starts at once;
 * retried from scratch if loading failed. Every caller hears the progress,
 * including one that joins a load already in flight.
 * `preferred` (from `?delegate=gpu|cpu`) skips the benchmark.
 */
export function loadHandTracker(onProgress: (p: LoadProgress) => void, preferred?: Delegate): Promise<HandTracker> {
  const unsubscribe = progress.subscribe(onProgress);
  if (!shared) {
    const gen = ++generation;
    progress.reset();
    shared = createTracker((p) => {
      if (gen === generation) progress.emit(p);
    }, preferred).then(
      (tracker) => {
        if (gen !== generation) {
          tracker.close();
          throw new Error("The hand tracker was released while it loaded");
        }
        progress.reset();
        ready = tracker;
        return tracker;
      },
      (err: unknown) => {
        if (gen === generation) {
          shared = null;
          progress.reset();
        }
        throw err;
      },
    );
  }
  const job = shared;
  job.then(unsubscribe, unsubscribe);
  return job;
}

/**
 * Closes the tracker (or the one still loading) when the game leaves the
 * screen, so its runtime and GPU memory don't follow the visitor into the
 * next game. The next load starts fresh, from the HTTP cache.
 */
export function disposeHandTracker() {
  const current = shared;
  generation++;
  shared = null;
  ready = null;
  progress.reset();
  current?.then(
    (tracker) => tracker.close(),
    () => {},
  );
}
