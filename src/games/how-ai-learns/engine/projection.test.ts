import { describe, expect, test } from "bun:test";
import { boundsOf, fitProjection, project, toUnit } from "./projection";

/** Points spread mostly along one direction, a little along another, none along the rest. */
function cloud(dim: number) {
  const vectors: Float64Array[] = [];
  for (let i = 0; i < 12; i++) {
    const v = new Float64Array(dim);
    v[3] = (i - 5.5) * 2; // the big spread
    v[7] = i % 2 === 0 ? 0.5 : -0.5; // a small spread
    v[0] = 1; // the same for all: no spread
    vectors.push(v);
  }
  return vectors;
}

describe("fitProjection", () => {
  test("finds the direction of most spread first", () => {
    const p = fitProjection(cloud(16));
    expect(p).not.toBeNull();
    if (!p) return;
    // The two spreads are very slightly correlated in this data, so the axes tilt a hair.
    expect(Math.abs(p.axes[0][3])).toBeCloseTo(1, 3);
    expect(Math.abs(p.axes[1][7])).toBeCloseTo(1, 3);
    expect(p.explained[0]).toBeGreaterThan(p.explained[1]);
    expect(p.explained[0] + p.explained[1]).toBeCloseTo(1, 4);
  });

  test("the two axes are at right angles and unit length", () => {
    const vectors = Array.from({ length: 9 }, (_, i) => Float64Array.from({ length: 32 }, (_, d) => Math.sin(i * 1.7 + d * 0.31) + (d === i ? 2 : 0)));
    const p = fitProjection(vectors);
    if (!p) throw new Error("no projection");
    const dot = p.axes[0].reduce((s, v, d) => s + v * p.axes[1][d], 0);
    const len0 = Math.sqrt(p.axes[0].reduce((s, v) => s + v * v, 0));
    const len1 = Math.sqrt(p.axes[1].reduce((s, v) => s + v * v, 0));
    expect(Math.abs(dot)).toBeLessThan(1e-6);
    expect(len0).toBeCloseTo(1, 6);
    expect(len1).toBeCloseTo(1, 6);
  });

  test("two groups land apart on the map", () => {
    const dim = 64;
    const groupA = Array.from({ length: 5 }, (_, i) => Float64Array.from({ length: dim }, (_, d) => (d < 8 ? 1 : 0) + 0.05 * Math.sin(i + d)));
    const groupB = Array.from({ length: 5 }, (_, i) => Float64Array.from({ length: dim }, (_, d) => (d >= 8 && d < 16 ? 1 : 0) + 0.05 * Math.cos(i + d)));
    const p = fitProjection([...groupA, ...groupB]);
    if (!p) throw new Error("no projection");
    const xs = (group: Float64Array[]) => group.map((v) => project(p, v).x);
    const a = xs(groupA);
    const b = xs(groupB);
    // All of one group on one side of all of the other.
    expect(Math.max(...a) < Math.min(...b) || Math.max(...b) < Math.min(...a)).toBe(true);
  });

  test("is repeatable", () => {
    const one = fitProjection(cloud(16));
    const two = fitProjection(cloud(16));
    expect(Array.from(one?.axes[0] ?? [])).toEqual(Array.from(two?.axes[0] ?? []));
  });

  test("needs at least two different vectors", () => {
    expect(fitProjection([])).toBeNull();
    expect(fitProjection([new Float64Array([1, 2])])).toBeNull();
    expect(fitProjection([new Float64Array([1, 2]), new Float64Array([1, 2])])).toBeNull();
  });
});

describe("toUnit", () => {
  test("maps the bounds into the margins and holds outsiders at the edge", () => {
    const bounds = boundsOf([
      { x: -2, y: 0 },
      { x: 2, y: 4 },
    ]);
    expect(toUnit({ x: -2, y: 0 }, bounds, 0.1)).toEqual({ x: 0.1, y: 0.1 });
    expect(toUnit({ x: 2, y: 4 }, bounds, 0.1)).toEqual({ x: 0.9, y: 0.9 });
    const far = toUnit({ x: 50, y: -50 }, bounds, 0.1);
    expect(far.x).toBeCloseTo(0.9);
    expect(far.y).toBeCloseTo(0.1);
  });

  test("a single point gets a box around it", () => {
    const bounds = boundsOf([{ x: 3, y: 3 }]);
    expect(bounds.maxX - bounds.minX).toBeGreaterThan(0);
    expect(toUnit({ x: 3, y: 3 }, bounds)).toEqual({ x: 0.5, y: 0.5 });
  });
});
