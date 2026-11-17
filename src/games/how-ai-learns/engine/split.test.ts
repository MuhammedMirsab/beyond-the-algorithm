import { describe, expect, test } from "bun:test";
import { dedupe, shuffleWithSeed, splitCounts, stratifiedSplit } from "./split";

describe("splitCounts", () => {
  test("small groups train on everything instead of throwing", () => {
    expect(splitCounts(0)).toEqual({ train: 0, val: 0, test: 0 });
    expect(splitCounts(1)).toEqual({ train: 1, val: 0, test: 0 });
    expect(splitCounts(2)).toEqual({ train: 2, val: 0, test: 0 });
  });

  test("matches the original 70/15/15 split", () => {
    expect(splitCounts(3)).toEqual({ train: 1, val: 1, test: 1 });
    expect(splitCounts(10)).toEqual({ train: 6, val: 2, test: 2 });
    expect(splitCounts(20)).toEqual({ train: 14, val: 3, test: 3 });
  });

  test("no hold-out means every example trains", () => {
    expect(splitCounts(7, { val: 0, test: 0 })).toEqual({ train: 7, val: 0, test: 0 });
  });

  test("counts always add up and training keeps at least one", () => {
    for (let n = 0; n <= 60; n++) {
      for (const holdOut of [
        { val: 0.15, test: 0.15 },
        { val: 0.5, test: 0.5 },
        { val: 0, test: 0.3 },
      ]) {
        const c = splitCounts(n, holdOut);
        expect(c.train + c.val + c.test).toBe(n);
        if (n > 0) expect(c.train).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe("stratifiedSplit", () => {
  const items = [
    ...Array.from({ length: 10 }, (_, i) => ({ id: `pen${i}`, label: "Pen" })),
    ...Array.from({ length: 2 }, (_, i) => ({ id: `cup${i}`, label: "Cup" })),
  ];

  test("parts are disjoint and cover every item", () => {
    const s = stratifiedSplit(items, (i) => i.label);
    const ids = [...s.train, ...s.val, ...s.test].map((i) => i.id);
    expect(new Set(ids).size).toBe(items.length);
    expect(ids.length).toBe(items.length);
  });

  test("a group with 2 items is all training, not an error", () => {
    const s = stratifiedSplit(items, (i) => i.label);
    expect(s.train.filter((i) => i.label === "Cup").length).toBe(2);
    expect([...s.val, ...s.test].some((i) => i.label === "Cup")).toBe(false);
  });

  test("is repeatable", () => {
    const a = stratifiedSplit(items, (i) => i.label);
    const b = stratifiedSplit([...items].reverse().reverse(), (i) => i.label);
    expect(a.test.map((i) => i.id)).toEqual(b.test.map((i) => i.id));
  });
});

describe("shuffleWithSeed", () => {
  test("is a repeatable permutation", () => {
    const xs = Array.from({ length: 30 }, (_, i) => i);
    const a = shuffleWithSeed(xs, 5);
    expect(a).toEqual(shuffleWithSeed(xs, 5));
    expect([...a].sort((p, q) => p - q)).toEqual(xs);
    expect(a).not.toEqual(xs);
  });
});

describe("dedupe", () => {
  test("keeps the first of each key", () => {
    const { items, removed } = dedupe(["a", "b", "a", "c", "b"], (x) => x);
    expect(items).toEqual(["a", "b", "c"]);
    expect(removed).toBe(2);
  });
});
