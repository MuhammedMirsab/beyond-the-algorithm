import { describe, expect, it } from "bun:test";
import { CHORD_SHAPES } from "../music";
import { BACKING_STYLES, backingStep, bassRootOf, parseChord, styleById, voice, type BackingNote } from "./backing";

const SD = 0.15; // seconds per step
const opts = (patch: Partial<{ loop: boolean; arpIndex: number }> = {}) => ({ loop: true, arpIndex: 0, random: () => 0.5, ...patch });
const kinds = (notes: BackingNote[]) => notes.map((n) => (n.kind === "drum" ? `drum:${n.piece}` : n.kind));

describe("parseChord", () => {
  it("reads roots and qualities", () => {
    expect(parseChord("C")).toEqual({ root: 0, tones: [0, 4, 7] });
    expect(parseChord("Am")).toEqual({ root: 9, tones: [0, 3, 7] });
    expect(parseChord("Dm7")).toEqual({ root: 2, tones: [0, 3, 7, 10] });
    expect(parseChord("Cmaj7")).toEqual({ root: 0, tones: [0, 4, 7, 11] });
    expect(parseChord("Bb")).toEqual({ root: 10, tones: [0, 4, 7] });
    expect(parseChord("A5")).toEqual({ root: 9, tones: [0, 7, 12] });
  });

  it("voices chords close around the middle", () => {
    const v = voice(7, [0, 4, 7], 64);
    expect(v).toEqual([59, 62, 67]);
    for (const n of voice(0, [0, 4, 7, 11], 62)) {
      expect(n).toBeGreaterThanOrEqual(56);
      expect(n).toBeLessThanOrEqual(69);
    }
  });

  it("keeps the bass between E1 and D#2", () => {
    for (let r = 0; r < 12; r++) {
      expect(bassRootOf(r)).toBeGreaterThanOrEqual(28);
      expect(bassRootOf(r)).toBeLessThanOrEqual(39);
    }
  });
});

describe("backingStep", () => {
  const pop = styleById("pop");

  it("plays the pop groove's first step: kick, hi-hat, bass and a piano chord", () => {
    const { notes } = backingStep(pop, 0, 1, SD, opts());
    expect(kinds(notes).sort()).toEqual(["bass", "drum:hhc", "drum:kick", "keys"]);
    const keys = notes.find((n) => n.kind === "keys");
    expect(keys && keys.kind === "keys" && keys.notes).toEqual(voice(0, [0, 4, 7], 64));
    const bass = notes.find((n) => n.kind === "bass");
    expect(bass && bass.kind === "bass" && bass.midi).toBe(bassRootOf(0));
  });

  it("puts the snare on beats 2 and 4", () => {
    const snares = [];
    for (let s = 0; s < 16; s++) if (backingStep(pop, s, s * SD, SD, opts()).notes.some((n) => n.kind === "drum" && n.piece === "snare")) snares.push(s);
    expect(snares).toEqual([4, 12]);
  });

  it("follows the chords bar by bar and loops", () => {
    const bassAt = (step: number) => {
      const n = backingStep(pop, step, 0, SD, opts()).notes.find((x) => x.kind === "bass");
      return n && n.kind === "bass" ? n.midi : null;
    };
    expect(bassAt(0)).toBe(bassRootOf(0)); // C
    expect(bassAt(16)).toBe(bassRootOf(7)); // G
    expect(bassAt(32)).toBe(bassRootOf(9)); // Am
    expect(bassAt(48)).toBe(bassRootOf(5)); // F
    expect(bassAt(64)).toBe(bassRootOf(0)); // back to C
  });

  it("stops after one pass when looping is off", () => {
    expect(backingStep(pop, 64, 0, SD, opts({ loop: false })).notes).toHaveLength(0);
    expect(backingStep(pop, 62, 0, SD, opts({ loop: false })).notes.length).toBeGreaterThan(0);
  });

  it("plays nothing during the count-in", () => {
    expect(backingStep(pop, -4, 0, SD, opts()).notes).toHaveLength(0);
  });

  it("swings the off-beat eighths", () => {
    const jazz = styleById("jazz");
    const onBeat = backingStep(jazz, 4, 10, SD, opts()).notes;
    const offBeat = backingStep(jazz, 6, 10, SD, opts()).notes;
    expect(onBeat.every((n) => n.t === 10)).toBe(true);
    expect(offBeat.length).toBeGreaterThan(0);
    for (const n of offBeat) expect(n.t).toBeCloseTo(10 + jazz.swing * SD);
  });

  it("walks the bass towards the next chord", () => {
    const jazz = styleById("jazz");
    const walk = [0, 4, 8, 12].map((s) => {
      const n = backingStep(jazz, s, 0, SD, opts()).notes.find((x) => x.kind === "bass");
      return n && n.kind === "bass" ? n.midi : 0;
    });
    const root = bassRootOf(2); // Dm7
    expect(walk.slice(0, 3)).toEqual([root, root + 3, root + 7]);
    const next = bassRootOf(7); // G7
    expect(Math.abs(walk[3] - next)).toBe(1);
  });

  it("carries the arpeggio from step to step", () => {
    const classical = styleById("classical");
    let arpIndex = 0;
    const played: number[] = [];
    for (let s = 0; s < 12; s += 2) {
      const r = backingStep(classical, s, 0, SD, opts({ arpIndex }));
      arpIndex = r.arpIndex;
      const n = r.notes.find((x) => x.kind === "keys");
      if (n && n.kind === "keys") played.push(n.notes[0]);
    }
    expect(arpIndex).toBe(6);
    const v = voice(0, [0, 4, 7], 64);
    const arp = [v[0] - 12, ...v, v[1] + 12];
    expect(played).toEqual([0, 1, 2, 3, 2, 1].map((i) => arp[i]));
  });

  it("uses the electronic clap and holds pads for the bar", () => {
    const electronic = styleById("electronic");
    const step4 = backingStep(electronic, 4, 0, SD, opts()).notes;
    expect(step4.some((n) => n.kind === "drum" && n.piece === "eClap")).toBe(true);
    const pad = backingStep(electronic, 0, 0, SD, opts()).notes.find((n) => n.kind === "pad");
    expect(pad && pad.kind === "pad" && pad.dur).toBeCloseTo(SD * 16);
  });

  it("strums rock chords that have a guitar shape", () => {
    const rock = styleById("rock");
    const strum = backingStep(rock, 0, 0, SD, opts()).notes.find((n) => n.kind === "strum");
    expect(strum && strum.kind === "strum" && strum.chord).toBe("A5");
    for (const c of rock.chords) expect(CHORD_SHAPES[c]).toBeDefined();
  });

  it("gives every style a bar pattern that matches its time signature", () => {
    for (const s of BACKING_STYLES) {
      const len = s.sig === "3/4" ? 12 : 16;
      for (const p of Object.values(s.pattern)) expect(p).toHaveLength(len);
      if (s.bass) expect(s.bass).toHaveLength(len);
      if (s.comp) expect(s.comp.pat).toHaveLength(len);
      expect(s.desc).not.toMatch(/[–—!]/);
    }
  });
});
