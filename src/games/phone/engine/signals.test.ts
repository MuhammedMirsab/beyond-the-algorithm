import { describe, expect, test } from "bun:test";
import { levelPercent, rmsFromBytes, rmsToDb, soundGuess, synthBytes, wavePath } from "./audio-level";
import {
  LIGHT_PRESETS,
  lightGuessFromCamera,
  lightGuessFromLux,
  lightMode,
  luxFromSlider,
  screenBrightness,
} from "./light";
import {
  applyLightAndFocus,
  blurFromFocus,
  cameraGuess,
  cellGrid,
  frameStats,
  lumaFromRGBA,
  renderScene,
  SCENE_HEIGHT,
  SCENE_WIDTH,
} from "./frame-stats";

describe("microphone level from samples", () => {
  test("silence (all 128) is level 0", () => {
    const silence = new Uint8Array(512).fill(128);
    expect(rmsFromBytes(silence)).toBe(0);
    expect(rmsToDb(0)).toBe(-100);
    expect(levelPercent(0)).toBe(0);
  });

  test("a full-scale square wave is level 100", () => {
    const square = Uint8Array.from({ length: 512 }, (_, i) => (i % 2 ? 0 : 255));
    expect(rmsFromBytes(square)).toBeCloseTo(1, 1);
    expect(levelPercent(rmsFromBytes(square))).toBe(100);
  });

  test("-30 dBFS sits halfway on the meter", () => {
    expect(levelPercent(Math.pow(10, -30 / 20))).toBe(50);
  });

  test("an empty buffer is silent", () => {
    expect(rmsFromBytes(new Uint8Array(0))).toBe(0);
  });

  test("the wave path is flat for silence and spans the box", () => {
    expect(wavePath(null, 100, 40)).toBe("M0 20 L100 20");
    const flat = wavePath(new Uint8Array(256).fill(128), 100, 40, 4);
    expect(flat).toBe("M0.00 20.00L33.33 20.00L66.67 20.00L100.00 20.00");
  });

  test("the wave path follows the samples and stays inside the box", () => {
    const loud = Uint8Array.from([0, 255, 0, 255]);
    expect(wavePath(loud, 30, 40, 4)).toBe("M0.00 0.00L10.00 39.84L20.00 0.00L30.00 39.84");
  });
});

describe("sound guess", () => {
  const levels = (kind: "quiet" | "talking" | "crowd") =>
    Array.from({ length: 36 }, (_, i) => levelPercent(rmsFromBytes(synthBytes(kind, i / 12))));

  test("needs a couple of seconds first", () => {
    expect(soundGuess([50, 50]).label).toBe("Listening");
  });

  test("simulated quiet, talking and crowd read as such", () => {
    expect(soundGuess(levels("quiet")).label).toBe("A quiet room");
    expect(soundGuess(levels("talking")).label).toBe("Someone talking");
    expect(soundGuess(levels("crowd")).label).toBe("Somewhere crowded");
  });

  test("steady medium sound is a noisy room", () => {
    expect(soundGuess(Array.from({ length: 30 }, () => 35)).label).toBe("A noisy room");
  });
});

describe("lux mapping", () => {
  test("matches the original cube curve", () => {
    expect(luxFromSlider(0)).toBe(10);
    expect(luxFromSlider(100)).toBe(100_000);
    expect(luxFromSlider(50)).toBe(12_509);
  });

  test("screen brightness runs 15% to 100%", () => {
    expect(screenBrightness(0)).toBe(15);
    expect(screenBrightness(100)).toBe(100);
    expect(screenBrightness(50)).toBe(58);
  });

  test("presets land in the right mode", () => {
    const mode = (id: string) => lightMode(luxFromSlider(LIGHT_PRESETS.find((p) => p.id === id)?.value ?? 0));
    expect(mode("dark")).toBe("night");
    expect(mode("classroom")).toBe("indoor");
    expect(mode("sunny")).toBe("outdoor");
  });

  test("a classroom is about 500 lux, indoors", () => {
    expect(luxFromSlider(17)).toBeGreaterThan(400);
    expect(luxFromSlider(17)).toBeLessThan(600);
    expect(lightGuessFromLux(500).label).toBe("Indoors");
    expect(lightGuessFromLux(20).label).toContain("Dark");
    expect(lightGuessFromLux(80_000).label).toContain("Outside");
  });

  test("camera estimate thresholds", () => {
    expect(lightGuessFromCamera(0.05).label).toContain("Dark");
    expect(lightGuessFromCamera(0.45).label).toBe("Indoors");
    expect(lightGuessFromCamera(0.9).label).toContain("bright");
  });
});

describe("camera frame stats", () => {
  test("a flat grey frame has no edges", () => {
    const grey = new Uint8ClampedArray(40 * 30 * 4).fill(128);
    const stats = frameStats(grey, 40, 30);
    expect(stats.brightness).toBeCloseTo(128 / 255, 2);
    expect(stats.sharpness).toBe(0);
  });

  test("luma uses Rec. 601 weights", () => {
    const red = new Uint8ClampedArray([255, 0, 0, 255]);
    expect(lumaFromRGBA(red, 1, 1)[0]).toBeCloseTo(76.245, 2);
  });

  test("the simulated scene is sharp until it is blurred", () => {
    const scene = renderScene();
    const sharp = frameStats(applyLightAndFocus(scene, SCENE_WIDTH, SCENE_HEIGHT, 0.5, blurFromFocus(100)), SCENE_WIDTH, SCENE_HEIGHT);
    const soft = frameStats(applyLightAndFocus(scene, SCENE_WIDTH, SCENE_HEIGHT, 0.5, blurFromFocus(20)), SCENE_WIDTH, SCENE_HEIGHT);
    expect(sharp.sharpness).toBeGreaterThan(0.6);
    expect(soft.sharpness).toBeLessThan(0.28);
    expect(cameraGuess(sharp).label).toBe("Clear enough to read");
    expect(cameraGuess(soft).label).toBe("Too blurry to read text");
  });

  test("turning the light down reads as too dark", () => {
    const scene = renderScene();
    const dark = frameStats(applyLightAndFocus(scene, SCENE_WIDTH, SCENE_HEIGHT, 0.04, 0), SCENE_WIDTH, SCENE_HEIGHT);
    expect(dark.brightness).toBeLessThan(0.12);
    expect(cameraGuess(dark).label).toContain("Too dark");
  });

  test("focus maps to a blur radius of 0 to 5", () => {
    expect(blurFromFocus(100)).toBe(0);
    expect(blurFromFocus(0)).toBe(5);
    expect(blurFromFocus(50)).toBe(3);
  });

  test("cell grid averages each block", () => {
    const luma = Float32Array.from([0, 0, 255, 255, 0, 0, 255, 255]);
    expect(Array.from(cellGrid(luma, 4, 2, 2, 1))).toEqual([0, 1]);
  });
});
