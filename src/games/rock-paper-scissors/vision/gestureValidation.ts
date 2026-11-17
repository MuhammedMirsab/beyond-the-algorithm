/**
 * Turning noisy frames into one confident throw, copied from the original app:
 * a 6-frame window must mostly agree before a gesture counts, and a confirmed
 * throw can't be confirmed again for the same round or within 900 ms.
 *
 * Changes from the original: calibration is gone, and `clearValidationBuffer`
 * forgets the frames from before "Shoot" (a fist pumped during the countdown
 * must not count as rock).
 */
import type { CVFrameResult, DetectedGesture, Gesture } from "../engine/types";

export interface ValidationState {
  buffer: Array<{ gesture: DetectedGesture; confidence: number; timestamp: number }>;
  stableGesture: DetectedGesture;
  stabilityProgress: number; // 0..1
  lastConfirmedAt: number;
  lastConfirmedRoundId: string | null;
}

export interface ValidationConfig {
  windowSize: number;
  minConfidence: number;
  requiredAgreementRatio: number;
  cooldownMs: number;
}

export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  windowSize: 6,
  minConfidence: 0.62,
  requiredAgreementRatio: 0.65,
  cooldownMs: 900,
};

export function createValidationState(): ValidationState {
  return {
    buffer: [],
    stableGesture: "none",
    stabilityProgress: 0,
    lastConfirmedAt: 0,
    lastConfirmedRoundId: null,
  };
}

export function pushFrameToValidation(
  state: ValidationState,
  frame: Pick<CVFrameResult, "gesture" | "confidence" | "timestamp" | "qualityIssues">,
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG
): ValidationState {
  const isBlockedByIssue =
    frame.qualityIssues.includes("multiple_hands") ||
    frame.qualityIssues.includes("no_hand");

  const normalizedGesture: DetectedGesture =
    isBlockedByIssue || frame.confidence < config.minConfidence
      ? frame.gesture === "none"
        ? "none"
        : "uncertain"
      : frame.gesture;

  const buffer = [
    ...state.buffer.slice(-(config.windowSize - 1)),
    {
      gesture: normalizedGesture,
      confidence: frame.confidence,
      timestamp: frame.timestamp,
    },
  ];

  // Count valid votes in buffer
  const counts: Record<Gesture, number> = { rock: 0, paper: 0, scissors: 0 };
  for (const item of buffer) {
    if (item.gesture === "rock" || item.gesture === "paper" || item.gesture === "scissors") {
      counts[item.gesture] += 1;
    }
  }

  let best: Gesture = "rock";
  if (counts.paper > counts[best]) best = "paper";
  if (counts.scissors > counts[best]) best = "scissors";

  const bestCount = counts[best];
  const requiredCount = Math.ceil(config.windowSize * config.requiredAgreementRatio);
  const stabilityProgress = Math.min(1, bestCount / requiredCount);
  const stableGesture: DetectedGesture =
    bestCount >= requiredCount ? best : normalizedGesture === "none" ? "none" : "uncertain";

  return {
    ...state,
    buffer,
    stableGesture,
    stabilityProgress,
  };
}

export function canAcceptRoundGesture(
  state: ValidationState,
  roundId: string,
  nowMs: number,
  config: ValidationConfig = DEFAULT_VALIDATION_CONFIG
): { allowed: boolean; gesture: Gesture | null; reason?: string } {
  if (state.lastConfirmedRoundId === roundId) {
    return { allowed: false, gesture: null, reason: "Round already resolved." };
  }
  if (nowMs - state.lastConfirmedAt < config.cooldownMs) {
    return { allowed: false, gesture: null, reason: "Detection cooldown active." };
  }
  if (
    state.stableGesture !== "rock" &&
    state.stableGesture !== "paper" &&
    state.stableGesture !== "scissors"
  ) {
    return { allowed: false, gesture: null, reason: "Gesture not yet stable." };
  }
  return { allowed: true, gesture: state.stableGesture };
}

export function markRoundGestureConfirmed(
  state: ValidationState,
  roundId: string,
  nowMs: number
): ValidationState {
  return {
    ...state,
    lastConfirmedAt: nowMs,
    lastConfirmedRoundId: roundId,
  };
}

/**
 * Forget the frames seen so far but keep what was already confirmed, so the
 * duplicate-round and cooldown guards still hold.
 */
export function clearValidationBuffer(state: ValidationState): ValidationState {
  return {
    ...createValidationState(),
    lastConfirmedAt: state.lastConfirmedAt,
    lastConfirmedRoundId: state.lastConfirmedRoundId,
  };
}
