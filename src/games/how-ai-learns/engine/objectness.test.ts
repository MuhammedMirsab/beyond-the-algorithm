import { describe, expect, test } from "bun:test";
import { leaveOneOutObjectScores, objectAxes, objectCutoffFrom, objectScore, OBJECT_MAX, OBJECT_MIN } from "./objectness";
import { centroid, l2Normalize } from "./vectors";

const DIM = 48;

/** A fake embedding: the shared scene, plus an object pattern, plus a little noise. */
function photo(object: number[] | null, seed: number, objectWeight = 1) {
  const v = new Float64Array(DIM);
  for (let d = 0; d < DIM; d++) v[d] = d < 16 ? 1 : 0; // the room
  if (object) for (const d of object) v[d] += objectWeight;
  for (let d = 0; d < DIM; d++) v[d] += 0.08 * Math.sin(seed * 12.9898 + d * 78.233);
  return l2Normalize(v);
}

const PHONE = [20, 21, 22, 23, 24];
const BALL = [30, 31, 32, 33, 34];
const phones = Array.from({ length: 6 }, (_, i) => photo(PHONE, i + 1));
const balls = Array.from({ length: 6 }, (_, i) => photo(BALL, i + 11));
const axes = objectAxes([centroid(phones, DIM), centroid(balls, DIM)]);

describe("objectScore", () => {
  test("an empty scene scores near zero, the taught things score high", () => {
    const empty = objectScore(axes, photo(null, 99));
    const phone = objectScore(axes, photo(PHONE, 42));
    expect(Math.abs(empty)).toBeLessThan(0.2);
    expect(phone).toBeGreaterThan(0.5);
  });

  test("a similar but different phone still stands out", () => {
    // Shares most of the phone pattern, not all of it, and is smaller in view.
    const other = photo([20, 21, 22, 25, 26], 7, 0.7);
    const cutoff = objectCutoffFrom(leaveOneOutObjectScores([phones, balls]));
    expect(objectScore(axes, other)).toBeGreaterThan(cutoff);
    expect(objectScore(axes, photo(null, 5))).toBeLessThan(cutoff);
  });

  test("works with three groups", () => {
    const keys = Array.from({ length: 5 }, (_, i) => photo([40, 41, 42], i + 21));
    const three = objectAxes([centroid(phones, DIM), centroid(balls, DIM), centroid(keys, DIM)]);
    const cutoff = objectCutoffFrom(leaveOneOutObjectScores([phones, balls, keys]));
    expect(objectScore(three, photo([40, 41, 42], 77))).toBeGreaterThan(0.5);
    // The keys are the smallest thing, so the empty scene leans a little towards them, but stays under the line.
    expect(objectScore(three, photo(null, 78))).toBeLessThan(cutoff);
  });
});

describe("objectCutoffFrom", () => {
  test("a share of the typical example, within bounds", () => {
    expect(objectCutoffFrom([])).toBe(OBJECT_MIN);
    expect(objectCutoffFrom([0.9, 0.95, 1])).toBe(OBJECT_MAX);
    expect(objectCutoffFrom([0.1, 0.1, 0.1])).toBe(OBJECT_MIN);
    expect(objectCutoffFrom([0.5, 0.6, 0.7])).toBeCloseTo(0.21, 3);
  });

  test("leave-one-out scores of real-looking groups are high", () => {
    const scores = leaveOneOutObjectScores([phones, balls]);
    expect(scores.length).toBe(12);
    for (const s of scores) expect(s).toBeGreaterThan(0.5);
  });
});
