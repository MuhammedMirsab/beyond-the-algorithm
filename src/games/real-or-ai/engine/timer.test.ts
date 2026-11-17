import { describe, expect, test } from "bun:test";
import { ROUND_MS } from "./scoring";
import { secondsTaken, timerState } from "./timer";

describe("timerState", () => {
  test("starts full at 18", () => {
    expect(timerState(0)).toEqual({ remainingMs: ROUND_MS, secondsLeft: 18, fraction: 1, done: false });
  });

  test("rounds seconds up, so the last second still reads 1", () => {
    expect(timerState(200).secondsLeft).toBe(18);
    expect(timerState(1000).secondsLeft).toBe(17);
    expect(timerState(1001).secondsLeft).toBe(17);
    expect(timerState(17_100).secondsLeft).toBe(1);
  });

  test("the bar fraction is linear in elapsed time", () => {
    expect(timerState(ROUND_MS / 2).fraction).toBe(0.5);
    expect(timerState(ROUND_MS / 4).fraction).toBe(0.75);
  });

  test("ends at zero and never goes negative or above full", () => {
    expect(timerState(ROUND_MS)).toEqual({ remainingMs: 0, secondsLeft: 0, fraction: 0, done: true });
    expect(timerState(ROUND_MS + 900).remainingMs).toBe(0);
    expect(timerState(-50).fraction).toBe(1);
  });
});

describe("secondsTaken", () => {
  test("uses the real elapsed time with 0.1 s precision", () => {
    expect(secondsTaken(6_240)).toBe(6.2);
    expect(secondsTaken(6_260)).toBe(6.3);
    // The old keyboard bug recorded 1 s for every key press; a fast answer is now its real time.
    expect(secondsTaken(450)).toBe(0.5);
  });

  test("is capped at the round length", () => {
    expect(secondsTaken(ROUND_MS + 3_000)).toBe(18);
    expect(secondsTaken(-10)).toBe(0);
  });
});
