import { describe, expect, test } from "bun:test";
import {
  HOW_INTRO,
  INTRO_STEPS,
  averageRate,
  formatCount,
  formatDuration,
  howSteps,
  loadingCopy,
  pinchHint,
  pointsFound,
  pointsReadout,
  statsReadout,
  statusText,
  summaryTitle,
  type SessionNumbers,
} from "./copy";

const numbers: SessionNumbers = { framesTracked: 2914, handsFound: 5120, perSecond: 28, locks: 6, lensesTried: 4 };
const none: SessionNumbers = { framesTracked: 0, handsFound: 0, perSecond: null, locks: 0, lensesTried: 0 };

describe("live copy", () => {
  test("the status walks the visitor to a frame", () => {
    expect(statusText({ locked: false, hands: 0 })).toBe("Raise both hands");
    expect(statusText({ locked: false, hands: 1 })).toBe("Now your other hand");
    expect(statusText({ locked: false, hands: 2 })).toBe("Make an L shape with each hand");
    expect(statusText({ locked: true, hands: 2 })).toBe("Frame locked");
    // Brief tracking dropouts keep the frame (and the status) up.
    expect(statusText({ locked: true, hands: 1 })).toBe("Frame locked");
  });

  test("the pinch hint shows once a frame is up, until the first pinch", () => {
    expect(pinchHint({ locked: false, pinches: 0, mirror: true })).toBeNull();
    expect(pinchHint({ locked: true, pinches: 0, mirror: true })).toBe("Pinch your right hand for the next lens");
    expect(pinchHint({ locked: true, pinches: 1, mirror: true })).toBeNull();
    // Unmirrored, the hand on the right of the screen is the visitor's left hand.
    expect(pinchHint({ locked: true, pinches: 0, mirror: false })).toBe("Pinch the hand on the right for the next lens");
  });

  test("machine readouts", () => {
    expect(pointsReadout(2)).toBe("2 hands · 42 points");
    expect(pointsReadout(1)).toBe("1 hand · 21 points");
    expect(statsReadout({ delegate: "GPU", fps: 30, inferenceMs: 14.24, latencyMs: null })).toBe("GPU · 30 fps · model 14.2 ms");
    expect(statsReadout({ delegate: "CPU", fps: 24, inferenceMs: 30, latencyMs: 61 })).toBe(
      "CPU · 24 fps · model 30.0 ms · delay 61 ms",
    );
  });
});

describe("loading copy", () => {
  test("downloading shows real megabytes", () => {
    const c = loadingCopy({ stage: "download", fraction: 0.5, loadedBytes: 11 * 1024 * 1024, totalBytes: 22 * 1024 * 1024 }, false);
    expect(c).toEqual({ label: "Downloading the hand model", detail: "11.0 of 22.0 MB", progress: 0.5, step: 0 });
  });

  test("before the first byte there is no made-up total", () => {
    expect(loadingCopy(null, false)).toEqual({ label: "Downloading the hand model", detail: undefined, progress: 0, step: 0 });
  });

  test("runtime, then GPU against CPU with the measured GPU time, then the camera", () => {
    expect(loadingCopy({ stage: "compile", fraction: 1, loadedBytes: 0, totalBytes: 0 }, false).step).toBe(1);
    const bench = loadingCopy(
      { stage: "benchmark", fraction: 1, loadedBytes: 0, totalBytes: 0, timings: { GPU: 12.34, CPU: null } },
      false,
    );
    expect(bench).toEqual({ label: "Choosing GPU or CPU", detail: "GPU took 12.3 ms, now testing CPU", progress: null, step: 2 });
    const noGpu = loadingCopy({ stage: "benchmark", fraction: 1, loadedBytes: 0, totalBytes: 0, timings: { GPU: null, CPU: null } }, false);
    expect(noGpu.detail).toBe("No GPU here, testing CPU");
    expect(loadingCopy({ stage: "benchmark", fraction: 1, loadedBytes: 0, totalBytes: 0 }, true)).toEqual({
      label: "Starting the camera",
      progress: null,
      step: 3,
    });
  });

  test("nothing says calibrating (nothing calibrates)", () => {
    const stages = [
      loadingCopy(null, false),
      loadingCopy({ stage: "compile", fraction: 1, loadedBytes: 0, totalBytes: 0 }, false),
      loadingCopy({ stage: "benchmark", fraction: 1, loadedBytes: 0, totalBytes: 0 }, false),
      loadingCopy(null, true),
    ];
    for (const s of stages) expect(`${s.label} ${s.detail ?? ""}`).not.toMatch(/calibrat/i);
  });
});

describe("the reveal", () => {
  test("uses the visitor's own numbers", () => {
    const steps = howSteps(numbers);
    expect(steps).toHaveLength(3);
    expect(steps[0].title).toBe("It finds 21 points on each hand");
    expect(steps[0].yours).toBe("It checked 2,914 pictures of you, about 28 every second. It found 5,120 hands in them.");
    expect(steps[1].yours).toBe("You made a frame 6 times.");
    expect(steps[2].yours).toBe("You tried 4 of 11 lenses.");
    expect(howSteps({ ...numbers, locks: 1, perSecond: null })[1].yours).toBe("You made a frame 1 time.");
    expect(howSteps({ ...numbers, perSecond: null })[0].yours).toBe(
      "It checked 2,914 pictures of you. It found 5,120 hands in them.",
    );
    expect(howSteps({ ...numbers, handsFound: 0 })[0].yours).toBe(
      "It checked 2,914 pictures of you, about 28 every second. It found no hands in them.",
    );
  });

  test("without numbers it only explains", () => {
    for (const step of howSteps(null)) expect(step.yours).toBeUndefined();
    for (const step of howSteps(none)) expect(step.yours).toBeUndefined();
  });

  test("verdicts", () => {
    expect(summaryTitle(numbers)).toBe("Your frame was just 4 points");
    expect(summaryTitle({ ...numbers, locks: 0 })).toBe("It found your hands");
    expect(summaryTitle(none)).toBe("It didn't see your hands this time");
    expect(pointsFound(5120)).toBe(107_520);
  });

  test("rates and durations", () => {
    expect(averageRate(2914, 100)).toBe(29);
    expect(averageRate(10, 0.4)).toBeNull();
    expect(averageRate(0, 30)).toBeNull();
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(60)).toBe("1 min");
    expect(formatDuration(72.4)).toBe("1 min 12 s");
    expect(formatCount(107520)).toBe("107,520");
  });
});

describe("writing rules (DESIGN.md §9)", () => {
  const everything = [
    HOW_INTRO,
    ...INTRO_STEPS.flatMap((s) => [s.title, s.text]),
    ...howSteps(numbers).flatMap((s) => [s.title, s.text, s.yours ?? ""]),
    ...[0, 1, 2].map((hands) => statusText({ locked: false, hands })),
    statusText({ locked: true, hands: 2 }),
    summaryTitle(numbers),
    summaryTitle(none),
  ];

  test("no em or en dashes, no exclamation marks", () => {
    for (const text of everything) expect(text).not.toMatch(/[—–!]/);
  });

  test("no banned words", () => {
    const banned = /\b(delve|leverage|unlock|empower|elevate|seamless|cutting-edge|revolutionary|magic|journey|harness|robust|crucial|pivotal|showcase|vibrant)\b/i;
    for (const text of everything) expect(text).not.toMatch(banned);
  });
});
