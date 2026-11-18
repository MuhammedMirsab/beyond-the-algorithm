import { describe, expect, test } from "bun:test";
import { dropOrder, gridFor, labelSize, slotOf } from "./layout";

describe("field layout", () => {
  test("a square field packs 100 numbers ten by ten and 1,000 into 32 columns", () => {
    expect(gridFor(100, 400, 400)).toMatchObject({ cols: 10, rows: 10, pitch: 40 });
    expect(gridFor(1000, 640, 640)).toMatchObject({ cols: 32, rows: 32, pitch: 20 });
    expect(gridFor(10, 500, 200).rows).toBe(2);
  });

  test("halving the numbers makes every cell bigger", () => {
    let previous = 0;
    for (const count of [1000, 500, 250, 125, 63, 32, 16, 8, 4, 2]) {
      const pitch = gridFor(count, 460, 460).pitch;
      expect(pitch).toBeGreaterThanOrEqual(previous);
      previous = pitch;
    }
  });

  test("every cell fits inside the box, on any shape", () => {
    for (const [w, h] of [
      [460, 460],
      [358, 268],
      [900, 300],
      [120, 500],
    ]) {
      for (const count of [1, 2, 3, 7, 13, 25, 50, 99, 100, 500, 1000]) {
        const grid = gridFor(count, w, h);
        expect(grid.cols * grid.rows).toBeGreaterThanOrEqual(count);
        for (const i of [0, count - 1]) {
          const { x, y } = slotOf(grid, i);
          expect(x - grid.pitch / 2).toBeGreaterThanOrEqual(-1e-6);
          expect(y - grid.pitch / 2).toBeGreaterThanOrEqual(-1e-6);
          expect(x + grid.pitch / 2).toBeLessThanOrEqual(w + 1e-6);
          expect(y + grid.pitch / 2).toBeLessThanOrEqual(h + 1e-6);
        }
      }
    }
  });

  test("two numbers never grow into giant tiles", () => {
    expect(gridFor(2, 400, 400).pitch).toBeCloseTo(144);
  });
});

describe("drop order", () => {
  const list = Array.from({ length: 10 }, (_, i) => i + 1);

  test("an upper block falls from the cut upward", () => {
    const order = dropOrder(list, new Set([6, 7, 8, 9, 10]));
    expect(order.get(6)).toBe(0);
    expect(order.get(10)).toBe(1);
  });

  test("a lower block falls from the cut downward", () => {
    const order = dropOrder(list, new Set([1, 2, 3, 4, 5]));
    expect(order.get(5)).toBe(0);
    expect(order.get(1)).toBe(1);
  });

  test("scattered numbers fall in reading order", () => {
    const order = dropOrder(list, new Set([1, 3, 5, 7, 9]));
    expect(order.get(1)).toBe(0);
    expect(order.get(5)).toBe(0.5);
    expect(order.get(9)).toBe(1);
  });

  test("labels shrink for longer numbers", () => {
    expect(labelSize(40, 7)).toBeGreaterThan(labelSize(40, 700));
    expect(labelSize(40, 700)).toBeGreaterThan(labelSize(40, 1000));
  });
});
