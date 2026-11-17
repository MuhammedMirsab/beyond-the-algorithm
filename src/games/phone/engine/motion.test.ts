import { describe, expect, test } from "bun:test";
import { ballOffset, dragTilt, keyTilt, LEVEL, tiltFromOrientation, tiltGuess, TILT_LIMIT } from "./tilt";
import { createStepState, GRAVITY, magnitude, movementKind, stepReducer, syntheticForce, type StepState } from "./steps";

describe("tilt clamping", () => {
  test("a phone held at 45° reads as level", () => {
    expect(tiltFromOrientation(45, 0)).toEqual({ pitch: 0, roll: 0 });
  });

  test("beta and gamma are clamped to ±45°", () => {
    expect(tiltFromOrientation(180, -170)).toEqual({ pitch: TILT_LIMIT, roll: -TILT_LIMIT });
    expect(tiltFromOrientation(-90, 90)).toEqual({ pitch: -TILT_LIMIT, roll: TILT_LIMIT });
  });

  test("small tilts pass through unchanged", () => {
    expect(tiltFromOrientation(55, -12)).toEqual({ pitch: 10, roll: -12 });
  });
});

describe("drag fallback", () => {
  test("uses the original 0.4 gain", () => {
    expect(dragTilt(LEVEL, 50, -25)).toEqual({ pitch: -10, roll: 20 });
  });

  test("never passes the limit however far you drag", () => {
    const far = dragTilt(LEVEL, 10_000, 10_000);
    expect(far).toEqual({ pitch: 45, roll: 45 });
  });

  test("arrow keys step by 5° and 0 levels it", () => {
    expect(keyTilt(LEVEL, "ArrowRight")).toEqual({ pitch: 0, roll: 5 });
    expect(keyTilt(LEVEL, "ArrowUp")).toEqual({ pitch: -5, roll: 0 });
    expect(keyTilt({ pitch: 30, roll: -20 }, "0")).toEqual(LEVEL);
    expect(keyTilt(LEVEL, "a")).toBeNull();
    expect(keyTilt({ pitch: 44, roll: 0 }, "ArrowDown")?.pitch).toBe(45);
  });

  test("the ball offset spans -1 to 1", () => {
    expect(ballOffset({ pitch: 45, roll: -45 })).toEqual({ x: -1, y: 1 });
    expect(ballOffset(LEVEL)).toEqual({ x: 0, y: 0 });
  });
});

describe("tilt guess", () => {
  test("names the four poses", () => {
    expect(tiltGuess(LEVEL).label).toBe("In your hand");
    expect(tiltGuess({ pitch: 0, roll: 30 }).label).toBe("Turned on its side");
    expect(tiltGuess({ pitch: -40, roll: 0 }).label).toBe("Lying flat");
    expect(tiltGuess({ pitch: 40, roll: 0 }).label).toBe("Held upright");
  });
});

function run(kind: "walk" | "run", seconds: number): StepState {
  let state = createStepState();
  for (let i = 0; i <= seconds * 60; i++) {
    const t = i / 60;
    state = stepReducer(state, syntheticForce(kind, t), t * 1000);
  }
  return state;
}

describe("step counter", () => {
  test("a phone lying still counts no steps and reads as still", () => {
    let state = createStepState();
    for (let i = 0; i < 300; i++) state = stepReducer(state, GRAVITY + (i % 2 ? 0.05 : -0.05), (i * 1000) / 60);
    expect(state.steps).toBe(0);
    expect(movementKind(state.recent)).toBe("still");
  });

  test("a 4 second simulated walk counts about 2 steps a second", () => {
    const state = run("walk", 4);
    expect(state.steps).toBeGreaterThanOrEqual(6);
    expect(state.steps).toBeLessThanOrEqual(9);
    expect(movementKind(state.recent)).toBe("walking");
  });

  test("a simulated run is faster and reads as running", () => {
    const state = run("run", 4);
    expect(state.steps).toBeGreaterThan(run("walk", 4).steps);
    expect(movementKind(state.recent)).toBe("running");
  });

  test("keeps only the last 1.5 s of samples", () => {
    expect(run("walk", 4).recent.length).toBe(90);
  });

  test("magnitude of gravity alone", () => {
    expect(magnitude(0, 0, GRAVITY)).toBeCloseTo(GRAVITY);
    expect(magnitude(3, 4, 0)).toBe(5);
  });
});
