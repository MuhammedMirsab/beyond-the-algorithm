/**
 * "Find its number": ranges, clue cards and scoring.
 * Ported from the original src/logic/gameEngine.ts.
 *
 * Changes from the original:
 * - Three ranges (1 to 10, 1 to 100, 1 to 1,000) instead of six.
 * - maxGuesses is exactly what always guessing the middle needs in the worst
 *   case (4, 7, 10), so "You have 7 guesses" is a fair, beatable budget.
 * - Clue cards are worded from the range, never from the secret. The original
 *   phrased the half card as "≤ 50" or "> 50" depending on the secret, and
 *   centred the bracket and "nearby" cards on it, so the cards gave the
 *   number away before anyone used them. Answers are worked out on use.
 * - calculateScore is unchanged apart from types.
 */

import type { Clue } from "./clues";
import { formatNumber, RANGE_MAX, type RangeId } from "./ranges";

export interface NumberRangeOption {
  id: RangeId;
  /** "1 to 100" */
  label: string;
  min: number;
  max: number;
  /** Guesses allowed. Always guessing the middle never needs more. */
  maxGuesses: number;
  /** Clue cards and typed questions allowed, together (from the original table). */
  maxSuggestions: number;
  /** Points before the multipliers (from the original table). */
  baseScore: number;
}

export const NUMBER_RANGES: readonly NumberRangeOption[] = [
  { id: "10", label: "1 to 10", min: 1, max: 10, maxGuesses: 4, maxSuggestions: 1, baseScore: 1000 },
  { id: "100", label: "1 to 100", min: 1, max: 100, maxGuesses: 7, maxSuggestions: 3, baseScore: 6000 },
  { id: "1000", label: `1 to ${formatNumber(1000)}`, min: 1, max: 1000, maxGuesses: 10, maxSuggestions: 5, baseScore: 20000 },
];

export function numberRange(id: RangeId): NumberRangeOption {
  return NUMBER_RANGES.find((r) => r.id === id) ?? NUMBER_RANGES[1];
}

export function getMaxSuggestionsForRange(maxRange: number): number {
  return NUMBER_RANGES.find((r) => r.max === maxRange)?.maxSuggestions ?? 3;
}

export interface SuggestionItem {
  id: string;
  category: "half" | "parity" | "bracket" | "divisibility";
  clue: Clue;
}

/**
 * The clue cards for a range. Only the range goes in, so the wording cannot
 * depend on the secret. Same categories and order as the original pool, minus
 * the two cards that could only be written by knowing the answer.
 */
export function generateSuggestionsPool(maxRange: number): SuggestionItem[] {
  const half = Math.floor(maxRange / 2);
  const quarter = Math.floor(maxRange / 4);
  return [
    { id: "s-macro-1", category: "half", clue: { kind: "more-than", value: half } },
    { id: "s-parity-2", category: "parity", clue: { kind: "even" } },
    // The middle half of the range (26 to 75 for 1 to 100): yes keeps the middle, no keeps both ends.
    { id: "s-bracket-3", category: "bracket", clue: { kind: "between", low: quarter + 1, high: quarter + half } },
    { id: "s-div-5", category: "divisibility", clue: { kind: "multiple-of", divisor: 5 } },
    { id: "s-div-3", category: "divisibility", clue: { kind: "multiple-of", divisor: 3 } },
  ];
}

export interface ScoreBreakdown {
  finalScore: number;
  basePoints: number;
  /** 35 to 100: share of the base points kept after the guesses used. */
  guessEfficiency: number;
  /** 0.2 to 1.25: clue multiplier, including the no-clue bonus. */
  hintMultiplier: number;
  zeroHintBonus: boolean;
  firstTryBonus: boolean;
  /** 0 to 10: extra percent for finishing in under 45 seconds. */
  timeBonus: number;
  guessesUsed: number;
  maxGuessesAllowed: number;
}

export function calculateScore(
  maxRange: number,
  guessesCount: number,
  hintsUsedCount: number,
  timeSeconds: number,
): ScoreBreakdown {
  const rangeConfig = NUMBER_RANGES.find((r) => r.max === maxRange) ?? numberRange("100");
  const basePoints = rangeConfig.baseScore;
  const maxGuessesAllowed = rangeConfig.maxGuesses;

  const isFirstTry = guessesCount === 1 && hintsUsedCount === 0;

  const guessStepFraction = (guessesCount - 1) / Math.max(1, maxGuessesAllowed);
  const guessFactor = Math.max(0.35, 1.0 - guessStepFraction * 0.65);

  let hintFactor = Math.max(0.2, 1.0 - hintsUsedCount * 0.15);
  const zeroHintBonus = hintsUsedCount === 0;
  if (zeroHintBonus) {
    hintFactor *= 1.25;
  }

  let timeFactor = 1.0;
  if (timeSeconds < 45) {
    timeFactor += (45 - timeSeconds) / 450;
  }

  let calculated = basePoints * guessFactor * hintFactor * timeFactor;

  if (isFirstTry) {
    calculated *= 1.5;
  }

  const finalScore = Math.max(100, Math.round(calculated));

  return {
    finalScore,
    basePoints,
    guessEfficiency: Math.round(guessFactor * 100),
    hintMultiplier: Number(hintFactor.toFixed(2)),
    zeroHintBonus,
    firstTryBonus: isFirstTry,
    timeBonus: Math.round((timeFactor - 1.0) * 100),
    guessesUsed: guessesCount,
    maxGuessesAllowed,
  };
}

/** The guesses "always guess the middle" makes to find `secret`. Ends on the secret. */
export function middleStrategyPath(secret: number, min: number, max: number): number[] {
  const path: number[] = [];
  let lo = min;
  let hi = max;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    path.push(mid);
    if (mid === secret) break;
    if (secret > mid) lo = mid + 1;
    else hi = mid - 1;
  }
  return path;
}

export interface MiddleStep {
  guess: number;
  /** The window before this guess. */
  low: number;
  high: number;
  result: "higher" | "lower" | "correct";
  /** Numbers possible before and after. */
  before: number;
  after: number;
}

/** "Always guess the middle", step by step, with the window each guess cut. */
export function middleStrategySteps(secret: number, min: number, max: number): MiddleStep[] {
  const steps: MiddleStep[] = [];
  let lo = min;
  let hi = max;
  while (lo <= hi) {
    const guess = Math.floor((lo + hi) / 2);
    const result = guess === secret ? "correct" : secret > guess ? "higher" : "lower";
    const before = hi - lo + 1;
    const nextLo = result === "higher" ? guess + 1 : lo;
    const nextHi = result === "lower" ? guess - 1 : hi;
    steps.push({ guess, low: lo, high: hi, result, before, after: result === "correct" ? 1 : nextHi - nextLo + 1 });
    if (result === "correct") break;
    lo = nextLo;
    hi = nextHi;
  }
  return steps;
}

/** Worst case of the middle strategy over a whole range. */
export function middleStrategyWorstCase(range: RangeId): number {
  const max = RANGE_MAX[range];
  let worst = 0;
  for (let n = 1; n <= max; n++) worst = Math.max(worst, middleStrategyPath(n, 1, max).length);
  return worst;
}
