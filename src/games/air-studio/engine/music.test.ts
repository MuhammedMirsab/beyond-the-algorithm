import { describe, expect, it } from "bun:test";
import { CHORD_ROOTS, CHORD_SHAPES, chordMidi, diatonicTriad, fmtTime, isBlack, midiToFreq, noteName, parseNote, PROGRESSIONS, scaleNotes } from "./music";

describe("notes", () => {
  it("tunes A4 to 440 Hz and doubles per octave", () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(81)).toBeCloseTo(880);
    expect(midiToFreq(60)).toBeCloseTo(261.63, 1);
  });

  it("names MIDI notes", () => {
    expect(noteName(60)).toBe("C4");
    expect(noteName(61)).toBe("C#4");
    expect(noteName(21)).toBe("A0");
    expect(noteName(59.6)).toBe("C4");
  });

  it("parses sample file names", () => {
    expect(parseNote("C4")).toBe(60);
    expect(parseNote("Cs4")).toBe(61);
    expect(parseNote("D#4")).toBe(63);
    expect(parseNote("Bb3")).toBe(58);
    expect(parseNote("A0")).toBe(21);
    expect(parseNote("H2")).toBe(-1);
  });

  it("knows the black keys", () => {
    expect([60, 61, 62, 63, 64, 65, 66].map(isBlack)).toEqual([false, true, false, true, false, false, true]);
  });

  it("formats times", () => {
    expect(fmtTime(0)).toBe("0:00");
    expect(fmtTime(29.9)).toBe("0:29");
    expect(fmtTime(75)).toBe("1:15");
    expect(fmtTime(Number.NaN)).toBe("0:00");
  });
});

describe("scales", () => {
  it("gives the beginner piano one octave of C major: 8 keys", () => {
    expect(scaleNotes(0, "major", 60, 72)).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
  });

  it("follows the key", () => {
    expect(scaleNotes(9, "minorPent", 57, 69)).toEqual([57, 60, 62, 64, 67, 69]);
  });

  it("stacks triads inside the scale", () => {
    expect(diatonicTriad(60, 0, "major")).toEqual([60, 64, 67]); // C
    expect(diatonicTriad(62, 0, "major")).toEqual([62, 65, 69]); // Dm
    expect(diatonicTriad(71, 0, "major")).toEqual([71, 74, 77]); // B diminished
  });

  it("picks major or minor triads for scales without seven notes", () => {
    expect(diatonicTriad(57, 9, "minorPent")).toEqual([57, 60, 64]); // A minor
    expect(diatonicTriad(60, 0, "pentatonic")).toEqual([60, 64, 67]); // C major
  });
});

describe("guitar chords", () => {
  it("turns a shape into the notes of each string", () => {
    expect(chordMidi("G")).toEqual([43, 47, 50, 55, 59, 67]);
    expect(chordMidi("C")).toEqual([-1, 48, 52, 55, 60, 64]);
  });

  it("knows each chord's root", () => {
    expect(CHORD_ROOTS.G).toBe(7);
    expect(CHORD_ROOTS["F#m"]).toBe(6);
    expect(CHORD_ROOTS.Bb).toBe(10);
    expect(CHORD_ROOTS.Cmaj7).toBe(0);
  });

  it("has a shape for every chord in every progression", () => {
    for (const p of Object.values(PROGRESSIONS)) for (const c of p.chords) expect(CHORD_SHAPES[c]).toBeDefined();
  });
});
