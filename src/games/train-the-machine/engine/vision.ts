/**
 * Perception: MediaPipe pose (33 points, kept as 17) plus the gesture model
 * (hands and four hand shapes). Ported from the original hybridVision.js.
 *
 * Removed on purpose: the "pixel matrix" fallback. It drew a made-up
 * skeleton from skin-coloured pixels whenever the real model saw nobody, so
 * the game pretended to track people it could not see. Now, no model result
 * means no person.
 *
 * Browser only: MediaPipe is imported lazily inside loadVision().
 */
import type {
  Category,
  GestureRecognizer,
  GestureRecognizerResult,
  NormalizedLandmark,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import { MEDIAPIPE_MODELS, MEDIAPIPE_WASM } from "@/lib/mediapipe";
import {
  KEYPOINT_NAMES,
  KP,
  MIN_POINT_SCORE,
  type HandReading,
  type HandShape,
  type Keypoint,
  type PerceptionResult,
  type Point,
} from "./types";

/** MediaPipe's 33-point indices for our 17 points, in KEYPOINT_NAMES order. */
const POSE_INDICES = [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28] as const;

/** Torso counts as visible above this mean visibility of shoulders and hips. */
const TORSO_VISIBLE = 0.45;
/** Legs count as visible above this mean visibility of the knees. */
const LEGS_VISIBLE = 0.35;

type Delegate = "GPU" | "CPU";

export interface VisionModels {
  pose: PoseLandmarker;
  gesture: GestureRecognizer;
  /** Which backend each model ended up on. */
  delegates: { pose: Delegate; gesture: Delegate };
  /** Set once the models are closed; analyzeFrame() refuses to run after that. */
  closed: boolean;
  /** Last timestamp sent to MediaPipe: VIDEO mode needs them strictly increasing. */
  lastTimestamp: number;
  /** Canvases handed to MediaPipe, so their WebGL contexts can be released on close. */
  canvases: HTMLCanvasElement[];
}

/* ── Loading: one shared promise, released when the game unmounts ───── */

let pending: Promise<VisionModels> | null = null;
let holders = 0;
let disposeTimer: ReturnType<typeof setTimeout> | undefined;
/** Set when the GPU models loaded but then kept failing on frames: later loads skip the GPU. */
let cpuOnly = false;

/** Load the next models on the CPU only (call before retrying after frames kept failing). */
export function preferCpu(): void {
  cpuOnly = true;
}

/**
 * Loads (or returns the loading) pose and gesture models. The promise is
 * cached, so StrictMode double effects and repeated calls share one load.
 * A failed load is forgotten, so the next call tries again.
 */
export function loadVision(): Promise<VisionModels> {
  if (!pending) {
    const attempt = createVision();
    pending = attempt;
    attempt.catch(() => {
      if (pending === attempt) pending = null;
    });
  }
  return pending;
}

/**
 * Keep the models alive while a game screen is mounted. Returns the release
 * function (use it as an effect cleanup). The models close a moment after
 * the last holder leaves, which lets StrictMode's unmount-remount keep them.
 */
export function holdVision(): () => void {
  holders += 1;
  clearTimeout(disposeTimer);
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    holders = Math.max(0, holders - 1);
    if (holders === 0) disposeTimer = setTimeout(() => holders === 0 && disposeVision(), 1500);
  };
}

/**
 * Close the models now and forget them. Called on Next player, so every
 * visitor starts with fresh trackers; the next loadVision() builds new ones
 * (from the browser cache, while the next visitor picks their moves).
 */
export function disposeVision(): void {
  const current = pending;
  pending = null;
  current?.then(closeModels, () => {});
}

function closeModels(models: VisionModels) {
  if (models.closed) return;
  models.closed = true;
  try {
    models.pose.close();
  } catch {
    // Already closed.
  }
  try {
    models.gesture.close();
  } catch {
    // Already closed.
  }
  for (const canvas of models.canvases) releaseCanvas(canvas);
}

/** MediaPipe never drops its WebGL contexts itself; do it so they don't pile up across visitors. */
function releaseCanvas(canvas: HTMLCanvasElement) {
  try {
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    // The canvas holds another kind of context: nothing to release.
  }
  canvas.width = 0;
  canvas.height = 0;
}

