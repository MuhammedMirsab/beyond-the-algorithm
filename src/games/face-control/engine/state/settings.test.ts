import { describe, expect, test } from "bun:test";
import { sanitizeRecords } from "./records";
import { DEFAULT_SETTINGS, SETTINGS_KEY, sanitizeSettings } from "./settings";

describe("settings", () => {
  test("live under the arcade's namespaced key", () => {
    expect(SETTINGS_KEY).toBe("bta:face-control:settings");
  });

  test("garbage in storage falls back to defaults", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings("nope")).toEqual(DEFAULT_SETTINGS);
  });

  test("values are clamped and jump sensitivity is a whole step", () => {
    const s = sanitizeSettings({ steerSensitivity: 9, deadZone: -1, jumpSensitivity: 3.6, smoothing: "x", showLandmarks: false });
    expect(s.steerSensitivity).toBe(2);
    expect(s.deadZone).toBe(0);
    expect(s.jumpSensitivity).toBe(4);
    expect(s.smoothing).toBe(DEFAULT_SETTINGS.smoothing);
    expect(s.showLandmarks).toBe(false);
  });
});

describe("records", () => {
  test("corrupted records become empty ones", () => {
    expect(sanitizeRecords({ bestScore: "lots", levels: { 1: { bestTime: "fast" } } })).toEqual({
      bestScore: 0,
      bestRunTime: null,
      runsCompleted: 0,
      levels: { 1: { bestTime: null, bestSparks: 0 } },
    });
  });
});
