import { describe, expect, test } from "bun:test";
import { OneEuroFilter, OneEuroFilter2D } from "./one-euro";

const DT = 1 / 30;

describe("1€ filter", () => {
  test("passes the first sample through", () => {
    expect(new OneEuroFilter().filter(42, 0)).toBe(42);
  });

  test("a still hand stays still", () => {
    const f = new OneEuroFilter();
    let out = 0;
    for (let i = 0; i < 30; i++) out = f.filter(100, i * DT);
    expect(out).toBe(100);
  });

  test("removes most of the jitter of a still hand", () => {
    const f = new OneEuroFilter();
    let worst = 0;
    for (let i = 0; i < 90; i++) {
      const out = f.filter(100 + (i % 2 ? 2 : -2), i * DT);
      if (i > 30) worst = Math.max(worst, Math.abs(out - 100));
    }
    // ±2 px of landmark noise becomes well under 1 px.
    expect(worst).toBeLessThan(1);
  });

  test("follows a fast move closely (a fixed smoother would trail by over 100 px)", () => {
    const f = new OneEuroFilter();
    const speed = 1000; // px per second
    let lag = 0;
    for (let i = 0; i < 60; i++) {
      const x = speed * i * DT;
      lag = x - f.filter(x, i * DT);
    }
    expect(lag).toBeGreaterThanOrEqual(0);
    expect(lag).toBeLessThan(25);
  });

  test("reset starts over from the next sample", () => {
    const f = new OneEuroFilter();
    f.filter(0, 0);
    f.filter(10, DT);
    f.reset();
    expect(f.filter(500, 2 * DT)).toBe(500);
  });

  test("2D filter smooths both axes independently", () => {
    const f = new OneEuroFilter2D();
    expect(f.filter(1, 2, 0)).toEqual({ x: 1, y: 2 });
    const next = f.filter(1, 50, DT);
    expect(next.x).toBe(1);
    expect(next.y).toBeGreaterThan(2);
    expect(next.y).toBeLessThan(50);
  });
});
