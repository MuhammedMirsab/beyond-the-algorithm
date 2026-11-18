import { describe, expect, test } from "bun:test";
import { ROUND_MS } from "../engine/scoring";
import { fractionLeft } from "./countdown";

describe("fractionLeft", () => {
  test("a waiting clock is full: the bar refills between rounds", () => {
    expect(fractionLeft({ state: "waiting" }, 123_456)).toBe(1);
  });

  test("a running clock reads the time from when it started", () => {
    expect(fractionLeft({ state: "running", startedAt: 1_000 }, 1_000)).toBe(1);
    expect(fractionLeft({ state: "running", startedAt: 1_000 }, 1_000 + ROUND_MS / 4)).toBe(0.75);
    expect(fractionLeft({ state: "running", startedAt: 1_000 }, 1_000 + ROUND_MS * 2)).toBe(0);
  });

  test("a stopped clock stays where the answer came in", () => {
    expect(fractionLeft({ state: "stopped", remainingMs: ROUND_MS / 2 }, 999_999)).toBe(0.5);
    expect(fractionLeft({ state: "stopped", remainingMs: 0 }, 0)).toBe(0);
  });
});
