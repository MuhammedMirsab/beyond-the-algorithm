import { describe, expect, test } from "bun:test";
import { getGameQuestions } from "./pairs";
import {
  boardDetail,
  MAX_SCORE,
  POINTS_PER_CORRECT,
  rankTier,
  ROUNDS,
  SECONDS_PER_ROUND,
  summarize,
  tallyByLevel,
  verdict,
} from "./scoring";
import type { PlayerAnswer, Side } from "./types";

const answer = (questionIndex: number, isCorrect: boolean, seconds: number, pick: Side | null = isCorrect ? "A" : "B"): PlayerAnswer => ({
  questionIndex,
  pairId: `p${questionIndex}`,
  selectedOptionKey: pick,
  correctOptionKey: "A",
  isCorrect,
  timeTakenSeconds: seconds,
});

describe("constants", () => {
  test("six rounds of 18 seconds, 100 points each", () => {
    expect(ROUNDS).toBe(6);
    expect(SECONDS_PER_ROUND).toBe(18);
    expect(POINTS_PER_CORRECT).toBe(100);
    expect(MAX_SCORE).toBe(600);
  });
});

describe("summarize", () => {
  test("score is correct x 100, accuracy is a whole percent, time is the sum", () => {
    const s = summarize([answer(0, true, 4.2), answer(1, true, 6.1), answer(2, false, 9), answer(3, true, 3.3), answer(4, true, 12), answer(5, false, 18, null)]);
    expect(s.correct).toBe(4);
    expect(s.total).toBe(6);
    expect(s.score).toBe(400);
    expect(s.accuracy).toBe(67);
    expect(s.totalSeconds).toBe(52.6);
    expect(s.averageSeconds).toBe(8.8);
  });

  test("no float noise in the total", () => {
    const s = summarize([answer(0, true, 0.1), answer(1, true, 0.2)]);
    expect(s.totalSeconds).toBe(0.3);
  });

  test("an empty game is all zeros", () => {
    expect(summarize([])).toEqual({ correct: 0, total: 0, score: 0, accuracy: 0, totalSeconds: 0, averageSeconds: 0 });
  });
});

describe("rankTier", () => {
  test("keeps the original 80% and 50% cut-offs", () => {
    expect(rankTier(100).id).toBe("top");
    expect(rankTier(83).id).toBe("top"); // 5 of 6
    expect(rankTier(67).id).toBe("good"); // 4 of 6
    expect(rankTier(50).id).toBe("good"); // 3 of 6
    expect(rankTier(33).id).toBe("new"); // 2 of 6
    expect(rankTier(0).id).toBe("new");
  });
});

describe("verdict", () => {
  test("has variants for all and none", () => {
    expect(verdict(6, 6)).toBe("You spotted all 6");
    expect(verdict(0, 6)).toBe("AI fooled you on all 6");
    expect(verdict(5, 6)).toBe("You spotted 5 of 6");
    expect(verdict(1, 6)).toBe("You spotted 1 of 6");
  });
});

describe("boardDetail", () => {
  test("reads like 5 of 6 · 41s", () => {
    const s = summarize([answer(0, true, 10.4), answer(1, true, 10.4), answer(2, false, 20.3)]);
    expect(boardDetail(s)).toBe("2 of 3 · 41s");
  });
});

describe("tallyByLevel", () => {
  test("counts each tier from the questions played", () => {
    const questions = getGameQuestions(6);
    const answers = questions.map((_, i) => answer(i, i % 2 === 0, 5));
    const tally = tallyByLevel(questions, answers);
    expect(tally.easy).toEqual({ correct: 1, total: 2 });
    expect(tally.medium).toEqual({ correct: 1, total: 2 });
    expect(tally.hard).toEqual({ correct: 1, total: 2 });
  });
});