async function createVision(): Promise<VisionModels> {
  const { GestureRecognizer, PoseLandmarker } = await import("@mediapipe/tasks-vision");
  const canvases: HTMLCanvasElement[] = [];

  /** Try the GPU first (much faster), fall back to the CPU when WebGL is not available. */
  async function withDelegate<T>(create: (delegate: Delegate, canvas: HTMLCanvasElement) => Promise<T>) {
    if (!cpuOnly) {
      const gpuCanvas = document.createElement("canvas");
      canvases.push(gpuCanvas);
      try {
        return { task: await create("GPU", gpuCanvas), delegate: "GPU" as Delegate };
      } catch {
        // No WebGL 2 here: use the CPU below.
      }
    }
    const cpuCanvas = document.createElement("canvas");
    canvases.push(cpuCanvas);
    return { task: await create("CPU", cpuCanvas), delegate: "CPU" as Delegate };
  }

  let pose: PoseLandmarker | null = null;
  try {
    // One after the other, like the original: both share the wasm loader script.
    const poseTask = await withDelegate((delegate, canvas) =>
      PoseLandmarker.createFromOptions(MEDIAPIPE_WASM, {
        baseOptions: { modelAssetPath: MEDIAPIPE_MODELS.poseLite, delegate },
        runningMode: "VIDEO",
        numPoses: 1,
        canvas,
      }),
    );
    pose = poseTask.task;
    const gestureTask = await withDelegate((delegate, canvas) =>
      GestureRecognizer.createFromOptions(MEDIAPIPE_WASM, {
        baseOptions: { modelAssetPath: MEDIAPIPE_MODELS.gesture, delegate },
        runningMode: "VIDEO",
        numHands: 2,
        canvas,
      }),
    );
    return {
      pose: poseTask.task,
      gesture: gestureTask.task,
      delegates: { pose: poseTask.delegate, gesture: gestureTask.delegate },
      closed: false,
      lastTimestamp: 0,
      canvases,
    };
  } catch (error) {
    pose?.close();
    for (const canvas of canvases) releaseCanvas(canvas);
    throw error;
  }
}

/* ── Reading a frame ─────────────────────────────────────────────── */

/**
 * Runs both models on the current video frame. Returns null when the video
 * has no frame yet or the models are closed. Throws if MediaPipe fails.
 */
export function analyzeFrame(models: VisionModels, video: HTMLVideoElement, now: number): PerceptionResult | null {
  if (models.closed) return null;
  if (!video.videoWidth || !video.videoHeight || video.readyState < 2) return null;
  const timestamp = Math.max(now, models.lastTimestamp + 1);
  models.lastTimestamp = timestamp;
  const pose = models.pose.detectForVideo(video, timestamp);
  const gestures = models.gesture.recognizeForVideo(video, timestamp);
  return toPerception(pose.landmarks[0] ?? null, gestures, timestamp);
}

const GESTURES: Record<string, HandShape> = {
  Open_Palm: "OPEN_HAND",
  Closed_Fist: "FIST",
  Thumb_Up: "THUMB_UP",
  Pointing_Up: "POINTING",
};

function readHand(landmarks: NormalizedLandmark[], categories: Category[] | undefined): HandReading {
  const top = categories?.[0];
  return {
    landmarks: landmarks.map((p): Point => ({ x: p.x, y: p.y })),
    gesture: (top && GESTURES[top.categoryName]) || "HAND_VISIBLE",
    confidence: top?.score ?? 0,
  };
}

