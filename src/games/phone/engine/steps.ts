import { pushLimited, stdDev, type Guess } from "./math";

/**
 * A simple step counter and movement classifier on the accelerometer's total
 * force (with gravity, so about 9.8 m/s² when still). The same code runs on
 * the real sensor and on the simulated walk, so the simulation is honest maths
 * on made-up input.
 */

export const GRAVITY = 9.81;
/** A step is counted when the smoothed force rises above HIGH, then re-arms below LOW. */
export const STEP_HIGH = 10.8;
export const STEP_LOW = 10.1;
/** Nobody takes more than about 3.5 steps a second. */
export const STEP_MIN_GAP_MS = 280;
const SMOOTHING = 0.3;
/** About 1.5 s of samples at 60 Hz. */
export const MOVEMENT_WINDOW = 90;

export interface StepState {
  smoothed: number;
  armed: boolean;
  lastStepAt: number;
  steps: number;
  /** Recent raw magnitudes, newest last. */
  recent: number[];
}

export function createStepState(): StepState {
  return { smoothed: GRAVITY, armed: true, lastStepAt: -Infinity, steps: 0, recent: [] };
}

export function magnitude(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

/** Feed one sample (m/s², timestamp in ms). Returns the next state. */
export function stepReducer(state: StepState, force: number, t: number): StepState {
  const smoothed = state.smoothed + SMOOTHING * (force - state.smoothed);
  let { armed, lastStepAt, steps } = state;
  if (armed && smoothed > STEP_HIGH && t - lastStepAt >= STEP_MIN_GAP_MS) {
    steps += 1;
    lastStepAt = t;
    armed = false;
  } else if (!armed && smoothed < STEP_LOW) {
    armed = true;
  }
  return { smoothed, armed, lastStepAt, steps, recent: pushLimited(state.recent, force, MOVEMENT_WINDOW) };
}

export type MovementKind = "still" | "walking" | "running";

/** How much the force wobbles over the last 1.5 s. */
export function movementKind(recent: readonly number[]): MovementKind {
  const spread = stdDev(recent);
  if (spread < 0.45) return "still";
  if (spread < 2.6) return "walking";
  return "running";
}

export function movementGuess(kind: MovementKind): Guess {
  switch (kind) {
    case "still":
      return { label: "Still", because: "The force barely changes, so nothing is moving the phone." };
    case "walking":
      return { label: "Walking", because: "Gentle, regular bumps, about the size a step makes." };
    case "running":
      return {
        label: "Running",
        because: "Big, fast bumps. Shaking looks the same: it only sees the numbers, not you.",
      };
  }
}

/**
 * Made-up accelerometer force for the simulation: a walk is about 2 steps a
 * second with gentle bumps, a run about 3 a second with big ones.
 */
export function syntheticForce(kind: "walk" | "run", seconds: number): number {
  const rate = kind === "walk" ? 1.9 : 2.9;
  const size = kind === "walk" ? 1.9 : 6;
  const phase = 2 * Math.PI * rate * seconds;
  return GRAVITY + size * Math.sin(phase) + size * 0.25 * Math.sin(2 * phase + 0.6);
}
