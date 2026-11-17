/**
 * Self-hosted MediaPipe runtime and models (see scripts/sync-mediapipe.mjs).
 * Every camera game loads from these URLs so the browser caches one copy of
 * the 14 MB runtime for all of them, and nothing depends on a CDN.
 *
 * Always pass absolute paths: relative URLs break on nested routes.
 */

export const MEDIAPIPE_VERSION = process.env.NEXT_PUBLIC_MEDIAPIPE_VERSION ?? "0";

const asset = (path: string) => `/mediapipe/${path}?v=${MEDIAPIPE_VERSION}`;

/** For FilesetResolver-style options: `{ wasmLoaderPath, wasmBinaryPath }`. */
export const MEDIAPIPE_WASM = {
  wasmLoaderPath: asset("wasm/vision_wasm_internal.js"),
  wasmBinaryPath: asset("wasm/vision_wasm_internal.wasm"),
} as const;

export const MEDIAPIPE_MODELS = {
  hand: asset("models/hand_landmarker.task"),
  face: asset("models/face_landmarker.task"),
  gesture: asset("models/gesture_recognizer.task"),
  poseLite: asset("models/pose_landmarker_lite.task"),
} as const;
