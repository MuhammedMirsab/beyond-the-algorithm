import { describe, expect, test } from "bun:test";
import type { DatasetPhoto } from "../engine/dataset";
import {
  initialState,
  MAX_EXAMPLES,
  namesProblem,
  otherThingsPool,
  reducer,
  tallyResults,
  testPhotosFor,
  trainingGroups,
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

describe("naming", () => {
  test("starts with two unnamed things, allows a third, never a fourth", () => {
    let s = initialState;
    expect(s.groups.map((g) => g.name)).toEqual(["", ""]);
    expect(namesProblem(s.groups)).toBe("Name both things first.");
    s = reducer(s, { type: "rename", id: "g1", name: "Phone" });
    s = reducer(s, { type: "rename", id: "g2", name: "phone " });
    expect(namesProblem(s.groups)).toBe("Give each thing a different name.");
    s = reducer(s, { type: "rename", id: "g2", name: "No object" });
    expect(namesProblem(s.groups)).toContain("already one of its groups");
    s = reducer(s, { type: "rename", id: "g2", name: "Bottle" });
    expect(namesProblem(s.groups)).toBeNull();
    s = reducer(s, { type: "add-group" });
    s = reducer(s, { type: "add-group" });
    expect(s.groups.map((g) => g.id)).toEqual(["g1", "g2", "g3"]);
    s = reducer(s, { type: "remove-group", id: "g1" });
    expect(s.groups.map((g) => g.name)).toEqual(["Bottle", ""]);
    s = reducer(s, { type: "remove-group", id: "g2" });
    expect(s.groups.length).toBe(2);
  });

  test("a library category fills an unnamed thing, then a new one, and lets go on a second tap", () => {
    let s = reducer(initialState, { type: "rename", id: "g1", name: "Phone" });
    s = reducer(s, { type: "use-library", category: "pens", label: "Pen" });
    expect(s.groups[1]).toEqual({ id: "g2", name: "Pen", library: "pens" });
    s = reducer(s, { type: "use-library", category: "cups", label: "Cup" });
    expect(s.groups[2]).toEqual({ id: "g3", name: "Cup", library: "cups" });
    s = reducer(s, { type: "add-examples", category: "g3", photos: [photo("cups", 1), photo("cups", 2, "camera")] });
    s = reducer(s, { type: "use-library", category: "cups", label: "Cup" });
    expect(s.groups[2].library).toBeNull();
    expect(s.examples.g3.map((p) => p.kind)).toEqual(["camera"]);
  });

  test("the model always learns No object too", () => {
    const s = reducer(initialState, { type: "rename", id: "g1", name: "Phone" });
    expect(trainingGroups(s.groups).map((g) => g.label)).toEqual(["Phone", "", "No object"]);
    const pool = new Map([
      ["pens", [{ id: "p1" } as DatasetPhoto]],
      ["cups", [{ id: "c1" } as DatasetPhoto]],
    ]);
    const withPens = reducer(s, { type: "use-library", category: "pens", label: "Pen" });
    expect(otherThingsPool(withPens.groups, pool).map((p) => p.id)).toEqual(["c1"]);
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
      groups: [
        { id: "g1", name: "Keys", library: "keys" },
        { id: "g2", name: "Book", library: null },
      ],
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
    const groups = [
      { id: "g1", name: "Pen", library: "pens" },
      { id: "g2", name: "Phone", library: null },
      { id: "g3", name: "Mug", library: "cups" },
    ];
    expect(testPhotosFor(groups, test).map((p) => p.id)).toEqual(["pens1", "cups1", "pens2", "cups2"]);
    expect(testPhotosFor(groups.slice(1, 2), test)).toEqual([]);
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
