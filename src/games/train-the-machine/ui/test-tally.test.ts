import { describe, expect, test } from "bun:test";
import type { Prediction } from "../engine/classifier";
import { burstSize, EXAMPLES_NEEDED, MAX_EXAMPLES } from "./model";
import { EMPTY_TALLY, shares, tallyFrame, triesDone, UNSURE_HOLD_MS } from "./test-tally";

const scores = (a: number, b: number) => [
  { id: "a", name: "Wave", match: a, closest: a, share: 0.5 },
  { id: "b", name: "Clap", match: b, closest: b, share: 0.5 },
];

const said = (id: "a" | "b", a = 0.9, b = 0.2): Prediction => ({
  status: "recognized",
  classId: id,
  closestId: id,
  match: id === "a" ? a : b,
  scores: scores(a, b),
  reason: null,
});

const unsure = (reason: Prediction["reason"] = "no_match"): Prediction => ({
  status: "unknown",
  classId: null,
  closestId: "a",
  match: 0.4,
  scores: scores(0.4, 0.3),
  reason,
});

const nobody: Prediction = { status: "no_person", classId: null, closestId: null, match: 0, scores: [], reason: null };

describe("tallyFrame", () => {
  test("counts answers and keeps the best match per move", () => {
    let t = tallyFrame(EMPTY_TALLY, said("a", 0.8, 0.1), 0);
    t = tallyFrame(t, said("a", 0.95, 0.2), 30);
    t = tallyFrame(t, said("b", 0.3, 0.7), 60);
    expect(t.frames).toBe(3);
    expect(t.said).toEqual({ a: 2, b: 1, unsure: 0 });
    expect(t.best.a).toBeCloseTo(0.95);
    expect(t.best.b).toBeCloseTo(0.7);
    expect(t.madeSay).toEqual({ a: true, b: true, unsure: false });
    expect(triesDone(t)).toBe(2);
  });

  test("Not sure counts as a try only after it lasts", () => {
    let t = tallyFrame(EMPTY_TALLY, unsure(), 1000);
    t = tallyFrame(t, unsure(), 1000 + UNSURE_HOLD_MS / 2);
    expect(t.madeSay.unsure).toBe(false);
    t = tallyFrame(t, unsure("too_close"), 1000 + UNSURE_HOLD_MS);
    expect(t.madeSay.unsure).toBe(true);
    expect(t.said.unsure).toBe(3);
  });

  test("a flicker of Not sure between moves does not count", () => {
    let t = tallyFrame(EMPTY_TALLY, unsure(), 0);
    t = tallyFrame(t, said("a"), 500);
    t = tallyFrame(t, unsure(), 900);
    t = tallyFrame(t, unsure(), 900 + UNSURE_HOLD_MS - 1);
    expect(t.madeSay.unsure).toBe(false);
  });

  test("nobody in view and 'show a hand' are not answers, and they reset the Not sure timer", () => {
    let t = tallyFrame(EMPTY_TALLY, unsure(), 0);
    t = tallyFrame(t, nobody, 600);
    t = tallyFrame(t, unsure("no_hand"), 700);
    expect(t.frames).toBe(1);
    t = tallyFrame(t, unsure(), 800);
    t = tallyFrame(t, unsure(), 800 + UNSURE_HOLD_MS - 1);
    expect(t.madeSay.unsure).toBe(false);
  });

  test("returns the same tally when nothing changed", () => {
    expect(tallyFrame(EMPTY_TALLY, nobody, 0)).toBe(EMPTY_TALLY);
  });

  test("shares add up to 1", () => {
    let t = tallyFrame(EMPTY_TALLY, said("a"), 0);
    t = tallyFrame(t, said("b"), 10);
    t = tallyFrame(t, unsure(), 20);
    t = tallyFrame(t, unsure(), 30);
    const s = shares(t);
    expect(s.a + s.b + s.unsure).toBeCloseTo(1);
    expect(s.unsure).toBeCloseTo(0.5);
  });
});

describe("burstSize", () => {
  test("fills up to the 5 needed, then 5 more at a time, never past the maximum", () => {
    expect(burstSize(0)).toBe(EXAMPLES_NEEDED);
    expect(burstSize(3)).toBe(2);
    expect(burstSize(EXAMPLES_NEEDED)).toBe(5);
    expect(burstSize(8)).toBe(MAX_EXAMPLES - 8);
    expect(burstSize(MAX_EXAMPLES)).toBe(0);
  });
});
