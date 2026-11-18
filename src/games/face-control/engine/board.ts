/**
 * What a finished run puts on the shared board (Firestore,
 * boards/face-control). The score is the game's own run score; ties go to the
 * faster run.
 */
import { formatTime } from "./format";

export const BOARD_ID = "face-control";

export interface RunForBoard {
  outcome: "game-over" | "victory";
  score: number;
  /** Level reached, 0-based. */
  levelIndex: number;
  /** How far through that level, 0 to 1. */
  furthest: number;
  levelCount: number;
  runTime: number;
}

/** Whole, never negative and inside what the Firestore rules accept. */
export function boardScore(run: RunForBoard): number {
  const s = Number.isFinite(run.score) ? Math.round(run.score) : 0;
  return Math.min(10_000_000, Math.max(0, s));
}

/** The second line on the board, e.g. "All 3 levels · 1:23.4" or "Level 2, 64% · 0:45.2". */
export function boardDetail(run: RunForBoard): string {
  const time = formatTime(run.runTime);
  if (run.outcome === "victory") return `All ${run.levelCount} levels · ${time}`;
  const pct = Math.round(Math.min(1, Math.max(0, run.furthest)) * 100);
  return `Level ${run.levelIndex + 1}, ${pct}% · ${time}`;
}

/** Faster runs win ties: tenths of a second, smaller is better. */
export function boardTiebreak(run: RunForBoard): number {
  return Math.round(Math.max(0, Number.isFinite(run.runTime) ? run.runTime : 0) * 10);
}
