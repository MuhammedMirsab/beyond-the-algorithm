import { describe, expect, it } from "bun:test";
import { PIECE_LABEL } from "../audio/instruments/drums";
import { drumPads } from "../instruments/drums";
import { PERC_LAYOUTS } from "../instruments/percussion";
import { PROGRESSIONS, scaleNotes } from "../music";
import { DEFAULTS, type Settings } from "../settings";
import { chordsEvery, LESSON_GROUPS, LESSONS, melody, pattern } from "./lessons";

describe("lesson helpers", () => {
  it("lays out a melody by note lengths", () => {
    expect(melody("C4 D4:0.5 r:0.5 E4:2 F4")).toEqual([
      { beat: 0, key: "60" },
      { beat: 1, key: "62" },
      { beat: 2, key: "64" },
      { beat: 4, key: "65" },
    ]);
  });

  it("reads drum-machine patterns, bar after bar", () => {
    const p = pattern({ kick: "x-------x-------", snare: "----x-------x---" }, 2);
    expect(p.map((t) => `${t.key}@${t.beat}`)).toEqual(["kick@0", "snare@1", "kick@2", "snare@3", "kick@4", "snare@5", "kick@6", "snare@7"]);
  });

  it("repeats chords", () => {
    expect(chordsEvery(["G", "C"], 4, 2, 2)).toEqual([
      { beat: 0, key: "G" },
      { beat: 2, key: "G" },
      { beat: 4, key: "C" },
      { beat: 6, key: "C" },
    ]);
  });
});

/** Settings while a lesson runs: the defaults with its patch on top. */
function patched(patch: (typeof LESSONS)[number]["patch"]): Settings {
  const s = structuredClone(DEFAULTS);
  if (patch?.piano) Object.assign(s.piano, patch.piano);
  if (patch?.drums) Object.assign(s.drums, patch.drums);
  if (patch?.guitar) Object.assign(s.guitar, patch.guitar);
  if (patch?.percussion) Object.assign(s.percussion, patch.percussion);
  return s;
}

describe("every lesson can be played", () => {
  it("keeps all 16 lessons from the original app, each in a group", () => {
    expect(LESSONS).toHaveLength(16);
    for (const l of LESSONS) expect(LESSON_GROUPS.some((g) => g.inst === l.inst)).toBe(true);
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(16);
  });

  it("asks piano lessons only for keys on the beginner keyboard", () => {
    for (const l of LESSONS.filter((x) => x.inst === "piano")) {
      const s = patched(l.patch).piano;
      const base = 12 * (s.octave + 1) + s.key;
      const keys = scaleNotes(s.key, s.scale, base, base + 12);
      for (const t of l.targets) expect(keys).toContain(Number(t.key));
    }
  });

  it("asks drum lessons only for pads in their kit", () => {
    for (const l of LESSONS.filter((x) => x.inst === "drums")) {
      const pads = drumPads(patched(l.patch).drums.layout, false).map((p) => p.id);
      for (const t of l.targets) expect(pads).toContain(t.key);
    }
  });

  it("asks guitar lessons only for chords in their progression", () => {
    for (const l of LESSONS.filter((x) => x.inst === "guitar")) {
      const chords = PROGRESSIONS[patched(l.patch).guitar.progression].chords;
      for (const t of l.targets) expect(chords).toContain(t.key);
    }
  });

  it("lets rhythm lessons use any pad of a real set", () => {
    for (const l of LESSONS.filter((x) => x.inst === "percussion")) {
      expect(l.anyKey).toBe(true);
      expect(PERC_LAYOUTS[patched(l.patch).percussion.layout].pads.length).toBeGreaterThan(0);
      for (const t of l.targets) expect(t.key).toBe("*");
    }
  });

  it("names every drum piece", () => {
    for (const id of ["kick", "snare", "hhc", "hho", "crash", "ride", "tomh", "tomm", "toml"]) expect(PIECE_LABEL[id]).toBeDefined();
  });

  it("writes lesson copy without dashes or exclamation marks", () => {
    for (const l of LESSONS) {
      for (const text of [l.title, l.desc, l.tip]) {
        expect(text).not.toMatch(/[–—!]/);
      }
    }
  });
});
