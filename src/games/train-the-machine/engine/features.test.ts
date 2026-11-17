import { describe, expect, test } from "bun:test";
import {
  FEATURE_COUNT,
  WINDOW_SIZE,
  analyzeTemporalMotion,
  averageShape,
  bodyShape,
  extractFeatureVector,
  movementAmount,
} from "./features";
import { validateCapture } from "./quality";
import { classTraits } from "./traits";
import { KEYPOINT_NAMES, type HandShape, type Keypoint, type PerceptionResult } from "./types";

/* A person about a metre from a laptop: head to hips in view, legs below the frame. */
const STANDING: Record<string, [number, number]> = {
  nose: [0.5, 0.25],
  left_eye: [0.52, 0.23],
  right_eye: [0.48, 0.23],
  left_ear: [0.55, 0.24],
  right_ear: [0.45, 0.24],
  left_shoulder: [0.62, 0.45],
  right_shoulder: [0.38, 0.45],
  left_elbow: [0.68, 0.68],
  right_elbow: [0.32, 0.68],
  left_wrist: [0.67, 0.9],
  right_wrist: [0.33, 0.9],
  left_hip: [0.57, 0.92],
  right_hip: [0.43, 0.92],
  left_knee: [0.57, 1.35],
  right_knee: [0.43, 1.35],
  left_ankle: [0.57, 1.75],
  right_ankle: [0.43, 1.75],
};

function frame(overrides: Partial<Record<string, [number, number]>> = {}, gesture: HandShape | null = null, jitter = 0): PerceptionResult {
  const pose = { ...STANDING, ...overrides };
  const poseLandmarks: Keypoint[] = KEYPOINT_NAMES.map((name, i) => {
    const [x, y] = pose[name] ?? [0.5, 0.5];
    const offscreen = y > 1;
    const wobble = jitter * Math.sin(i * 7.1 + x * 31 + y * 17);
    return { x: x + wobble, y: y + wobble, score: offscreen ? 0.1 : 0.95, name };
  });
  const hand = gesture ? { landmarks: [], gesture, confidence: 0.9 } : null;
  return {
    hasPerson: true,
    hasFullBody: true,
    isFaceOnly: false,
    hasHands: !!hand,
    handCount: hand ? 1 : 0,
    poseLandmarks,
    primaryHand: hand,
    hands: hand ? [hand] : [],
    gesture,
    torsoVisible: true,
    legsVisible: false,
    timestamp: 0,
  };
}

const NOBODY: PerceptionResult = { ...frame(), hasPerson: false, poseLandmarks: [], hasFullBody: false };

/** 25 samples of the right hand raised, waving side to side (or held still). */
function waving(amplitude: number) {
  return Array.from({ length: WINDOW_SIZE }, (_, i) =>
    frame({ right_elbow: [0.27, 0.42], right_wrist: [0.27 + Math.sin(i * 0.95) * amplitude, 0.2] }, "OPEN_HAND", 0.003 * Math.cos(i * 3.3)),
  );
}

function clapping() {
  return Array.from({ length: WINDOW_SIZE }, (_, i) => {
    const half = 0.015 + ((Math.sin(i * 0.95) + 1) / 2) * 0.09;
    return frame({ left_elbow: [0.64, 0.66], right_elbow: [0.36, 0.66], left_wrist: [0.5 + half, 0.6], right_wrist: [0.5 - half, 0.6] });
  });
}

const length = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

