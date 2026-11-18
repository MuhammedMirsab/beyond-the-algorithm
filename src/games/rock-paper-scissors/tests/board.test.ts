/** The score and line a finished match puts on the shared board. */
import { describe, expect, it } from "bun:test";
import { boardDetail, boardScore, type MatchSummary } from "../engine/board";

const match = (patch: Partial<MatchSummary>): MatchSummary => ({
  playerScore: 5,
  aiScore: 2,
  won: true,
  rounds: 9,
  accuracy: 30,
  difficulty: "normal",
  ...patch,
});

describe("The board score", () => {
  it("is 1,500 for a perfect Hard match", () => {
    expect(boardScore(match({ aiScore: 0, accuracy: 0, difficulty: "hard" }))).toBe(1500);
  });

  it("ranks a win above a loss, a bigger margin higher, and harder levels higher", () => {
    const win = boardScore(match({}));
    expect(win).toBeGreaterThan(boardScore(match({ playerScore: 4, aiScore: 5, won: false })));
    expect(boardScore(match({ aiScore: 0 }))).toBeGreaterThan(win);
    expect(boardScore(match({ difficulty: "hard" }))).toBeGreaterThan(win);
    expect(win).toBeGreaterThan(boardScore(match({ difficulty: "easy" })));
    expect(win).toBeGreaterThan(boardScore(match({ accuracy: 60 })));
  });

  it("never goes below zero and stays inside what the Firestore rules accept", () => {
    const worst = boardScore(match({ playerScore: 0, aiScore: 5, won: false, accuracy: 100, difficulty: "easy" }));
    expect(worst).toBe(0);
    expect(Number.isInteger(boardScore(match({ difficulty: "normal", accuracy: 33 })))).toBe(true);
  });

  it("writes a short second line with no dashes", () => {
    expect(boardDetail(match({ difficulty: "hard", accuracy: 29 }))).toBe("Won 5 to 2 · Hard · read 29%");
    expect(boardDetail(match({ playerScore: 3, aiScore: 5, won: false }))).toBe("Lost 3 to 5 · Normal · read 30%");
    expect(boardDetail(match({})).length).toBeLessThanOrEqual(80);
  });
});
