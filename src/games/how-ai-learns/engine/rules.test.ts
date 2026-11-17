import { describe, expect, test } from "bun:test";
import { decide, outcomeOf, similarityCutoffFrom, tally, type Candidate } from "./rules";

const c = (label: string, probability: number, similarity = 0.8): Candidate => ({ label, probability, similarity });
const rules = { threshold: 0.7, similarityCutoff: 0.5 };

describe("decide: when it answers", () => {
  test("answers when sure and familiar", () => {
    const d = decide([c("Pen", 0.93), c("Cup", 0.07)], rules);
    expect(d.answer).toBe("Pen");
    expect(d.reason).toBeNull();
  });

  test("ranks candidates itself", () => {
    expect(decide([c("Cup", 0.1), c("Pen", 0.9)], rules).answer).toBe("Pen");
  });

  test("answers at exactly the threshold", () => {
    expect(decide([c("Pen", 0.7), c("Cup", 0.3)], rules).answer).toBe("Pen");
  });
});

describe("decide: when it says I don't know", () => {
  test("unsure: best guess below the threshold", () => {
    const d = decide([c("Pen", 0.62), c("Cup", 0.38)], rules);
    expect(d.answer).toBeNull();
    expect(d.reason).toBe("unsure");
    expect(d.top.label).toBe("Pen");
  });

  test("raising the threshold turns an answer into I don't know", () => {
    const candidates = [c("Pen", 0.8), c("Cup", 0.2)];
    expect(decide(candidates, { ...rules, threshold: 0.75 }).answer).toBe("Pen");
    expect(decide(candidates, { ...rules, threshold: 0.85 }).reason).toBe("unsure");
  });

  test("unfamiliar: far from its examples, even when the softmax is sure", () => {
    const d = decide([c("Cup", 0.97, 0.31), c("Pen", 0.03, 0.2)], rules);
    expect(d.answer).toBeNull();
    expect(d.reason).toBe("unfamiliar");
  });

  test("unfamiliar wins over unsure, like the original", () => {
    expect(decide([c("Cup", 0.55, 0.3), c("Pen", 0.45, 0.2)], rules).reason).toBe("unfamiliar");
  });

  test("torn: three groups, top two nearly tied", () => {
    const d = decide([c("Pen", 0.45), c("Cup", 0.4), c("Keys", 0.15)], { ...rules, threshold: 0.4 });
    expect(d.reason).toBe("torn");
    expect(d.runnerUp?.label).toBe("Cup");
  });

  test("two groups are never torn, only unsure", () => {
    const d = decide([c("Pen", 0.52), c("Cup", 0.48)], { ...rules, threshold: 0.5 });
    expect(d.answer).toBe("Pen");
  });

  test("needs at least one candidate", () => {
    expect(() => decide([], rules)).toThrow();
  });
});

describe("similarityCutoffFrom", () => {
  test("is 80% of the mean, kept between 0.42 and 0.68", () => {
    expect(similarityCutoffFrom([0.6, 0.6])).toBe(0.48);
    expect(similarityCutoffFrom([0.3])).toBe(0.42);
    expect(similarityCutoffFrom([1, 1])).toBe(0.68);
    expect(similarityCutoffFrom([])).toBe(0.42);
  });
});

describe("outcomes", () => {
  test("right, wrong and unknown", () => {
    expect(outcomeOf(decide([c("Pen", 0.9), c("Cup", 0.1)], rules), "Pen")).toBe("right");
    expect(outcomeOf(decide([c("Pen", 0.9), c("Cup", 0.1)], rules), "Cup")).toBe("wrong");
    expect(outcomeOf(decide([c("Pen", 0.6), c("Cup", 0.4)], rules), "Pen")).toBe("unknown");
  });

  test("tally counts each kind", () => {
    expect(tally(["right", "right", "wrong", "unknown"])).toEqual({ right: 2, wrong: 1, unknown: 1, total: 4 });
  });
});
