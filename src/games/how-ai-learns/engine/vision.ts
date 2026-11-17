/**
 * MobileNet as a feature extractor: a photo in, 1,280 numbers out. Copied
 * from the original loadFeatureExtractor / extractEmbeddingFromElement, with:
 *
 * - The model self-hosted under /games/how-ai-learns/model (nothing from
 *   TF Hub or Kaggle on the day), loaded with real byte progress.
 * - inputRange [0, 1]: what the TF Hub model expects. mobilenet.load()
 *   silently switches to [-1, 1] when given a modelUrl without it.
 * - WebGL first, CPU if WebGL is not available.
 * - Lazy: TF.js and MobileNet are imported inside functions only.
 * - Async readback (data() instead of dataSync()), so the page stays smooth.
 */

import type * as TF from "@tensorflow/tfjs";
import type { MobileNet } from "@tensorflow-models/mobilenet";
import { l2Normalize } from "./vectors";

export type Tf = typeof TF;

/**
 * MobileNet v2, width 0.5, 224 x 224, from TF Hub, with the ImageNet
 * classifier layer removed (scripts/fetch-model.ts --embedding-only):
 * 2.6 MB instead of 14 MB, same embeddings bit for bit.
 */
export const MODEL_URL = "/games/how-ai-learns/model/model.json";
export const MODEL_ALPHA = 0.5;
/** Length of MobileNet v2's pooled feature vector, for every width multiplier. */
export const EMBEDDING_SIZE = 1280;
export const MODEL_NAME = "MobileNet v2";

/* ── TF.js with a backend ───────────────────────────────────────── */

let tfPromise: Promise<Tf> | null = null;

export function loadTf(): Promise<Tf> {
  if (!tfPromise) {
    tfPromise = (async () => {
      const tf = await import("@tensorflow/tfjs");
      let ok = false;
      try {
        ok = await tf.setBackend("webgl");
      } catch {
        ok = false;
      }
      if (!ok) await tf.setBackend("cpu");
      await tf.ready();
      return tf;
    })();
    tfPromise.catch(() => {
      tfPromise = null;
    });
  }
  return tfPromise;
}

/* ── Model loading, observable by the UI ────────────────────────── */

export type ModelStatus =
  | { state: "idle" }
  | { state: "loading"; loaded: number; total: number | null }
  | { state: "ready"; backend: string }
  | { state: "error"; message: string };

/** One object, so useSyncExternalStore sees a stable server snapshot. */
const IDLE: ModelStatus = { state: "idle" };
let status: ModelStatus = IDLE;
const listeners = new Set<() => void>();

function setStatus(next: ModelStatus) {
  status = next;
  for (const l of listeners) l();
}

export const modelStatusStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: (): ModelStatus => status,
  getServerSnapshot: (): ModelStatus => IDLE,
};

type FetchFn = (url: string) => Promise<Response>;

function bytesOf(spec: TF.io.WeightsManifestEntry): number {
  const size = spec.shape.reduce((a, b) => a * b, 1);
  const q = spec.quantization?.dtype;
  if (q === "uint8") return size;
  if (q === "uint16" || q === "float16") return size * 2;
  if (spec.dtype === "bool") return size;
  if (spec.dtype === "complex64") return size * 8;
  return size * 4;
}

async function readWithProgress(response: Response, onChunk: (bytes: number) => void): Promise<ArrayBuffer> {
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    onChunk(buffer.byteLength);
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    length += value.byteLength;
    onChunk(value.byteLength);
  }
  const out = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out.buffer;
}

/** An IOHandler that reports real bytes as the weight shards arrive. */
function progressHandler(tf: Tf, modelUrl: string, fetchFn: FetchFn, onBytes: (loaded: number, total: number) => void): TF.io.IOHandler {
  return {
    load: async () => {
      const res = await fetchFn(modelUrl);
      if (!res.ok) throw new Error(`The model file answered ${res.status}`);
      const json = (await res.json()) as TF.io.ModelJSON;
      const base = modelUrl.slice(0, modelUrl.lastIndexOf("/") + 1);
      return tf.io.getModelArtifactsForJSON(json, async (manifest) => {
        const specs = manifest.flatMap((group) => group.weights);
        const paths = manifest.flatMap((group) => group.paths);
        const total = specs.reduce((a, s) => a + bytesOf(s), 0);
        let loaded = 0;
        onBytes(0, total);
        const buffers: ArrayBuffer[] = [];
        for (const path of paths) {
          const shard = await fetchFn(base + path);
          if (!shard.ok) throw new Error(`A model weight file answered ${shard.status}`);
          buffers.push(
            await readWithProgress(shard, (n) => {
              loaded += n;
              onBytes(Math.min(loaded, total), total);
            }),
          );
        }
        return [specs, buffers];
      });
    },
  };
}

let extractorPromise: Promise<MobileNet> | null = null;

export interface LoadOptions {
  modelUrl?: string;
  /** Scripts pass a file reader here; the browser uses fetch. */
  fetchFn?: FetchFn;
}

/** Load MobileNet once. Safe to call many times; failures can be retried. */
export function loadFeatureExtractor(options: LoadOptions = {}): Promise<MobileNet> {
  if (!extractorPromise) {
    setStatus({ state: "loading", loaded: 0, total: null });
    extractorPromise = (async () => {
      const tf = await loadTf();
      const mobilenet = await import("@tensorflow-models/mobilenet");
      const fetchFn: FetchFn = options.fetchFn ?? ((url) => fetch(url));
      let last = 0;
      const handler = progressHandler(tf, options.modelUrl ?? MODEL_URL, fetchFn, (loaded, total) => {
        // At most ~100 updates for the whole download.
        if (loaded === total || loaded - last > total / 100) {
          last = loaded;
          setStatus({ state: "loading", loaded, total });
        }
      });
      const net = await mobilenet.load({ version: 2, alpha: MODEL_ALPHA, modelUrl: handler, inputRange: [0, 1] });
      setStatus({ state: "ready", backend: tf.getBackend() });
      return net;
    })();
    extractorPromise.catch((error: unknown) => {
      extractorPromise = null;
      setStatus({ state: "error", message: error instanceof Error ? error.message : String(error) });
    });
  }
  return extractorPromise;
}

export type PixelSource = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ImageData | TF.Tensor3D;

/** 1,280 numbers for one photo, scaled to length 1. */
export async function extractEmbedding(source: PixelSource): Promise<Float32Array> {
  const tf = await loadTf();
  const net = await loadFeatureExtractor();
  const flat = tf.tidy(() => net.infer(source, true).reshape([-1]));
  try {
    return l2Normalize((await flat.data()) as Float32Array);
  } finally {
    flat.dispose();
  }
}

/** Decode a same-origin image URL into an element TF.js can read. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}
