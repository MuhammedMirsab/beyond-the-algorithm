/**
 * The face mesh points the Cartoon lens reads, kept apart from the model
 * loader so the copy (and its tests) can count them without loading MediaPipe.
 */

/** MediaPipe's face landmarker (with irises) marks this many points on a face. */
export const FACE_POINTS = 478;

/**
 * MediaPipe face mesh indices the Cartoon lens reads. "Right" is the
 * person's own right (the left side of an unmirrored picture).
 */
export const FACE_IDX = {
  // Irises: the centre, then four points on the rim (the iris size).
  irisRight: 468,
  irisRightRim1: 469,
  irisRightRim2: 470,
  irisRightRim3: 471,
  irisRightRim4: 472,
  irisLeft: 473,
  irisLeftRim1: 474,
  irisLeftRim2: 475,
  irisLeftRim3: 476,
  irisLeftRim4: 477,
  // Eye openings: both corners and the middle of each lid.
  eyeRightOuter: 33,
  eyeRightInner: 133,
  eyeRightUpper: 159,
  eyeRightLower: 145,
  eyeLeftInner: 362,
  eyeLeftOuter: 263,
  eyeLeftUpper: 386,
  eyeLeftLower: 374,
  // Head shape.
  forehead: 10,
  chin: 152,
  cheekRight: 50,
  cheekLeft: 280,
  sideRight: 234,
  sideLeft: 454,
  // Nose: the tip and both wings.
  noseTip: 1,
  noseRight: 129,
  noseLeft: 358,
} as const;

export type FacePointName = keyof typeof FACE_IDX;

/** How many of the face's points the lens actually uses. */
export const FACE_POINTS_USED = Object.keys(FACE_IDX).length;

/** Floats in the shader's face uniform (uFace[10] in shaders.ts, filled by faceLayout in face.ts). */
export const FACE_UNIFORM_FLOATS = 40;

/** The highest index read: a result needs this many points plus one. */
export const FACE_MAX_INDEX = Math.max(...Object.values(FACE_IDX));
