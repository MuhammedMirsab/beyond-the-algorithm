import { describe, expect, test } from "bun:test";
import { ActionClassifier, DEFAULT_REJECTION_THRESHOLD, VOTE_WINDOW, trainFromExamples, type PredictInput, type Prediction } from "./classifier";
import { FEATURE_COUNT, NO_MOTION, type TemporalMotion } from "./features";

/* Synthetic 44-number examples: a shared "body" plus one direction per move. */

const N = FEATURE_COUNT;

/** Small deterministic noise so tests never flake. */
function noise(seed: number, i: number) {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 0.04;
}

function axis(index: number) {
  return Array.from({ length: N }, (_, i) => (i === index ? 1 : 0));
}

/** Most of the vector is the same for every example, like a real body. */
const BODY = Array.from({ length: N }, (_, i) => (i < 26 ? 0.5 + (i % 5) * 0.1 : 0));

function vector(direction: number[], seed: number, strength = 0.6) {
  return BODY.map((b, i) => b + direction[i] * strength + noise(seed, i));
}

const MOVE_A = axis(30);
const MOVE_B = axis(31);
const OUTLIER = axis(40);

const MOVES = [
  { id: "a", name: "Hands up" },
  { id: "b", name: "Hands down" },
];

function examples(direction: number[], offset: number, count = 5, motion?: TemporalMotion) {
  return Array.from({ length: count }, (_, i) => ({ features: vector(direction, offset + i), motion }));
}

function input(features: number[] | null, overrides: Partial<PredictInput> = {}): PredictInput {
  return { features, hasPerson: true, isFaceOnly: false, hasHands: true, motion: NO_MOTION, ...overrides };
}

/** Run the vote to the end, like the live loop does frame after frame. */
function settle(classifier: ActionClassifier, make: (frame: number) => PredictInput): Prediction {
  let result: Prediction | null = null;
  for (let frame = 0; frame < VOTE_WINDOW; frame++) result = classifier.predict(make(frame));
  if (!result) throw new Error("no prediction");
  return result;
}

function trained(moves = MOVES, a = examples(MOVE_A, 1), b = examples(MOVE_B, 100)) {
  const classifier = new ActionClassifier();
  const result = trainFromExamples(classifier, moves, { a, b });
  expect(result.success).toBe(true);
  return classifier;
}

