/**
 * When the model answers and when it says "I don't know". Copied from the
 * original predictWithClassifier, pulled out as pure functions so the booth
 * slider can re-decide without running the model again, and so it is tested.
 *
 * Three ways to stay quiet:
 * - unfamiliar: the photo's numbers are far from the average example of the
 *   group it picked (cosine similarity below the cutoff set at training).
 * - unsure: its best guess is below the threshold the visitor chose.
 * - torn: with 3 or more groups, the top two are nearly tied.
 */

export interface Candidate {
  label: string;
  /** Softmax output, 0 to 1. */
  probability: number;
  /** Cosine similarity to that group's average training example. */
  similarity: number;
}

export type UnknownReason = "unfamiliar" | "unsure" | "torn";

export interface Decision {
  /** The label it answers with, or null for "I don't know". */
  answer: string | null;
  reason: UnknownReason | null;
  top: Candidate;
  runnerUp: Candidate | null;
}

/** The original's "close competition" rule. */
export const TORN_MAX_PROBABILITY = 0.7;
export const TORN_MAX_MARGIN = 0.12;

/** Default for the "How sure must it be?" slider. */
export const DEFAULT_THRESHOLD = 0.7;
export const THRESHOLD_MIN = 0.5;
export const THRESHOLD_MAX = 0.95;

/** Highest probability first. Returns a copy. */
export function rankCandidates(candidates: readonly Candidate[]): Candidate[] {
  return [...candidates].sort((a, b) => b.probability - a.probability);
}

export function decide(
  candidates: readonly Candidate[],
  { threshold, similarityCutoff }: { threshold: number; similarityCutoff: number },
): Decision {
  if (candidates.length === 0) throw new Error("decide() needs at least one candidate");
  const ranked = rankCandidates(candidates);
  const top = ranked[0];
  const runnerUp = ranked[1] ?? null;
  const margin = runnerUp ? top.probability - runnerUp.probability : top.probability;

  const unfamiliar = top.similarity < similarityCutoff;
  const unsure = top.probability < threshold;
  const torn = ranked.length > 2 && top.probability < TORN_MAX_PROBABILITY && margin < TORN_MAX_MARGIN;

  // Same precedence as the original: distance first, then confidence, then a tie.
  const reason: UnknownReason | null = unfamiliar ? "unfamiliar" : unsure ? "unsure" : torn ? "torn" : null;
  return { answer: reason ? null : top.label, reason, top, runnerUp };
}

export const CUTOFF_SHARE = 0.8;
export const CUTOFF_MIN = 0.42;
export const CUTOFF_MAX = 0.68;

/**
 * The open-set cutoff learned at training time: 80% of the average
 * similarity between each training example and the average of the other
 * examples in its group, kept between 0.42 and 0.68 (the original's bounds).
 * More, more consistent examples give a tighter cutoff.
 *
 * Tuned on the real library with scripts/check-model.ts: for pen vs cup with
 * 10 examples each it refuses about 2% of new pen and cup photos and about
 * three quarters of photos of other things. The original rule (72% of a
 * self-inclusive average) refused 36% of new photos at 5 examples each.
 */
export function similarityCutoffFrom(leaveOneOutSimilarities: readonly number[]): number {
  if (leaveOneOutSimilarities.length === 0) return CUTOFF_MIN;
  const mean = leaveOneOutSimilarities.reduce((a, b) => a + b, 0) / leaveOneOutSimilarities.length;
  return Number(Math.max(CUTOFF_MIN, Math.min(CUTOFF_MAX, mean * CUTOFF_SHARE)).toFixed(3));
}

export type Outcome = "right" | "wrong" | "unknown";

/** How a decision scores against the photo's real label. */
export function outcomeOf(decision: Decision, truth: string): Outcome {
  if (decision.answer === null) return "unknown";
  return decision.answer === truth ? "right" : "wrong";
}

export interface Tally {
  right: number;
  wrong: number;
  unknown: number;
  total: number;
}

export function tally(outcomes: readonly Outcome[]): Tally {
  const t: Tally = { right: 0, wrong: 0, unknown: 0, total: outcomes.length };
  for (const o of outcomes) t[o]++;
  return t;
}
