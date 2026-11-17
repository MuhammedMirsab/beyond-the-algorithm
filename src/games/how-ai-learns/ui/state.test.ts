import { describe, expect, test } from "bun:test";
import type { DatasetPhoto } from "../engine/dataset";
import {
  initialState,
  MAX_EXAMPLES,
  reducer,
  tallyResults,
  testPhotosFor,
  type ExamplePhoto,
  type GameState,
  type TrainedRun,
} from "./state";

const photo = (category: string, i: number, kind: ExamplePhoto["kind"] = "library"): ExamplePhoto => ({
  id: `${category}-${i}`,
  category,
  label: category === "pens" ? "Pen" : "Cup",
  url: `/x/${category}/${i}.jpg`,
  kind,
  title: `${category} ${i}`,
});

const run: TrainedRun = {
  labels: ["Cup", "Pen"],
  centroids: [new Float32Array(2), new Float32Array(2)],
  similarityCutoff: 0.5,
  history: [],
  perGroup: { Pen: 10, Cup: 10 },
  examples: 20,
  seconds: 1.2,
  sample: null,
};

describe("picking", () => {
  test("starts with pen and cup, allows a third, never a fourth", () => {
    let s = initialState;
    expect(s.picked).toEqual(["pens", "cups"]);
    s = reducer(s, { type: "toggle-pick", id: "keys" });
    s = reducer(s, { type: "toggle-pick", id: "books" });
    expect(s.picked).toEqual(["pens", "cups", "keys"]);
    s = reducer(s, { type: "toggle-pick", id: "pens" });
    expect(s.picked).toEqual(["cups", "keys"]);
  });
});

describe("examples", () => {
  test("adding skips repeats and stops at the limit", () => {
    let s = reducer(initialState, { type: "add-examples", category: "pens", photos: [photo("pens", 1), photo("pens", 1)] });
    expect(s.examples.pens.length).toBe(1);
    const many = Array.from({ length: MAX_EXAMPLES + 5 }, (_, i) => photo("pens", i + 2));
    s = reducer(s, { type: "add-examples", category: "pens", photos: many });
    expect(s.examples.pens.length).toBe(MAX_EXAMPLES);
  });

  test("the experiment keeps the first 3 of each group", () => {
    let s = reducer(initialState, { type: "add-examples", category: "pens", photos: [1, 2, 3, 4, 5].map((i) => photo("pens", i)) });
    s = reducer(s, { type: "add-examples", category: "cups", photos: [1, 2, 3, 4].map((i) => photo("cups", i)) });
    s = reducer(s, { type: "keep-first", count: 3 });
    expect(s.examples.pens.map((p) => p.id)).toEqual(["pens-1", "pens-2", "pens-3"]);
    expect(s.examples.cups.length).toBe(3);
  });
});

describe("training runs", () => {
  test("a new run clears results and remembers the finished one", () => {
    const done: GameState = {
      ...initialState,
      step: "results",
      train: { phase: "done", run },
      results: { t1: { truth: "Pen", candidates: [{ label: "Pen", probability: 0.9, similarity: 0.8 }] } },
      revealed: ["t1"],
      selected: "t1",
    };
    const next = reducer(done, { type: "train-start" });
    expect(next.step).toBe("train");
    expect(next.results).toEqual({});
    expect(next.revealed).toEqual([]);
    expect(next.previous?.results).toEqual(done.results);
    expect(next.previous?.perGroup).toEqual(run.perGroup);
  });

  test("epochs only append while practising", () => {
    const log = { epoch: 1, totalEpochs: 24, accuracy: 0.5, loss: 0.7, valAccuracy: null };
    expect(reducer(initialState, { type: "train-epoch", log })).toBe(initialState);
    const practising = reducer(initialState, { type: "train", train: { phase: "practising", history: [], total: 24 } });
    const after = reducer(practising, { type: "train-epoch", log });
    expect(after.train.phase === "practising" && after.train.history.length).toBe(1);
  });

  test("Next player forgets everything", () => {
    const busy: GameState = {
      ...initialState,
      step: "test",
      picked: ["keys", "books"],
      examples: { keys: [photo("keys", 1, "camera")] },
      cameraWelcomed: true,
      threshold: 0.9,
    };
    expect(reducer(busy, { type: "reset" })).toEqual(initialState);
  });
});

describe("test photos", () => {
  const fake = (category: string, i: number) => ({ id: `${category}${i}`, category, label: category }) as DatasetPhoto;

  test("alternate between groups", () => {
    const test = new Map([
      ["pens", [fake("pens", 1), fake("pens", 2)]],
      ["cups", [fake("cups", 1), fake("cups", 2)]],
    ]);
    expect(testPhotosFor(["pens", "cups"], test).map((p) => p.id)).toEqual(["pens1", "cups1", "pens2", "cups2"]);
  });

  test("tally follows the threshold", () => {
    const results = {
      a: { truth: "Pen", candidates: [{ label: "Pen", probability: 0.95, similarity: 0.8 }, { label: "Cup", probability: 0.05, similarity: 0.3 }] },
      b: { truth: "Cup", candidates: [{ label: "Pen", probability: 0.75, similarity: 0.7 }, { label: "Cup", probability: 0.25, similarity: 0.6 }] },
    };
    expect(tallyResults(results, 0.7, 0.5)).toEqual({ right: 1, wrong: 1, unknown: 0, total: 2 });
    expect(tallyResults(results, 0.8, 0.5)).toEqual({ right: 1, wrong: 0, unknown: 1, total: 2 });
  });
});
