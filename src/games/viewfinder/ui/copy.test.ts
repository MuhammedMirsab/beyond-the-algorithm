import { describe, expect, test } from "bun:test";
import { LENSES } from "../engine/lenses";
import { POINTS_LABEL } from "../engine/overlay";
import {
  INTRO_STEPS,
  KEY_HINTS,
  NO_NUMBERS,
  averageRate,
  coach,
  formatCount,
  formatDuration,
  howIntro,
  howSteps,
  lensName,
  loadingCopy,
  pointsFound,
  summaryLine,
  summaryTitle,
  type CoachState,
  type SessionNumbers,
} from "./copy";

const numbers: SessionNumbers = {
  framesTracked: 2914,
  handsFound: 5120,
  facesFound: 640,
  perSecond: 28,
  locks: 6,
  lensesTried: 4,
  lockedSeconds: 48.4,
  maxFramePixels: 412_345,
  favouriteLens: 1,
  inferenceMs: 14.2,
  delegate: "GPU",
  videoWidth: 1280,
  videoHeight: 720,
};

const idle: CoachState = {
  locked: false,
  everLocked: false,
  leftHand: false,
  rightHand: false,
  hint: null,
  pinches: 0,
  mirror: true,
};

describe("coaching during play", () => {
  test("walks the visitor to a frame, one step at a time", () => {
    expect(coach(idle)).toEqual({ text: "Raise both hands", kind: "hands" });
    expect(coach({ ...idle, leftHand: true })?.text).toBe("Now your other hand");
    expect(coach({ ...idle, rightHand: true })?.text).toBe("Now your other hand");
    expect(coach({ ...idle, leftHand: true, rightHand: true })).toEqual({ text: "Make an L with each hand", kind: "shape" });
  });

  test("says what is missing when two hands make no frame", () => {
    const both = { ...idle, leftHand: true, rightHand: true };
    expect(coach({ ...both, hint: "open" })?.text).toBe("Open each hand into a wide L");
    expect(coach({ ...both, hint: "shape" })?.text).toBe("Point your thumbs toward each other");
    expect(coach({ ...both, hint: "apart" })?.text).toBe("Move your hands further apart");
  });

  test("once a frame is up: the pinch, then nothing (the picture gets the screen)", () => {
    const framed = { ...idle, leftHand: true, rightHand: true, locked: true, everLocked: true };
    expect(coach(framed)).toEqual({ text: "Pinch your right hand for the next filter", kind: "pinch" });
    // Unmirrored, the hand on the right of the screen is the visitor's left hand.
    expect(coach({ ...framed, mirror: false })?.text).toBe("Pinch the hand on the right for the next filter");
    expect(coach({ ...framed, pinches: 1 })).toBeNull();
    // Brief tracking dropouts keep the frame (and the silence) up.
    expect(coach({ ...framed, pinches: 1, rightHand: false })).toBeNull();
  });

  test("after losing a frame it speaks to someone who has done it before", () => {
    const again = { ...idle, everLocked: true, pinches: 2 };
    expect(coach(again)?.text).toBe("Hands up for a new frame");
    expect(coach({ ...again, leftHand: true, rightHand: true })?.text).toBe("Make the L shapes again");
  });

  test("keys are shown as glyphs and named by what they do", () => {
    expect(KEY_HINTS.map((k) => k.keys.join(" "))).toEqual(["← →", "H", "F"]);
    expect(KEY_HINTS.map((k) => k.label)).toEqual(["Change filter", "AI view", "Full screen"]);
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

  test("runtime, then graphics card against processor with the measured time, then the camera", () => {
    expect(loadingCopy({ stage: "compile", fraction: 1, loadedBytes: 0, totalBytes: 0 }, false).step).toBe(1);
    const bench = loadingCopy({ stage: "benchmark", fraction: 1, loadedBytes: 0, totalBytes: 0, timings: { GPU: 12.34, CPU: null } }, false);
    expect(bench).toEqual({
      label: "Picking the faster chip",
      detail: "Graphics card 12.3 ms, now timing the processor",
      progress: null,
      step: 2,
    });
    const noGpu = loadingCopy({ stage: "benchmark", fraction: 1, loadedBytes: 0, totalBytes: 0, timings: { GPU: null, CPU: null } }, false);
    expect(noGpu.detail).toBe("No graphics card here, timing the processor");
    expect(loadingCopy({ stage: "benchmark", fraction: 1, loadedBytes: 0, totalBytes: 0 }, true)).toEqual({
      label: "Starting the camera",
      progress: null,
      step: 3,
    });
  });
});

describe("how it works", () => {
  test("five steps, from points to the face", () => {
    expect(howSteps(numbers).map((s) => s.id)).toEqual(["points", "corners", "smoothing", "recipe", "face"]);
    expect(howSteps(numbers)[0].title).toBe("It finds 21 points on each hand");
    expect(howSteps(numbers)[1].title).toBe("Only 4 of them make the frame");
    expect(howSteps(numbers)[1].text).toContain("(point 4)");
    expect(howSteps(numbers)[1].text).toContain("(point 8)");
    expect(howSteps(numbers)[4].text).toContain("478 points");
    expect(howSteps(numbers)[4].text).toContain("reads 12 of them");
  });

  test("uses the visitor's own numbers", () => {
    const [points, corners, smoothing, recipe, face] = howSteps(numbers);
    expect(points.yours).toBe(
      "It checked 2,914 pictures of you, about 28 every second, and placed 107,520 points on your hands. Each picture took it about 14 ms on the graphics card.",
    );
    expect(corners.yours).toBe("You made a frame 6 times and held it up for 48 s.");
    expect(smoothing.yours).toBe("Each corner was measured about 28 times a second.");
    expect(recipe.yours).toBe(
      "Your biggest frame held 412,345 pixels, all redrawn every time the picture changed. You tried 4 of 11 filters, and stayed longest on Thermal.",
    );
    expect(face.yours).toBe("It found your face in 640 pictures.");
  });

  test("numbers it can't stand behind are left out", () => {
    const quiet = howSteps({ ...numbers, perSecond: null, inferenceMs: null, handsFound: 0, locks: 0, facesFound: 0, lensesTried: 0, maxFramePixels: 0 });
    expect(quiet[0].yours).toBe("It checked 2,914 pictures of you. It found no hands in them.");
    expect(quiet[1].yours).toBeUndefined();
    expect(quiet[2].yours).toBeUndefined();
    expect(quiet[3].yours).toBeUndefined();
    expect(quiet[4].yours).toBeUndefined();
    expect(howSteps({ ...numbers, delegate: "CPU" })[0].yours).toContain("on the processor.");
    expect(howSteps({ ...numbers, lensesTried: 1 })[3].yours).toContain("You tried 1 of 11 filters.");
  });

  test("without numbers it only explains", () => {
    for (const step of howSteps(null)) expect(step.yours).toBeUndefined();
    for (const step of howSteps(NO_NUMBERS)) expect(step.yours).toBeUndefined();
  });

  test("the intro states the camera's real picture size when it is known", () => {
    expect(howIntro(numbers)).toContain("1,280 × 720: 921,600 pixels");
    expect(howIntro(null)).not.toMatch(/\d/);
  });
});

describe("the end of a session", () => {
  test("verdicts and what they mean", () => {
    expect(summaryTitle(numbers)).toBe("Your frame was just 4 points");
    expect(summaryLine(numbers)).toBe(
      "It found 107,520 points on your hands, but your frame only ever used 4 of them at a time: your thumb tips and index fingertips.",
    );
    expect(summaryTitle({ ...numbers, locks: 0 })).toBe("It found your hands");
    expect(summaryLine({ ...numbers, locks: 0 })).toContain("make an L with each hand");
    expect(summaryTitle(NO_NUMBERS)).toBe("It didn't see your hands this time");
    expect(summaryLine(NO_NUMBERS)).toContain("arm's length");
    expect(pointsFound(5120)).toBe(107_520);
    expect(lensName(1)).toBe("Thermal");
    expect(lensName(-1)).toBeNull();
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
  const both = { ...idle, leftHand: true, rightHand: true };
  const everything = [
    howIntro(numbers),
    howIntro(null),
    ...INTRO_STEPS.flatMap((s) => [s.title, s.text]),
    ...KEY_HINTS.map((k) => k.label),
    ...howSteps(numbers).flatMap((s) => [s.title, s.text, s.yours ?? ""]),
    ...[idle, { ...idle, leftHand: true }, both, { ...both, hint: "open" as const }, { ...both, hint: "shape" as const }, { ...both, hint: "apart" as const }]
      .map((s) => coach(s)?.text ?? ""),
    coach({ ...both, locked: true })?.text ?? "",
    summaryTitle(numbers),
    summaryTitle(NO_NUMBERS),
    summaryLine(numbers),
    summaryLine({ ...numbers, locks: 0 }),
    summaryLine(NO_NUMBERS),
    POINTS_LABEL,
    ...LENSES.flatMap((l) => [l.name, l.recipe]),
  ];

  test("no em or en dashes, no exclamation marks", () => {
    for (const text of everything) expect(text).not.toMatch(/[—–!]/);
  });

  test("no banned words", () => {
    const banned = /\b(delve|leverage|unlock|empower|elevate|seamless|cutting-edge|revolutionary|magic|journey|harness|robust|crucial|pivotal|showcase|vibrant)\b/i;
    for (const text of everything) expect(text).not.toMatch(banned);
  });

  test("never all caps (acronyms like AI, and a lone capital like the X in X-ray, are fine)", () => {
    const acronyms = new Set(["AI"]);
    for (const text of everything) {
      expect((text.match(/\b[A-Z]{2,}\b/g) ?? []).filter((word) => !acronyms.has(word))).toEqual([]);
    }
    expect(POINTS_LABEL).toBe("4 of 42 points");
  });
});
