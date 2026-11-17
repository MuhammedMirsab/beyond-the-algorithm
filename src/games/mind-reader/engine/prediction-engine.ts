/**
 * "Let it read my mind": binary search over the numbers still possible.
 * Ported from the original src/logic/predictionEngine.ts.
 *
 * Changes from the original:
 * - It keeps asking until exactly one number is left. The original stopped
 *   after 3, 5 or 6 questions and guessed from what remained, so its first
 *   guess was right only 64 to 80% of the time even with honest answers.
 * - Every question splits the list as evenly as possible. The original asked
 *   "divisible by 3?" as its third question (a one-third split), which pushed
 *   1 to 100 to 8 questions; with even splits 7 is always enough (2^7 = 128).
 * - The parity question stays (question 2), but only when it is an even split.
 * - The two-number divisibility questions ("multiple of 4?") are gone: a
 *   "more than" question splits two numbers just as well and is far easier
 *   for a young visitor to answer correctly.
 * - Questions are typed values instead of "GT_50" / "PARITY_EVEN" strings.
 */

import { evaluateClue, type Clue } from "./clues";
import { formatNumber, halvingsFor, RANGE_MAX, type RangeId } from "./ranges";

export interface PredictionRange {
  id: RangeId;
  max: number;
  /** Safety cap. Even splits finish well inside it (4, 7 and 10 questions). */
  questionCap: number;
}

export const PREDICTION_RANGES: readonly PredictionRange[] = [
  { id: "10", max: RANGE_MAX["10"], questionCap: 6 },
  { id: "100", max: RANGE_MAX["100"], questionCap: 9 },
  { id: "1000", max: RANGE_MAX["1000"], questionCap: 12 },
];

export function predictionRange(id: RangeId): PredictionRange {
  return PREDICTION_RANGES.find((r) => r.id === id) ?? PREDICTION_RANGES[1];
}

/** The two kinds of question the machine asks. Answers come from evaluateClue. */
export type BinaryQuestion = Extract<Clue, { kind: "more-than" } | { kind: "even" }>;

export function getCandidatesForMax(max: number): number[] {
  return Array.from({ length: max }, (_, i) => i + 1);
}

/**
 * The next question for a sorted list of candidates, or null when one is left.
 * The bigger side of every split holds at most ceil(n / 2) numbers.
 */
export function getNextBinaryQuestion(candidates: readonly number[], queryCount: number): BinaryQuestion | null {
  if (candidates.length <= 1) return null;

  // Question 2: "Is your number even?", when it halves the list as well as a middle split would.
  if (queryCount === 1) {
    const evens = candidates.filter((n) => n % 2 === 0).length;
    const bigger = Math.max(evens, candidates.length - evens);
    if (evens > 0 && evens < candidates.length && bigger <= Math.ceil(candidates.length / 2)) {
      return { kind: "even" };
    }
  }

  // The middle split: everything up to the lower middle number says "no".
  const midIndex = Math.floor(candidates.length / 2);
  return { kind: "more-than", value: candidates[midIndex - 1] };
}

export function filterBinaryCandidates(
  currentCandidates: readonly number[],
  question: BinaryQuestion,
  answer: boolean,
): number[] {
  return currentCandidates.filter((n) => evaluateClue(question, n) === answer);
}

/** The machine asks about *your* number. */
export function binaryQuestionText(question: BinaryQuestion): string {
  return question.kind === "even" ? "Is your number even?" : `Is your number more than ${formatNumber(question.value)}?`;
}

/** One-line help under a question. Only parity needs it. */
export function binaryQuestionHint(question: BinaryQuestion): string | null {
  return question.kind === "even" ? "Even numbers end in 0, 2, 4, 6 or 8." : null;
}

/** The plain fact about `n`, used to show why an answer didn't fit: "37 is odd". */
export function binaryFact(question: BinaryQuestion, n: number): string {
  const num = formatNumber(n);
  if (question.kind === "even") return n % 2 === 0 ? `${num} is even` : `${num} is odd`;
  return n > question.value
    ? `${num} is more than ${formatNumber(question.value)}`
    : `${num} is not more than ${formatNumber(question.value)}`;
}

/** What it says when it guesses: the last number, or the middle one if the cap stopped it early. */
export function pickGuess(candidates: readonly number[]): number {
  if (candidates.length === 0) return 1;
  return candidates[Math.floor(candidates.length / 2)];
}

/** Questions even splits need, at most, to get from `count` numbers to one. */
export function questionsNeeded(count: number): number {
  return halvingsFor(count);
}

export interface AnswerRecord {
  question: BinaryQuestion;
  answer: boolean;
}

/**
 * The first answer that doesn't fit `n` (its index), or -1 if all of them fit.
 * From that answer on, `n` was crossed out, so the search could never reach it.
 */
export function findContradiction(answers: readonly AnswerRecord[], n: number): number {
  return answers.findIndex((a) => evaluateClue(a.question, n) !== a.answer);
}
