import type { FaceLandmarker, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { MEDIAPIPE_MODELS, MEDIAPIPE_WASM } from "@/lib/mediapipe";
import { FACE_IDX, FACE_MAX_INDEX, type FacePointName } from "./face-points";
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
 *
 * The model only says where things are. Everything the lens draws is plain
 * pixel work in the shader (shaders.ts): no picture is generated.
 */

/** One eye opening, in CSS px (display space). */
export interface EyeShape {
  /** Middle of the two eye corners. */
  mid: Vec2;
  /** Unit vector along the eye, from corner to corner. */
  axis: Vec2;
  /** Half the corner-to-corner width. */
  halfWidth: number;
  /** How far the upper and lower lids sit from the corner line (near 0 when the eye is shut). */
  upper: number;
  lower: number;
  /** Centre and radius of the iris in this eye. */
  iris: Vec2;
  irisRadius: number;
}

/** The face as the Cartoon lens needs it, in CSS px (display space). */
export interface FaceShape {
  /** Iris centres. */
  eyeRight: Vec2;
  eyeLeft: Vec2;
  /** Middle of the head (halfway between forehead and chin). */
  center: Vec2;
  chin: Vec2;
  cheekRight: Vec2;
  cheekLeft: Vec2;
  noseTip: Vec2;
  /** Unit vector from the chin towards the forehead. */
  up: Vec2;
  faceWidth: number;
  faceHeight: number;
  eyeWidth: number;
  noseWidth: number;
  right: EyeShape;
  left: EyeShape;
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

/**
 * The face in the order the shader reads it (uFace[10], laid out in
 * shaders.ts). `pos` maps a point and `size` a length into the target space;
 * unit vectors and presence pass through unchanged.
 */
export function faceLayout(
  f: FaceShape,
  presence: number,
  pos: (p: Vec2) => [number, number],
  size: (l: number) => number,
): number[] {
  const eye = (e: EyeShape) => [
    ...pos(e.mid),
    e.axis.x,
    e.axis.y,
    size(e.halfWidth),
    size(e.upper),
    size(e.lower),
    size(e.irisRadius),
  ];
  return [
    ...pos(f.eyeRight), ...pos(f.eyeLeft),
    ...pos(f.center), size(f.faceWidth), size(f.eyeWidth),
    ...pos(f.chin), presence, size(f.faceHeight),
    ...pos(f.cheekRight), ...pos(f.cheekLeft),
    ...eye(f.right),
    ...eye(f.left),
    ...pos(f.noseTip), size(f.noseWidth), 0,
    f.up.x, f.up.y, 0, 0,
  ];
}

const NAMES = Object.keys(FACE_IDX) as FacePointName[];

const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const len = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Unit vector from a to b (a fallback direction when the two points meet). */
function unit(a: Vec2, b: Vec2, fallback: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy);
  return l > 1e-6 ? { x: dx / l, y: dy / l } : fallback;
}

interface Iris {
  center: Vec2;
  radius: number;
}

function iris(center: Vec2, rim: readonly Vec2[]): Iris {
  let r = 0;
  for (const p of rim) r += len(center, p);
  return { center, radius: r / rim.length };
}

/**
 * One eye opening from its corners and lid middles. The iris is whichever of
 * the two is closer (so a swapped pair of indices could never put an iris in
 * the wrong eye).
 */
function eyeShape(outer: Vec2, inner: Vec2, upperLid: Vec2, lowerLid: Vec2, irises: readonly Iris[]): EyeShape {
  const m = mid(outer, inner);
  const axis = unit(inner, outer, { x: 1, y: 0 });
  // Perpendicular, pointing up the screen (y grows downwards).
  let up = { x: axis.y, y: -axis.x };
  if (up.y > 0) up = { x: -up.x, y: -up.y };
  const halfWidth = Math.max(1, len(outer, inner) / 2);
  const along = (p: Vec2) => (p.x - m.x) * up.x + (p.y - m.y) * up.y;
  const nearest = irises.reduce((best, i) => (len(i.center, m) < len(best.center, m) ? i : best));
  return {
    mid: m,
    axis,
    halfWidth,
    upper: clamp(along(upperLid), 0, halfWidth * 0.9),
    lower: clamp(-along(lowerLid), 0, halfWidth * 0.7),
    iris: nearest.center,
    irisRadius: clamp(nearest.radius, halfWidth * 0.25, halfWidth * 0.7),
  };
}

/**
 * Landmarks → smoothed face shape. Every point goes through a 1€ filter, so
 * the warp and the painted eyes stay still when the visitor is still (a
 * jittery eye looks broken) without lagging when they move or blink.
 * `presence` fades the effect in and out instead of popping.
 */
export class FaceFollower {
  private readonly filters = Object.fromEntries(NAMES.map((n) => [n, new OneEuroFilter2D(1.0, 0.02)] as const)) as Record<
    FacePointName,
    OneEuroFilter2D
  >;
  shape: FaceShape | null = null;
  presence = 0;
  private lastSeen = -Infinity;

  update(lms: NormalizedLandmark[] | null, toScreen: (l: NormalizedLandmark) => Vec2, t: number) {
    if (!lms || lms.length <= FACE_MAX_INDEX) {
      // Hold the last shape for a moment (a blink of lost tracking), then fade out.
      if (t - this.lastSeen > 0.25) this.presence = Math.max(0, this.presence - 0.12);
      if (this.presence === 0) {
        this.shape = null;
        for (const f of Object.values(this.filters)) f.reset();
      }
      return;
    }
    this.lastSeen = t;
    const P = {} as Record<FacePointName, Vec2>;
    for (const name of NAMES) {
      const v = toScreen(lms[FACE_IDX[name]]);
      P[name] = this.filters[name].filter(v.x, v.y, t);
    }

    const irises = [
      iris(P.irisRight, [P.irisRightRim1, P.irisRightRim2, P.irisRightRim3, P.irisRightRim4]),
      iris(P.irisLeft, [P.irisLeftRim1, P.irisLeftRim2, P.irisLeftRim3, P.irisLeftRim4]),
    ];
    const right = eyeShape(P.eyeRightOuter, P.eyeRightInner, P.eyeRightUpper, P.eyeRightLower, irises);
    const left = eyeShape(P.eyeLeftOuter, P.eyeLeftInner, P.eyeLeftUpper, P.eyeLeftLower, irises);
    const faceWidth = Math.max(1, len(P.sideRight, P.sideLeft));

    this.presence = Math.min(1, this.presence + 0.15);
    this.shape = {
      eyeRight: right.iris,
      eyeLeft: left.iris,
      center: mid(P.forehead, P.chin),
      chin: P.chin,
      cheekRight: P.cheekRight,
      cheekLeft: P.cheekLeft,
      noseTip: P.noseTip,
      up: unit(P.chin, P.forehead, { x: 0, y: -1 }),
      faceWidth,
      faceHeight: Math.max(faceWidth * 0.8, len(P.forehead, P.chin)),
      eyeWidth: right.halfWidth + left.halfWidth,
      noseWidth: clamp(len(P.noseRight, P.noseLeft), faceWidth * 0.12, faceWidth * 0.35),
      right,
      left,
    };
  }

  reset() {
    this.shape = null;
    this.presence = 0;
    for (const f of Object.values(this.filters)) f.reset();
  }
}
