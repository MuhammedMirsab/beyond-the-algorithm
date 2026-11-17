import { describe, expect, test } from "bun:test";
import { centroid, cosineSimilarity, l2Normalize, leaveOneOutSimilarities } from "./vectors";

describe("vectors", () => {
  test("l2Normalize gives length 1 and leaves zero alone", () => {
    const v = l2Normalize([3, 4]);
    expect(v[0]).toBeCloseTo(0.6);
    expect(v[1]).toBeCloseTo(0.8);
    expect(Array.from(l2Normalize([0, 0]))).toEqual([0, 0]);
  });

  test("cosine similarity of normalised vectors", () => {
    expect(cosineSimilarity(l2Normalize([1, 0]), l2Normalize([1, 0]))).toBeCloseTo(1);
    expect(cosineSimilarity(l2Normalize([1, 0]), l2Normalize([0, 1]))).toBeCloseTo(0);
  });

  test("centroid is the normalised mean", () => {
    const c = centroid([l2Normalize([1, 0]), l2Normalize([0, 1])], 2);
    expect(c[0]).toBeCloseTo(Math.SQRT1_2);
    expect(c[1]).toBeCloseTo(Math.SQRT1_2);
  });

  test("leave-one-out compares each vector with the others only", () => {
    const a = l2Normalize([1, 0]);
    const b = l2Normalize([0, 1]);
    const [sa, sb] = leaveOneOutSimilarities([a, b], 2);
    expect(sa).toBeCloseTo(0);
    expect(sb).toBeCloseTo(0);
    // Including itself, a would look half-way similar to the group: the bias it removes.
    expect(cosineSimilarity(a, centroid([a, b], 2))).toBeCloseTo(Math.SQRT1_2);
    expect(leaveOneOutSimilarities([a, a, a], 2).every((s) => Math.abs(s - 1) < 1e-6)).toBe(true);
    expect(leaveOneOutSimilarities([a], 2)).toEqual([]);
  });
});
