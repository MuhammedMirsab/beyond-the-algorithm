import { describe, expect, test } from "bun:test";
import { bounds, centroid, convexHull, dist, edgeLines, signedArea, type Vec2 } from "./geometry";

const square: Vec2[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

/** The four corners in "crossed hands" order: a fixed corner order would draw a bow-tie. */
const bowTie: Vec2[] = [square[0], square[2], square[1], square[3]];

describe("geometry", () => {
  test("dist", () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  test("signedArea of a square, both windings", () => {
    expect(Math.abs(signedArea(square))).toBe(10_000);
    expect(signedArea([...square].reverse())).toBe(-signedArea(square));
  });

  test("convex hull untangles crossed fingertips (no bow-tie)", () => {
    // The bow-tie's own shoelace area cancels out; its hull is the full square.
    expect(Math.abs(signedArea(bowTie))).toBe(0);
    const hull = convexHull(bowTie);
    expect(hull).toHaveLength(4);
    expect(Math.abs(signedArea(hull))).toBe(10_000);
  });

  test("convex hull drops points inside the frame", () => {
    const hull = convexHull([...square, { x: 50, y: 50 }]);
    expect(hull).toHaveLength(4);
  });

  test("centroid and bounds", () => {
    expect(centroid(square)).toEqual({ x: 50, y: 50 });
    expect(bounds(square)).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
  });

  test("edge lines give a signed distance: positive inside, negative outside", () => {
    const edges = edgeLines(convexHull(square), 1, new Float32Array(12));
    const sd = (p: Vec2) => {
      let d = Infinity;
      for (let i = 0; i < 4; i++) d = Math.min(d, edges[i * 3] * p.x + edges[i * 3 + 1] * p.y + edges[i * 3 + 2]);
      return d;
    };
    expect(sd({ x: 50, y: 50 })).toBeCloseTo(50);
    expect(sd({ x: 10, y: 50 })).toBeCloseTo(10);
    expect(sd({ x: -20, y: 50 })).toBeCloseTo(-20);
  });

  test("edge lines scale to device pixels", () => {
    const edges = edgeLines(convexHull(square), 2, new Float32Array(12));
    let d = Infinity;
    // Centre of the square in device px at 2x.
    for (let i = 0; i < 4; i++) d = Math.min(d, edges[i * 3] * 100 + edges[i * 3 + 1] * 100 + edges[i * 3 + 2]);
    expect(d).toBeCloseTo(100);
  });

  test("a triangle fills all four edge slots (the shader stays branch-free)", () => {
    const tri = convexHull([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }]);
    const edges = edgeLines(tri, 1, new Float32Array(12));
    expect(Array.from(edges.slice(9, 12))).toEqual(Array.from(edges.slice(0, 3)));
  });
});
