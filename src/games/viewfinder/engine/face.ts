import type { FaceLandmarker, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { MEDIAPIPE_MODELS, MEDIAPIPE_WASM } from "@/lib/mediapipe";
import type { Vec2 } from "./geometry";
import { OneEuroFilter2D } from "./one-euro";
import type { Delegate } from "./tracker";

/**
 * The Cartoon lens's face model. Only loaded the first time a visitor picks
 * that lens (the other lenses never need it), from the same self-hosted
 * runtime as the hand model, so it is one 3.7 MB model download. It only
 * runs on frames where the Cartoon lens is on screen.
 *
 * One face: with room for two, MediaPipe re-runs its face detector on every
 * frame looking for the missing one, which makes each frame much slower
 * (measured in Face Control).
 */

/** MediaPipe face mesh indices (478-point model with irises). */
const IDX = {
  irisRight: 468, // the person's right eye (left side of an unmirrored picture)
  irisLeft: 473,
  eyeRightOuter: 33,
  eyeRightInner: 133,
  eyeLeftInner: 362,
  eyeLeftOuter: 263,
  forehead: 10,
  chin: 152,
  cheekRight: 50,
  cheekLeft: 280,
  sideRight: 234,
  sideLeft: 454,
} as const;

/** The handful of face points the Cartoon lens uses, in CSS px (display space). */
export interface FaceShape {
  eyeRight: Vec2;
  eyeLeft: Vec2;
  /** Middle of the head (halfway between forehead and chin). */
  center: Vec2;
  chin: Vec2;
  cheekRight: Vec2;
  cheekLeft: Vec2;
  faceWidth: number;
  eyeWidth: number;
}

export class FaceTracker {
  private lastTs = 0;
  constructor(private readonly landmarker: FaceLandmarker) {}

  detect(source: TexImageSource, nowMs: number): NormalizedLandmark[] | null {
    const ts = Math.max(nowMs, this.lastTs + 1);
    this.lastTs = ts;
    return this.landmarker.detectForVideo(source, ts).faceLandmarks[0] ?? null;
  }

  close() {
    this.landmarker.close();
  }
}

async function createFaceTracker(delegate: Delegate): Promise<FaceTracker> {
  const vision = await import("@mediapipe/tasks-vision");
  const res = await fetch(MEDIAPIPE_MODELS.face);
  if (!res.ok) throw new Error(`Failed to load the face model (HTTP ${res.status})`);
  const model = new Uint8Array(await res.arrayBuffer());
  const landmarker = await vision.FaceLandmarker.createFromOptions(MEDIAPIPE_WASM, {
    baseOptions: { modelAssetBuffer: model, delegate },
    runningMode: "VIDEO",
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
  return new FaceTracker(landmarker);
}

let shared: Promise<FaceTracker> | null = null;
let generation = 0;

/** Starts (or joins) the one face model load. A failed load can be retried. */
export function loadFaceTracker(delegate: Delegate): Promise<FaceTracker> {
  if (!shared) {
    const gen = generation;
    shared = createFaceTracker(delegate).then(
      (tracker) => {
        if (gen !== generation) {
          tracker.close();
          throw new Error("The face tracker was released while it loaded");
        }
        return tracker;
      },
      (err: unknown) => {
        if (gen === generation) shared = null;
        throw err;
      },
    );
  }
  return shared;
}

/** Frees the face model when the game leaves the screen. */
export function disposeFaceTracker() {
  const current = shared;
  generation++;
  shared = null;
  current?.then(
    (t) => t.close(),
    () => {},
  );
}

const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const len = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Landmarks → smoothed face shape. The 1€ filter keeps the warp still when
 * the visitor is still (a jittery eye bulge looks broken) without lagging
 * when they move. `presence` fades the warp in and out instead of popping.
 */
export class FaceFollower {
  private readonly filters = Array.from({ length: 6 }, () => new OneEuroFilter2D(1.0, 0.02));
  private faceW = 0;
  private eyeW = 0;
  shape: FaceShape | null = null;
  presence = 0;
  private lastSeen = -Infinity;

  update(lms: NormalizedLandmark[] | null, toScreen: (l: NormalizedLandmark) => Vec2, t: number) {
    if (!lms || lms.length <= IDX.irisLeft) {
      // Hold the last shape for a moment (a blink of lost tracking), then fade out.
      if (t - this.lastSeen > 0.25) this.presence = Math.max(0, this.presence - 0.12);
      if (this.presence === 0) {
        this.shape = null;
        for (const f of this.filters) f.reset();
      }
      return;
    }
    this.lastSeen = t;
    const p = (i: number) => toScreen(lms[i]);
    const raw = [
      p(IDX.irisRight),
      p(IDX.irisLeft),
      mid(p(IDX.forehead), p(IDX.chin)),
      p(IDX.chin),
      p(IDX.cheekRight),
      p(IDX.cheekLeft),
    ];
    const s = raw.map((v, i) => this.filters[i].filter(v.x, v.y, t));
    const faceW = len(p(IDX.sideRight), p(IDX.sideLeft));
    const eyeW = (len(p(IDX.eyeRightOuter), p(IDX.eyeRightInner)) + len(p(IDX.eyeLeftInner), p(IDX.eyeLeftOuter))) / 2;
    this.faceW = this.faceW ? this.faceW * 0.7 + faceW * 0.3 : faceW;
    this.eyeW = this.eyeW ? this.eyeW * 0.7 + eyeW * 0.3 : eyeW;
    this.presence = Math.min(1, this.presence + 0.15);
    this.shape = {
      eyeRight: s[0],
      eyeLeft: s[1],
      center: s[2],
      chin: s[3],
      cheekRight: s[4],
      cheekLeft: s[5],
      faceWidth: this.faceW,
      eyeWidth: this.eyeW,
    };
  }

  reset() {
    this.shape = null;
    this.presence = 0;
    this.faceW = this.eyeW = 0;
    for (const f of this.filters) f.reset();
  }
}
