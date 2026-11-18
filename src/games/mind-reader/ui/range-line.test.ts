import { describe, expect, test } from "bun:test";
import { viewFor } from "./range-line";

describe("number line view", () => {
  test("shows the whole range until the window is clearly smaller", () => {
    expect(viewFor(1, 100, 100, null)).toEqual([0.5, 100.5]);
    expect(viewFor(1, 80, 100, null)).toEqual([0.5, 100.5]);
  });

  test("zooms in on what's left, with room either side, inside the range", () => {
    for (const [low, high, max] of [
      [26, 49, 100],
      [1, 12, 100],
      [95, 100, 100],
      [637, 640, 1000],
      [1, 1, 10],
    ]) {
      const [a, b] = viewFor(low, high, max, null);
      expect(a).toBeGreaterThanOrEqual(0.5);
      expect(b).toBeLessThanOrEqual(max + 0.5);
      expect(a).toBeLessThanOrEqual(low - 0.5);
      expect(b).toBeGreaterThanOrEqual(high + 0.5);
      if (high - low + 1 < max * 0.7) expect(b - a).toBeLessThan(max);
    }
  });

  test("the end of a round centres on the number", () => {
    const [a, b] = viewFor(1, 100, 100, 37);
    expect((a + b) / 2).toBeCloseTo(37);
    expect(viewFor(1, 100, 100, 1)[0]).toBe(0.5);
  });
});
