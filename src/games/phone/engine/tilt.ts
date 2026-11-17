import { clamp, type Guess } from "./math";

/**
 * Tilt maths from the original MotionExperiment: the phone's tilt clamped to
 * ±45° so the picture stays readable, a 45° "holding it to read" rest angle,
 * and the 0.4 drag gain for the mouse simulation.
 */

export const TILT_LIMIT = 45;
/** People hold a phone tilted back about 45° to read it; that counts as level. */
export const REST_BETA = 45;
export const DRAG_GAIN = 0.4;
export const KEY_STEP = 5;

export interface Tilt {
  /** Forward and back, degrees. Positive: the top comes up towards you. */
  pitch: number;
  /** Left and right, degrees. Positive: the right side dips. */
  roll: number;
}

export const LEVEL: Tilt = { pitch: 0, roll: 0 };

const limit = (v: number) => clamp(v, -TILT_LIMIT, TILT_LIMIT);

/** From DeviceOrientationEvent beta (front-back) and gamma (left-right). */
export function tiltFromOrientation(beta: number, gamma: number): Tilt {
  return { pitch: limit(beta - REST_BETA), roll: limit(gamma) };
}

/** Mouse or finger drag: the ball follows the drag, like pushing that side of the phone down. */
export function dragTilt(prev: Tilt, dx: number, dy: number): Tilt {
  return { pitch: limit(prev.pitch + dy * DRAG_GAIN), roll: limit(prev.roll + dx * DRAG_GAIN) };
}

/** Arrow keys tilt in 5° steps, 0 or Home levels it. Returns null for other keys. */
export function keyTilt(prev: Tilt, key: string, step = KEY_STEP): Tilt | null {
  switch (key) {
    case "ArrowLeft":
      return { ...prev, roll: limit(prev.roll - step) };
    case "ArrowRight":
      return { ...prev, roll: limit(prev.roll + step) };
    case "ArrowUp":
      return { ...prev, pitch: limit(prev.pitch - step) };
    case "ArrowDown":
      return { ...prev, pitch: limit(prev.pitch + step) };
    case "0":
    case "Home":
      return LEVEL;
    default:
      return null;
  }
}

/** Where the rolling ball sits, as a fraction of the level's radius (-1 to 1). */
export function ballOffset(tilt: Tilt): { x: number; y: number } {
  return { x: tilt.roll / TILT_LIMIT, y: tilt.pitch / TILT_LIMIT };
}

/** The original's "screen rotated" rule: more than 25° to one side. */
export const SIDEWAYS_AT = 25;

export function tiltGuess(tilt: Tilt): Guess {
  if (Math.abs(tilt.roll) > SIDEWAYS_AT) {
    return {
      label: "Turned on its side",
      because: `Tipped more than ${SIDEWAYS_AT}° to one side, so a video app would turn the picture.`,
    };
  }
  if (tilt.pitch <= -35) {
    return { label: "Lying flat", because: "Gravity pulls straight through the screen, like a phone on a table." };
  }
  if (tilt.pitch >= 35) {
    return { label: "Held upright", because: "Gravity pulls down its length, like a phone held up for a photo." };
  }
  return { label: "In your hand", because: "Tilted back a little, the way people hold a phone to read." };
}
