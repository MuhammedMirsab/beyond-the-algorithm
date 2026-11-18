import { describe, expect, test } from "bun:test";
import { FEATURE_GROUPS, spreadByMove } from "./explain";
import { FEATURE_COUNT } from "./features";

/** A 44-number vector with a few chosen values. */
function vec(values: Record<number, number>): number[] {
  const v = new Array<number>(FEATURE_COUNT).fill(0);
  for (const [i, x] of Object.entries(values)) v[Number(i)] = x;
  return v;
}

describe("spreadByMove", () => {
  test("the feature groups add up to the 44 numbers", () => {
    expect(FEATURE_GROUPS.reduce((sum, g) => sum + g.count, 0)).toBe(FEATURE_COUNT);
  });

  test("identical examples are 100% alike to their pattern", () => {
    const a = [vec({ 0: 1, 1: 0.5 }), vec({ 0: 1, 1: 0.5 })];
    const b = [vec({ 2: 1 }), vec({ 2: 1 })];
    const spread = spreadByMove({ a, b });
    for (const value of spread.a.toPattern) expect(value).toBeCloseTo(1, 6);
    expect(spread.a.mean).toBeCloseTo(1, 6);
    expect(spread.a.min).toBeCloseTo(1, 6);
  });

  test("varied examples are less alike to their pattern than identical ones", () => {
    const b = [vec({ 2: 1 }), vec({ 2: 1 }), vec({ 2: 1 })];
    const tight = spreadByMove({ a: [vec({ 0: 1 }), vec({ 0: 1 }), vec({ 0: 1 })], b });
    const loose = spreadByMove({ a: [vec({ 0: 1 }), vec({ 0: 1, 5: 0.8 }), vec({ 0: 1, 9: -0.8 })], b });
    expect(loose.a.mean).toBeLessThan(tight.a.mean);
    expect(loose.a.min).toBeLessThan(loose.a.mean);
  });

  test("values stay between 0 and 1, one per example, in order", () => {
    const a = [vec({ 0: 1 }), vec({ 0: 1, 1: 1 }), vec({ 1: -1, 3: 2 })];
    const b = [vec({ 4: 1 }), vec({ 4: 2, 6: -1 })];
    const spread = spreadByMove({ a, b });
    expect(spread.a.toPattern).toHaveLength(3);
    expect(spread.b.toPattern).toHaveLength(2);
    for (const value of [...spread.a.toPattern, ...spread.b.toPattern]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  test("no examples gives nothing", () => {
    expect(spreadByMove({ a: [], b: [] })).toEqual({});
  });
});