describe("extractFeatureVector", () => {
  test("turns a frame into 44 numbers of length 1", () => {
    const vector = extractFeatureVector(frame(), waving(0.07));
    expect(vector).not.toBeNull();
    expect(vector?.length).toBe(FEATURE_COUNT);
    expect(length(vector ?? [])).toBeCloseTo(1, 6);
  });

  test("needs a person", () => {
    expect(extractFeatureVector(null)).toBeNull();
    expect(extractFeatureVector(NOBODY)).toBeNull();
  });

  test("leaves out leg guesses when the legs are out of view", () => {
    const vector = extractFeatureVector(frame()) ?? [];
    // Knees and ankles (positions 18 to 25) and the 4 leg numbers (26 to 29).
    for (let i = 18; i < 30; i++) expect(vector[i]).toBe(0);
  });

  test("marks the hand shape the gesture model reports", () => {
    const open = extractFeatureVector(frame({}, "OPEN_HAND")) ?? [];
    const fist = extractFeatureVector(frame({}, "FIST")) ?? [];
    const thumb = extractFeatureVector(frame({}, "THUMB_UP")) ?? [];
    expect(open[34]).toBeGreaterThan(0);
    expect(open[35]).toBe(0);
    expect(fist[35]).toBeGreaterThan(0);
    expect(thumb[36]).toBeGreaterThan(0);
    expect(open[33]).toBeGreaterThan(0);
  });
});

describe("analyzeTemporalMotion", () => {
  test("a hand waving side to side is waving", () => {
    expect(analyzeTemporalMotion(waving(0.07)).isWaving).toBe(true);
  });

  test("a raised hand held still is not waving, even with tracking jitter", () => {
    const still = analyzeTemporalMotion(waving(0));
    expect(still.isWaving).toBe(false);
    expect(still.waveReversals).toBe(0);
  });

  test("hands coming together and apart is clapping", () => {
    expect(analyzeTemporalMotion(clapping()).isClapping).toBe(true);
    expect(analyzeTemporalMotion(waving(0.07)).isClapping).toBe(false);
  });

  test("too few samples is no motion", () => {
    expect(analyzeTemporalMotion(waving(0.07).slice(0, 3)).isWaving).toBe(false);
  });
});

describe("shapes", () => {
  test("bodyShape measures from the hips in torso lengths", () => {
    const shape = bodyShape(frame()) ?? [];
    expect(shape.length).toBe(13);
    const nose = shape[0];
    expect(nose.y).toBeLessThan(-1);
    expect(nose.visible).toBe(true);
    expect(shape[9].visible).toBe(false);
  });

  test("averageShape averages point by point", () => {
    const up = bodyShape(frame({ right_wrist: [0.33, 0.2] }));
    const down = bodyShape(frame());
    const mean = averageShape([up, down]) ?? [];
    const upWrist = up?.[6].y ?? 0;
    const downWrist = down?.[6].y ?? 0;
    expect(mean[6].y).toBeCloseTo((upWrist + downWrist) / 2, 6);
    expect(averageShape([null])).toBeNull();
  });

  test("movementAmount sees movement but not jitter", () => {
    expect(movementAmount(waving(0.07))).toBeGreaterThan(0.15);
    expect(movementAmount(waving(0))).toBeLessThan(0.15);
  });
});

describe("validateCapture", () => {
  const still = classTraits("Hands up");

  test("keeps a good example", () => {
    expect(validateCapture({ frame: frame(), traits: still })).toBeNull();
  });

  test("asks to step in when nobody is there", () => {
    expect(validateCapture({ frame: NOBODY, traits: still })).toBe("no_person");
  });

  test("asks to step back when the shoulders are cut off", () => {
    const close = frame();
    close.poseLandmarks[5] = { ...close.poseLandmarks[5], score: 0.1 };
    expect(validateCapture({ frame: close, traits: still })).toBe("shoulders");
  });

  test("asks for a hand for hand shapes", () => {
    expect(validateCapture({ frame: frame(), traits: classTraits("Fist") })).toBe("hand");
    expect(validateCapture({ frame: frame({}, "FIST"), traits: classTraits("Fist") })).toBeNull();
  });

  test("a moving example must move and stay in view", () => {
    const wave = classTraits("Wave");
    const moving = waving(0.07);
    expect(validateCapture({ frame: moving[moving.length - 1], sequence: moving, traits: wave })).toBeNull();
    const held = waving(0);
    expect(validateCapture({ frame: held[held.length - 1], sequence: held, traits: wave })).toBe("no_movement");
    const leaving = moving.map((f, i) => (i % 2 === 0 ? NOBODY : f));
    expect(validateCapture({ frame: moving[moving.length - 1], sequence: leaving, traits: wave })).toBe("left_view");
  });
});
