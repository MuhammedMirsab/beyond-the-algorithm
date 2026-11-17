/**
 * What a move's name says about how to record and check it. The original
 * repeated these keyword checks in five files, each slightly different
 * (one missed "WAVING", another made "Hands up" a hand-shape move). This is
 * the single version.
 */

export type MotionKind = "wave" | "clap" | "walk";

export interface ClassTraits {
  /** A whole-body move (stand, sit, walk, clap, cross): the torso must be in view. */
  needsBody: boolean;
  /** A hand-shape move (hand, fist, palm, thumb, point): a hand must be in view. */
  needsHands: boolean;
  /** Record 1.5 seconds of movement instead of one moment. */
  moving: boolean;
  /** A movement the classifier can check for while testing. */
  motion: MotionKind | null;
  /** A still posture (stand, sit): what walking falls back to when nobody walks. */
  still: boolean;
}

const BODY = /\b(STAND|SIT|WALK|CLAP|CROSS)/;
/** "Hand" but not "hands": "Hands up" is about the arms, not a hand shape. */
const HANDS = /\bHAND(?!S)|\b(FIST|PALM|THUMB|POINT)/;
const MOVING = /\b(WAV|CLAP|WALK|JUMP|DANC|MOTION)/;
const STILL = /\b(STAND|SIT)/;

export function classTraits(name: string): ClassTraits {
  const upper = name.trim().toUpperCase();
  const motion: MotionKind | null = /\bWAV/.test(upper)
    ? "wave"
    : /\bCLAP/.test(upper)
      ? "clap"
      : /\bWALK/.test(upper)
        ? "walk"
        : null;
  return {
    needsBody: BODY.test(upper),
    needsHands: HANDS.test(upper),
    moving: MOVING.test(upper),
    motion,
    still: STILL.test(upper),
  };
}