describe("ActionClassifier", () => {
  test("starts with the 0.65 rejection threshold", () => {
    expect(new ActionClassifier().rejectionThreshold).toBe(DEFAULT_REJECTION_THRESHOLD);
    expect(DEFAULT_REJECTION_THRESHOLD).toBe(0.65);
  });

  test("trains two moves and recognises each", () => {
    const classifier = trained();
    expect(classifier.isTrained).toBe(true);
    expect(classifier.exampleCount()).toBe(10);

    const a = settle(classifier, (f) => input(vector(MOVE_A, 500 + f)));
    expect(a.status).toBe("recognized");
    expect(a.classId).toBe("a");
    expect(a.match).toBeGreaterThan(DEFAULT_REJECTION_THRESHOLD);

    const b = settle(classifier, (f) => input(vector(MOVE_B, 600 + f)));
    expect(b.status).toBe("recognized");
    expect(b.classId).toBe("b");
    const scoreA = b.scores.find((s) => s.id === "a");
    const scoreB = b.scores.find((s) => s.id === "b");
    expect(scoreB?.match ?? 0).toBeGreaterThan(scoreA?.match ?? 1);
    expect((scoreA?.share ?? 0) + (scoreB?.share ?? 0)).toBeCloseTo(1, 5);
  });

  test("says it doesn't know for a move it was never shown", () => {
    const classifier = trained();
    const result = settle(classifier, (f) => input(vector(OUTLIER, 700 + f)));
    expect(result.status).toBe("unknown");
    expect(result.classId).toBeNull();
    expect(result.reason).toBe("no_match");
    expect(result.match).toBeLessThan(DEFAULT_REJECTION_THRESHOLD);
    for (const score of result.scores) expect(score.match).toBeLessThan(DEFAULT_REJECTION_THRESHOLD);
  });

  test("says it doesn't know halfway between two moves", () => {
    const classifier = trained();
    const halfway = MOVE_A.map((v, i) => (v + MOVE_B[i]) / 2);
    const result = settle(classifier, (f) => input(vector(halfway, 800 + f)));
    expect(result.status).toBe("unknown");
  });

  test("a single odd frame does not change a steady answer", () => {
    const classifier = trained();
    settle(classifier, (f) => input(vector(MOVE_A, 900 + f)));
    const afterBlip = classifier.predict(input(vector(MOVE_B, 950)));
    expect(afterBlip.status).toBe("recognized");
    expect(afterBlip.classId).toBe("a");
  });

  test("reports nobody in view", () => {
    const classifier = trained();
    const result = settle(classifier, () => input(null, { hasPerson: false }));
    expect(result.status).toBe("no_person");
  });

  test("asks for the body when a whole-body move only sees a face", () => {
    const classifier = trained([
      { id: "a", name: "Stand" },
      { id: "b", name: "Sit" },
    ]);
    const result = settle(classifier, (f) => input(vector(MOVE_A, f), { isFaceOnly: true }));
    expect(result.status).toBe("not_enough_info");
  });

  test("asks for a hand when both moves are hand shapes", () => {
    const classifier = trained([
      { id: "a", name: "Open hand" },
      { id: "b", name: "Fist" },
    ]);
    const result = settle(classifier, (f) => input(vector(MOVE_A, f), { hasHands: false }));
    expect(result.status).toBe("unknown");
    expect(result.reason).toBe("no_hand");
  });

  test("a wave needs waving when the examples waved", () => {
    const waving: TemporalMotion = { ...NO_MOTION, isWaving: true, waveReversals: 4 };
    const moves = [
      { id: "a", name: "Wave" },
      { id: "b", name: "Hands down" },
    ];
    const classifier = trained(moves, examples(MOVE_A, 1, 5, waving));
    const still = settle(classifier, (f) => input(vector(MOVE_A, 300 + f)));
    expect(still.status).toBe("unknown");
    expect(still.reason).toBe("no_motion");
    const moving = settle(classifier, (f) => input(vector(MOVE_A, 300 + f), { motion: waving }));
    expect(moving.status).toBe("recognized");
    expect(moving.classId).toBe("a");
  });

  test("skips the waving check when the examples never waved", () => {
    const moves = [
      { id: "a", name: "Wave" },
      { id: "b", name: "Hands down" },
    ];
    const classifier = trained(moves, examples(MOVE_A, 1, 5, NO_MOTION));
    const result = settle(classifier, (f) => input(vector(MOVE_A, 300 + f)));
    expect(result.status).toBe("recognized");
  });

  test("needs two moves with examples to train", () => {
    const classifier = new ActionClassifier();
    const result = trainFromExamples(classifier, MOVES, { a: examples(MOVE_A, 1), b: [] });
    expect(result.success).toBe(false);
    expect(classifier.isTrained).toBe(false);
    expect(classifier.predict(input(vector(MOVE_A, 1))).status).toBe("not_trained");
  });

  test("ignores examples of the wrong length", () => {
    const classifier = new ActionClassifier();
    classifier.setClasses(MOVES);
    expect(classifier.addExample("a", { features: vector(MOVE_A, 1) })).toBe(true);
    expect(classifier.addExample("a", { features: [1, 2, 3] })).toBe(false);
    expect(classifier.addExample("missing", { features: vector(MOVE_A, 2) })).toBe(false);
    expect(classifier.exampleCount("a")).toBe(1);
  });

  test("reset forgets the moves, the examples and the model", () => {
    const classifier = trained();
    classifier.reset();
    expect(classifier.isTrained).toBe(false);
    expect(classifier.exampleCount()).toBe(0);
    expect(classifier.predict(input(vector(MOVE_A, 1))).status).toBe("not_trained");
  });

  test("keeps the threshold inside a sensible range", () => {
    const classifier = new ActionClassifier();
    classifier.setRejectionThreshold(0.1);
    expect(classifier.rejectionThreshold).toBe(0.45);
    classifier.setRejectionThreshold(2);
    expect(classifier.rejectionThreshold).toBe(0.9);
  });
});
