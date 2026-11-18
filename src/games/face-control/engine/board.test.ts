/** The score and line a finished run puts on the shared board. */
import { describe, expect, test } from "bun:test";
import { boardDetail, boardScore, boardTiebreak, type RunForBoard } from "./board";

const run = (patch: Partial<RunForBoard>): RunForBoard => ({
  outcome: "victory",
  score: 4820,
  levelIndex: 2,
  furthest: 1,
  levelCount: 3,
  runTime: 83.4,
  ...patch,
});

describe("The board score", () => {
  test("is the run's own score, whole and never negative", () => {
    expect(boardScore(run({}))).toBe(4820);
    expect(boardScore(run({ score: 12.6 }))).toBe(13);
    expect(boardScore(run({ score: -5 }))).toBe(0);
    expect(boardScore(run({ score: Number.NaN }))).toBe(0);
    expect(boardScore(run({ score: 1e9 }))).toBe(10_000_000);
  });

  test("ties go to the faster run", () => {
    expect(boardTiebreak(run({ runTime: 40 }))).toBeLessThan(boardTiebreak(run({ runTime: 41 })));
    expect(boardTiebreak(run({ runTime: -1 }))).toBe(0);
  });
});

describe("The board line", () => {
  test("says how far the run got and how long it took", () => {
    expect(boardDetail(run({}))).toBe("All 3 levels · 1:23.4");
    expect(boardDetail(run({ outcome: "game-over", levelIndex: 1, furthest: 0.64, runTime: 45.2 }))).toBe("Level 2, 64% · 0:45.2");
    expect(boardDetail(run({ outcome: "game-over", levelIndex: 0, furthest: 2 })).startsWith("Level 1, 100%")).toBe(true);
    expect(boardDetail(run({})).length).toBeLessThanOrEqual(80);
  });
});
