import { ROUND_MS, roundTenth } from "./scoring";

/**
 * The round timer from the original GameScreen: every tick recomputes the time
 * left from the round's start timestamp, so it never drifts the way counting
 * ticks would. 200 ms ticks, 18 s per round.
 */
export const TICK_MS = 200;

/** Below this many seconds the readout turns to the warning colour. */
export const LOW_TIME_SECONDS = 5;

export interface TimerState {
  remainingMs: number;
  /** Whole seconds left, rounded up: shows 18 at the start and 1 in the last second. */
  secondsLeft: number;
  /** 1 at the start, 0 when time is up. Drives the bar's scaleX. */
  fraction: number;
  done: boolean;
}

export function timerState(elapsedMs: number, durationMs: number = ROUND_MS): TimerState {
  const remainingMs = Math.min(durationMs, Math.max(0, durationMs - elapsedMs));
  return {
    remainingMs,
    secondsLeft: Math.ceil(remainingMs / 1000),
    fraction: durationMs > 0 ? remainingMs / durationMs : 0,
    done: remainingMs <= 0,
  };
}

/**
 * Time a round took, from the real elapsed time at the moment of the answer.
 * (The old keyboard handler read a stale "time left" and recorded 1 s.)
 */
export function secondsTaken(elapsedMs: number, durationMs: number = ROUND_MS): number {
  return roundTenth(Math.min(durationMs, Math.max(0, elapsedMs)) / 1000);
}
