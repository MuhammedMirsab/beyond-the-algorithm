/**
 * The face mesh points the Cartoon lens reads, kept apart from the model
 * loader so the copy (and its tests) can count them without loading MediaPipe.
 */

/** MediaPipe's face landmarker (with irises) marks this many points on a face. */
export const FACE_POINTS = 478;

/** MediaPipe face mesh indices the Cartoon lens reads. */
export const FACE_IDX = {
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

/** How many of the face's points the lens actually uses. */
export const FACE_POINTS_USED = Object.keys(FACE_IDX).length;
