import { describe, expect, test } from "bun:test";
import { calculateScore, middleStrategyPath, middleStrategySteps, middleStrategyWorstCase, NUMBER_RANGES, numberRange } from "./game-engine";
import { RANGE_IDS } from "./ranges";

describe("scoring", () => {
  test("first try with no clues gets both bonuses", () => {
    const s = calculateScore(100, 1, 0, 10);
    expect(s.firstTryBonus).toBe(true);
    expect(s.zeroHintBonus).toBe(true);
    expect(s.guessEfficiency).toBe(100);
    expect(s.hintMultiplier).toBe(1.25);
    expect(s.timeBonus).toBe(8);
    // 6000 × 1 × 1.25 × (1 + 35/450) × 1.5
    expect(s.finalScore).toBe(12125);
  });

  test("matches the original formula on an ordinary round", () => {
    // 1 to 100, 4 guesses, 1 clue, 60 s: 6000 × (1 - 3/7 × 0.65) × 0.85 × 1
    const s = calculateScore(100, 4, 1, 60);
    expect(s.basePoints).toBe(6000);
    expect(s.maxGuessesAllowed).toBe(7);
    expect(s.guessEfficiency).toBe(72);
    expect(s.hintMultiplier).toBe(0.85);
    expect(s.timeBonus).toBe(0);
    expect(s.firstTryBonus).toBe(false);
    expect(s.finalScore).toBe(Math.round(6000 * (1 - (3 / 7) * 0.65) * 0.85));
  });

  test("never drops below 100", () => {
    expect(calculateScore(10, 10, 10, 999).finalScore).toBe(100);
  });

  test("more guesses, more clues or more time never score higher", () => {
    for (const max of [10, 100, 1000]) {
      for (let g = 1; g < 10; g++) {
        expect(calculateScore(max, g + 1, 1, 30).finalScore).toBeLessThanOrEqual(calculateScore(max, g, 1, 30).finalScore);
      }
      for (let h = 0; h < 6; h++) {
        expect(calculateScore(max, 3, h + 1, 30).finalScore).toBeLessThanOrEqual(calculateScore(max, 3, h, 30).finalScore);
      }
      for (let t = 0; t < 60; t += 5) {
        expect(calculateScore(max, 3, 1, t + 5).finalScore).toBeLessThanOrEqual(calculateScore(max, 3, 1, t).finalScore);
      }
    }
  });

  test("a harder range is worth more for the same play", () => {
    expect(calculateScore(1000, 3, 1, 30).finalScore).toBeGreaterThan(calculateScore(100, 3, 1, 30).finalScore);
    expect(calculateScore(100, 3, 1, 30).finalScore).toBeGreaterThan(calculateScore(10, 3, 1, 30).finalScore);
  });

  test("an unknown range falls back to 1 to 100", () => {
    expect(calculateScore(37, 1, 1, 60).basePoints).toBe(numberRange("100").baseScore);
  });
});

describe("guess budget", () => {
  test("is exactly what always guessing the middle needs", () => {
    for (const range of RANGE_IDS) {
      expect(numberRange(range).maxGuesses).toBe(middleStrategyWorstCase(range));
    }
    expect(NUMBER_RANGES.map((r) => r.maxGuesses)).toEqual([4, 7, 10]);
  });

  test("the middle strategy path ends on the secret", () => {
    expect(middleStrategyPath(37, 1, 100)).toEqual([50, 25, 37]);
    expect(middleStrategyPath(50, 1, 100)).toEqual([50]);
    expect(middleStrategyPath(100, 1, 100)).toEqual([50, 75, 88, 94, 97, 99, 100]);
    for (let n = 1; n <= 1000; n++) {
      const path = middleStrategyPath(n, 1, 1000);
      expect(path[path.length - 1]).toBe(n);
    }
  });
});

describe("middle strategy, step by step", () => {
  test("matches the path and halves the window every time", () => {
    for (const max of [10, 100, 1000]) {
      for (let secret = 1; secret <= max; secret += max === 1000 ? 7 : 1) {
        const steps = middleStrategySteps(secret, 1, max);
        expect(steps.map((s) => s.guess)).toEqual(middleStrategyPath(secret, 1, max));
        expect(steps[steps.length - 1]).toMatchObject({ guess: secret, result: "correct" });
        for (let i = 1; i < steps.length; i++) {
          expect(steps[i].before).toBe(steps[i - 1].after);
          expect(steps[i].before).toBeLessThanOrEqual(Math.ceil(steps[i - 1].before / 2));
        }
      }
    }
  });

  test("reads like the game: 37 in 1 to 100", () => {
    expect(middleStrategySteps(37, 1, 100).map((s) => [s.low, s.high, s.guess, s.result])).toEqual([
      [1, 100, 50, "lower"],
      [1, 49, 25, "higher"],
      [26, 49, 37, "correct"],
    ]);
  });
});
