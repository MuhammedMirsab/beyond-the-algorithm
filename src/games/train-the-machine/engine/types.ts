/**
 * Shapes shared by the perception engine, the feature extractor and the UI.
 * Every coordinate is normalised to 0..1 in the camera's own (un-mirrored) frame.
 */

/** The 17 body points kept from MediaPipe's 33 (COCO order). */
export const KEYPOINT_NAMES = [
  "nose",
  "left_eye",
  "right_eye",
  "left_ear",
  "right_ear",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
] as const;

export type KeypointName = (typeof KEYPOINT_NAMES)[number];

/** Index of each body point in a 17-point pose. */
export const KP = {
  nose: 0,
  leftEye: 1,
  rightEye: 2,
  leftEar: 3,
  rightEar: 4,
  leftShoulder: 5,
  rightShoulder: 6,
  leftElbow: 7,
  rightElbow: 8,
  leftWrist: 9,
  rightWrist: 10,
  leftHip: 11,
  rightHip: 12,
  leftKnee: 13,
  rightKnee: 14,
  leftAnkle: 15,
  rightAnkle: 16,
} as const;

/** Points below this visibility are treated as not seen (and not drawn). */
export const MIN_POINT_SCORE = 0.25;

export interface Point {
  x: number;
  y: number;
}

export interface Keypoint extends Point {
  /** How sure the pose model is that this point is visible, 0 to 1. */
  score: number;
  name: KeypointName;
}

/** The four hand shapes the gesture model reports that this game uses. */
export type GestureName = "OPEN_HAND" | "FIST" | "THUMB_UP" | "POINTING";

/** A hand was found; its shape is one of the four, or something else ("a hand"). */
export type HandShape = GestureName | "HAND_VISIBLE";

export interface HandReading {
  /** 21 points: wrist, then thumb, index, middle, ring and pinky (4 each). */
  landmarks: Point[];
  gesture: HandShape;
  confidence: number;
}

/** What the machine read from one camera frame. */
export interface PerceptionResult {
  hasPerson: boolean;
  /** Shoulders and hips are in view. */
  hasFullBody: boolean;
  /** A person, but not enough of the body to measure (the opposite of hasFullBody). */
  isFaceOnly: boolean;
  hasHands: boolean;
  handCount: number;
  /** 17 points, or empty when no person was found. */
  poseLandmarks: Keypoint[];
  primaryHand: HandReading | null;
  hands: HandReading[];
  gesture: HandShape | null;
  torsoVisible: boolean;
  legsVisible: boolean;
  /** performance.now() of the frame. */
  timestamp: number;
}
