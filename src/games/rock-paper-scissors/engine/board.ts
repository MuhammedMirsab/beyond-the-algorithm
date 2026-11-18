/**
 * The score a finished match puts on the shared board (Firestore,
 * boards/rock-paper-scissors). Higher is better:
 *
 *   (your wins x 100 - its wins x 30 + 150 for winning the match
 *    + how hard you were to read, 0-100) x difficulty (1, 1.5, 2)
 *
 * Ties go to the match with fewer rounds. A perfect Hard match (5 to 0, never
 * guessed) is 1,500.
 */
import type { Difficulty } from "./types";

export const BOARD_ID = "rock-paper-scissors";

const DIFFICULTY_FACTOR: Record<Difficulty, number> = { easy: 1, normal: 1.5, hard: 2 };
const DIFFICULTY_NAME: Record<Difficulty, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };

export interface MatchSummary {
  playerScore: number;
  aiScore: number;
  won: boolean;
  /** Rounds played, draws included. */
  rounds: number;
  /** Share of rounds where it guessed your throw, 0-100. */
  accuracy: number;
  difficulty: Difficulty;
}

export function boardScore(m: MatchSummary): number {
  const base = m.playerScore * 100 - m.aiScore * 30 + (m.won ? 150 : 0) + (100 - m.accuracy);
  return Math.max(0, Math.round(base * DIFFICULTY_FACTOR[m.difficulty]));
}

/** The second line on the board, e.g. "Won 5 to 2 · Hard · read 29%". */
export function boardDetail(m: MatchSummary): string {
  const result = m.won ? `Won ${m.playerScore} to ${m.aiScore}` : `Lost ${m.playerScore} to ${m.aiScore}`;
  return `${result} · ${DIFFICULTY_NAME[m.difficulty]} · read ${m.accuracy}%`;
}
