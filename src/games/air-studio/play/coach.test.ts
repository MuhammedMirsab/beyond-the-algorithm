import { describe, expect, it } from "bun:test";
import { coachLine, IDLE_REMIND_MS, NO_HANDS_MS, STEP_AT, type CoachInput } from "./coach";

const base: CoachInput = {
  mode: "camera",
  live: true,
  instrument: "piano",
  leftHanded: false,
  touch: false,
  left: true,
  right: true,
  size: 0.11,
  noHandsFor: 0,
  brightness: 120,
  detectRate: 1,
  fps: 30,
  events: 0,
  sinceEvent: Infinity,
  sinceLive: 5000,
};

const line = (patch: Partial<CoachInput>) => coachLine({ ...base, ...patch });

describe("coach", () => {
  it("says nothing until the stage is live", () => {
    expect(line({ live: false })).toBeNull();
  });

  it("asks for hands first, large, when the camera sees none", () => {
    const l = line({ left: false, right: false, size: null, noHandsFor: NO_HANDS_MS });
    expect(l?.id).toBe("no-hands");
    expect(l?.text).toBe("Raise your hands so the camera can see them.");
    expect(l?.big).toBe(true);
    // A hand that dropped out for a moment is not worth a message.
    expect(line({ left: false, right: false, size: null, noHandsFor: NO_HANDS_MS - 1 })?.id).toBe("piano-0");
  });

  it("puts light before distance, and distance before the lesson", () => {
    expect(line({ brightness: 30, size: 0.3 })?.id).toBe("dark");
    expect(line({ size: 0.3 })?.text).toBe("Step back a little, so your hands fit.");
    expect(line({ size: 0.04 })?.text).toBe("Come a little closer to the camera.");
    expect(line({ detectRate: 0.3 })?.id).toBe("unsteady");
  });

  it("teaches one move at a time, confirms the first hit, then goes quiet", () => {
    expect(line({ events: 0 })?.text).toBe("Point a finger, then dip it below the dotted line to play.");
    const first = line({ events: 1, sinceEvent: 100 });
    expect(first?.tone).toBe("good");
    expect(first?.text).toContain("That's a note");
    expect(line({ events: STEP_AT[2], sinceEvent: 100 })?.text).toBe("Move sideways for other keys. Both hands can play.");
    expect(line({ events: STEP_AT[3], sinceEvent: 100 })?.text).toBe("Dip faster to play louder.");
    expect(line({ events: STEP_AT[4], sinceEvent: 100 })).toBeNull();
  });

  it("reminds a visitor who has stopped, with a hand still up", () => {
    expect(line({ events: 40, sinceEvent: IDLE_REMIND_MS })?.id).toBe("piano-remind");
  });

  it("speaks to the mouse and to touch screens in their own words", () => {
    expect(line({ mode: "mouse", left: false, right: false, size: null, noHandsFor: 99999 })?.text).toBe("Click a key, or move the pointer down across the dotted line.");
    expect(line({ mode: "mouse", touch: true })?.text).toBe("Tap a key, or move the pointer down across the dotted line.");
  });

  it("never writes in capitals or with exclamation marks", () => {
    for (const instrument of ["piano", "synth"] as const) {
      for (const mode of ["camera", "mouse"] as const) {
        for (const events of [0, 1, 4, 8]) {
          const l = line({ instrument, mode, events, sinceEvent: 100 });
          if (!l) continue;
          expect(l.text).not.toMatch(/!|[A-Z]{2,}/);
          expect(l.text).not.toMatch(/[–—]/);
        }
      }
    }
  });
});