/** Maps raw MediaPipe output to the 17-point reading the rest of the game uses. */
export function toPerception(
  landmarks: NormalizedLandmark[] | null,
  gestureResult: GestureRecognizerResult | null,
  timestamp: number,
): PerceptionResult {
  const hands = (gestureResult?.landmarks ?? []).map((points, i) => readHand(points, gestureResult?.gestures[i]));
  const primaryHand = hands[0] ?? null;
  const base = {
    hasHands: hands.length > 0,
    handCount: hands.length,
    hands,
    primaryHand,
    gesture: primaryHand?.gesture ?? null,
    timestamp,
  };

  if (!landmarks || landmarks.length < 29) {
    return {
      ...base,
      hasPerson: false,
      hasFullBody: false,
      isFaceOnly: false,
      poseLandmarks: [],
      torsoVisible: false,
      legsVisible: false,
    };
  }

  const poseLandmarks = POSE_INDICES.map((index, i): Keypoint => {
    const point = landmarks[index];
    return { x: point.x, y: point.y, score: point.visibility, name: KEYPOINT_NAMES[i] };
  });

  const torsoScore =
    (poseLandmarks[KP.leftShoulder].score +
      poseLandmarks[KP.rightShoulder].score +
      poseLandmarks[KP.leftHip].score +
      poseLandmarks[KP.rightHip].score) /
    4;
  const legsScore = (poseLandmarks[KP.leftKnee].score + poseLandmarks[KP.rightKnee].score) / 2;
  const torsoVisible = torsoScore > TORSO_VISIBLE;

  return {
    ...base,
    hasPerson: true,
    hasFullBody: torsoVisible,
    isFaceOnly: !torsoVisible,
    poseLandmarks,
    torsoVisible,
    legsVisible: legsScore > LEGS_VISIBLE,
  };
}

/* ── Drawing ─────────────────────────────────────────────────────── */

/** Body bones between the 17 points (torso, arms, legs, head to shoulders). */
export const BONES: ReadonlyArray<readonly [number, number]> = [
  [5, 6],
  [6, 12],
  [12, 11],
  [11, 5],
  [5, 7],
  [7, 9],
  [6, 8],
  [8, 10],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [0, 5],
  [0, 6],
];

export interface SkeletonStyle {
  /** Bones and joint outlines. */
  color: string;
  /** Joint fill. */
  joint: string;
  /** CSS-pixel to canvas-pixel ratio, so lines keep their size on any screen. */
  scale: number;
  /** The video is shown mirrored, so the drawing must be too. */
  mirror: boolean;
}

/** Draws the body skeleton and any tracked hands over the video. */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  result: PerceptionResult,
  width: number,
  height: number,
  style: SkeletonStyle,
) {
  const x = (value: number) => (style.mirror ? 1 - value : value) * width;
  const y = (value: number) => value * height;
  const s = style.scale;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const points = result.poseLandmarks;
  if (result.hasPerson && points.length >= 17) {
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 4 * s;
    ctx.beginPath();
    for (const [i, j] of BONES) {
      const a = points[i];
      const b = points[j];
      if (a.score > MIN_POINT_SCORE && b.score > MIN_POINT_SCORE) {
        ctx.moveTo(x(a.x), y(a.y));
        ctx.lineTo(x(b.x), y(b.y));
      }
    }
    ctx.stroke();

    ctx.lineWidth = 2.5 * s;
    points.forEach((point, i) => {
      if (point.score <= MIN_POINT_SCORE) return;
      ctx.beginPath();
      ctx.arc(x(point.x), y(point.y), (i >= KP.leftShoulder && i <= KP.rightHip ? 6 : 4.5) * s, 0, Math.PI * 2);
      ctx.fillStyle = style.joint;
      ctx.fill();
      ctx.strokeStyle = style.color;
      ctx.stroke();
    });
  }

  for (const hand of result.hands) {
    const h = hand.landmarks;
    if (h.length < 21) continue;
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 2.5 * s;
    ctx.beginPath();
    // Wrist to the base of each finger, then along the finger (MediaPipe's 21-point layout).
    for (let finger = 0; finger < 5; finger++) {
      const base = 1 + finger * 4;
      ctx.moveTo(x(h[0].x), y(h[0].y));
      ctx.lineTo(x(h[base].x), y(h[base].y));
      for (let joint = 0; joint < 3; joint++) {
        ctx.moveTo(x(h[base + joint].x), y(h[base + joint].y));
        ctx.lineTo(x(h[base + joint + 1].x), y(h[base + joint + 1].y));
      }
    }
    ctx.stroke();
    ctx.fillStyle = style.joint;
    for (const point of h) {
      ctx.beginPath();
      ctx.arc(x(point.x), y(point.y), 3 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}
