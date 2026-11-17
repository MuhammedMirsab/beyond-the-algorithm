import type { ActiveQuestion, Difficulty, PlayerAnswer } from "./types";

/** One place for the numbers the old app hard-coded as "6 / 18s / 600". */
export const ROUNDS = 6;
export const SECONDS_PER_ROUND = 18;
export const ROUND_MS = SECONDS_PER_ROUND * 1000;
export const POINTS_PER_CORRECT = 100;
export const MAX_SCORE = ROUNDS * POINTS_PER_CORRECT;

/** Seconds as the board and stats show them: one decimal, no float noise. */
export const roundTenth = (value: number) => Math.round(value * 10) / 10;

export interface GameSummary {
  correct: number;
  total: number;
  /** correct x 100, as in the original. */
  score: number;
  /** Whole percent, as in the original. */
  accuracy: number;
  /** Sum of every round's time. Timeouts count as the full round. Lower breaks ties on the board. */
  totalSeconds: number;
  averageSeconds: number;
}

/** The scoring from the original App.tsx: score = correct x 100, accuracy, total time. */
export function summarize(answers: readonly PlayerAnswer[]): GameSummary {
  const total = answers.length;
  const correct = answers.filter((a) => a.isCorrect).length;
  const totalSeconds = roundTenth(answers.reduce((sum, a) => sum + a.timeTakenSeconds, 0));
  return {
    correct,
    total,
    score: correct * POINTS_PER_CORRECT,
    accuracy: total === 0 ? 0 : Math.round((correct / total) * 100),
    totalSeconds,
    averageSeconds: total === 0 ? 0 : roundTenth(totalSeconds / total),
  };
}

export type TierId = "top" | "good" | "new";

/** The original's three rank tiers (80% and 50% cut-offs), renamed in plain words. */
export function rankTier(accuracy: number): { id: TierId; name: string } {
  if (accuracy >= 80) return { id: "top", name: "Top detective" };
  if (accuracy >= 50) return { id: "good", name: "Good detective" };
  return { id: "new", name: "New detective" };
}

/** The result headline. */
export function verdict(correct: number, total: number): string {
  if (total > 0 && correct === total) return `You spotted all ${total}`;
  if (correct === 0) return `AI fooled you on all ${total}`;
  return `You spotted ${correct} of ${total}`;
}

/** The scoreboard's second line, e.g. "5 of 6 · 41s". */
export function boardDetail(summary: GameSummary): string {
  return `${summary.correct} of ${summary.total} · ${Math.round(summary.totalSeconds)}s`;
}

export type LevelTally = Record<Difficulty, { correct: number; total: number }>;

/** How the visitor did on each difficulty tier. */
export function tallyByLevel(questions: readonly ActiveQuestion[], answers: readonly PlayerAnswer[]): LevelTally {
  const tally: LevelTally = {
    easy: { correct: 0, total: 0 },
    medium: { correct: 0, total: 0 },
    hard: { correct: 0, total: 0 },
  };
  for (const answer of answers) {
    const question = questions[answer.questionIndex];
    if (!question) continue;
    const level = tally[question.pair.difficulty];
    level.total += 1;
    if (answer.isCorrect) level.correct += 1;
  }
  return tally;
}
