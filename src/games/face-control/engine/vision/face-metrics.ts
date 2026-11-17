import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

/**
 * Indices into MediaPipe's 478-point face mesh. "Left"/"right" are the
 * subject's own sides (so the subject's right eye appears on the left of an
 * un-mirrored camera image).
 */
export const LM = {
  rightEyeOuter: 33,
  rightEyeInner: 133,
  leftEyeInner: 362,
  leftEyeOuter: 263,
  noseTip: 1,
  forehead: 10,
  chin: 152,
  mouthRight: 61,
  mouthLeft: 291,
  /** Vertically aligned inner-lip pairs: [upper, lower]. */
  innerLipPairs: [
    [82, 87],
    [13, 14],
    [312, 317],
  ] as const,
} as const;

/** Face outline (36 points), used to draw the tracking overlay. */
export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150,
  136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];
export const INNER_LIPS = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
export const RIGHT_EYE = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7];
export const LEFT_EYE = [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249];

export interface FaceMetrics {
  /**
   * Roll of the eye line in degrees, measured in the raw (un-mirrored) camera
   * image. Positive when the subject tilts their head toward their LEFT shoulder.
   */
  roll: number;
  /**
   * Yaw proxy: how far the nose tip sits along the eye axis from the eye
   * midpoint, in eye-distances. Positive when the subject turns to their LEFT.
   */
  yaw: number;
  /** Inner-lip gap divided by the 3D eye distance (scale invariant). */
  mouth: number;
  /** Outer eye-corner distance in pixels (3D). */
  eyeDistPx: number;
  /** Face bounding box in raw normalised image coordinates. */
  box: { cx: number; cy: number; w: number; h: number };
}

interface P3 {
  x: number;
  y: number;
  z: number;
}

const toPx = (lm: NormalizedLandmark, w: number, h: number): P3 => ({ x: lm.x * w, y: lm.y * h, z: lm.z * w });
const dist3 = (a: P3, b: P3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * Turns 478 landmarks into the three numbers the game needs. Everything is
 * computed in pixel space (x and y are normalised by different image sides)
 * and divided by the eye distance, so it doesn't matter how far the player
 * stands from the camera or how their face is proportioned.
 */
export function computeMetrics(lms: NormalizedLandmark[], width: number, height: number): FaceMetrics | null {
  if (lms.length < 468) return null;
  const a = toPx(lms[LM.rightEyeOuter], width, height);
  const b = toPx(lms[LM.leftEyeOuter], width, height);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const eye2 = Math.hypot(dx, dy);
  const eye3 = dist3(a, b);
  if (eye2 < 1e-3 || eye3 < 1e-3) return null;

  const roll = (Math.atan2(dy, dx) * 180) / Math.PI;

  // Nose tip projected onto the eye axis — independent of roll.
  const nose = toPx(lms[LM.noseTip], width, height);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const yaw = ((nose.x - mx) * dx + (nose.y - my) * dy) / (eye2 * eye2);

  let gap = 0;
  for (const [u, l] of LM.innerLipPairs) gap += dist3(toPx(lms[u], width, height), toPx(lms[l], width, height));
  const mouth = gap / LM.innerLipPairs.length / eye3;

  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (let i = 0; i < 468; i++) {
    const p = lms[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    roll,
    yaw,
    mouth,
    eyeDistPx: eye3,
    box: { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY },
  };
}

/** Wraps an angle difference into (-180, 180]. */
export const angleDiff = (a: number, b: number) => {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
};
