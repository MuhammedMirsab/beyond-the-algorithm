#!/usr/bin/env node
/**
 * Self-hosts the MediaPipe runtime and models so no game depends on a CDN
 * during the exhibition (everything works offline once installed).
 *
 *  - Copies the WASM runtime from node_modules -> public/mediapipe/wasm
 *    (keeps the runtime in lock-step with the installed JS package).
 *  - Downloads each model into public/mediapipe/models when it is missing
 *    (or always, with --force-model).
 *
 * Runs after `bun install` (postinstall) and via `bun run sync:mediapipe`.
 * Uses only Node built-ins.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = join(root, "node_modules", "@mediapipe", "tasks-vision");
const wasmOut = join(root, "public", "mediapipe", "wasm");
const modelOut = join(root, "public", "mediapipe", "models");

/** Every model a game in this app loads. Keep file names stable: the games reference them. */
const MODELS = {
  "hand_landmarker.task":
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
  "face_landmarker.task":
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  "gesture_recognizer.task":
    "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
  "pose_landmarker_lite.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
};

const args = new Set(process.argv.slice(2));
const isPostinstall = process.env.npm_lifecycle_event === "postinstall";
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const log = (msg) => console.log(`[mediapipe] ${msg}`);

if (!existsSync(pkgDir)) {
  log("@mediapipe/tasks-vision is not installed yet, skipping.");
  process.exit(0);
}

const { version } = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));

mkdirSync(wasmOut, { recursive: true });
for (const file of ["vision_wasm_internal.js", "vision_wasm_internal.wasm"]) {
  const src = join(pkgDir, "wasm", file);
  const dest = join(wasmOut, file);
  const same = existsSync(dest) && statSync(dest).size === statSync(src).size;
  if (!same) copyFileSync(src, dest);
  log(`${same ? "up to date" : "copied"} ${file} (${mb(statSync(dest).size)})`);
}
writeFileSync(join(wasmOut, "VERSION"), `${version}\n`);

mkdirSync(modelOut, { recursive: true });
let failed = false;
for (const [name, url] of Object.entries(MODELS)) {
  const modelPath = join(modelOut, name);
  if (existsSync(modelPath) && !args.has("--force-model")) {
    log(`${name} present (${mb(statSync(modelPath).size)})`);
    continue;
  }
  try {
    log(`downloading ${name}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(modelPath, buf);
    log(`saved ${name} (${mb(buf.length)})`);
  } catch (err) {
    failed = true;
    const msg = `${name} download failed: ${err instanceof Error ? err.message : err}`;
    // Never break an install over a network hiccup; models can be synced later.
    if (isPostinstall) log(`warning: ${msg}`);
    else console.error(`[mediapipe] ${msg}`);
  }
}

if (failed && !isPostinstall) process.exit(1);
log(`runtime v${version} ready in public/mediapipe`);
