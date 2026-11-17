/**
 * Music theory helpers, copied from the original app (lib/music.ts, plus
 * parseNote from audio/samples.ts). Pure functions: no browser APIs.
 */

export const NOTE_NAMES: readonly string[] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
export const noteName = (m: number) => NOTE_NAMES[((Math.round(m) % 12) + 12) % 12] + (Math.floor(Math.round(m) / 12) - 1);
export const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);

/** Parse "Cs4" / "D#4" / "A0" to a MIDI note number, or -1. */
export function parseNote(n: string): number {
  const m = /^([A-G])(s|#|b)?(-?\d)$/.exec(n);
  if (!m) return -1;
  let pc = NOTE_NAMES.indexOf(m[1]);
  if (m[2] === "s" || m[2] === "#") pc += 1;
  if (m[2] === "b") pc -= 1;
  return (parseInt(m[3], 10) + 1) * 12 + pc;
}

export type ScaleId =
  | "major"
  | "minor"
  | "pentatonic"
  | "minorPent"
  | "blues"
  | "dorian"
  | "mixolydian"
  | "harmonicMinor"
  | "chromatic";

export const SCALES: Record<ScaleId, { label: string; steps: number[] }> = {
  major: { label: "Major", steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { label: "Minor", steps: [0, 2, 3, 5, 7, 8, 10] },
  pentatonic: { label: "Pentatonic", steps: [0, 2, 4, 7, 9] },
  minorPent: { label: "Minor pentatonic", steps: [0, 3, 5, 7, 10] },
  blues: { label: "Blues", steps: [0, 3, 5, 6, 7, 10] },
  dorian: { label: "Dorian", steps: [0, 2, 3, 5, 7, 9, 10] },
  mixolydian: { label: "Mixolydian", steps: [0, 2, 4, 5, 7, 9, 10] },
  harmonicMinor: { label: "Harmonic minor", steps: [0, 2, 3, 5, 7, 8, 11] },
  chromatic: { label: "All notes", steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
};

/** MIDI notes in [lo, hi] that belong to `scale` rooted at `root` (0 to 11). */
export function scaleNotes(root: number, scale: ScaleId, lo: number, hi: number): number[] {
  const steps = (SCALES[scale] ?? SCALES.major).steps;
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (steps.includes((((m - root) % 12) + 12) % 12)) out.push(m);
  return out;
}

/** The triad stacked on `m` inside the scale (a major triad when the scale has no 7-note shape). */
export function diatonicTriad(m: number, root: number, scale: ScaleId): number[] {
  const steps = (SCALES[scale] ?? SCALES.major).steps;
  if (steps.length !== 7) {
    const rel = (x: number) => (((x - root) % 12) + 12) % 12;
    const minor = steps.includes(rel(m + 3)) && !steps.includes(rel(m + 4));
    return [m, m + (minor ? 3 : 4), m + 7];
  }
  const notes = scaleNotes(root, scale, m, m + 14);
  if (notes[0] !== m) return [m, m + 4, m + 7];
  return [notes[0], notes[2], notes[4]];
}

/* ── Guitar ─────────────────────────────────────────────────────── */

/** E2 A2 D3 G3 B3 E4. */
export const STANDARD_TUNING = [40, 45, 50, 55, 59, 64];

/** Fret per string, low E to high E. -1 means the string is not played. */
export const CHORD_SHAPES: Record<string, number[]> = {
  C: [-1, 3, 2, 0, 1, 0], D: [-1, -1, 0, 2, 3, 2], E: [0, 2, 2, 1, 0, 0], F: [1, 3, 3, 2, 1, 1],
  G: [3, 2, 0, 0, 0, 3], A: [-1, 0, 2, 2, 2, 0], B: [-1, 2, 4, 4, 4, 2], Bb: [-1, 1, 3, 3, 3, 1],
  Am: [-1, 0, 2, 2, 1, 0], Bm: [-1, 2, 4, 4, 3, 2], Cm: [-1, 3, 5, 5, 4, 3], Dm: [-1, -1, 0, 2, 3, 1],
  Em: [0, 2, 2, 0, 0, 0], Fm: [1, 3, 3, 1, 1, 1], Gm: [3, 5, 5, 3, 3, 3], "F#m": [2, 4, 4, 2, 2, 2],
  "C#m": [-1, 4, 6, 6, 5, 4],
  A7: [-1, 0, 2, 0, 2, 0], B7: [-1, 2, 1, 2, 0, 2], C7: [-1, 3, 2, 3, 1, 0], D7: [-1, -1, 0, 2, 1, 2],
  E7: [0, 2, 0, 1, 0, 0], G7: [3, 2, 0, 0, 0, 1],
  Am7: [-1, 0, 2, 0, 1, 0], Em7: [0, 2, 0, 0, 0, 0], Dm7: [-1, -1, 0, 2, 1, 1],
  Cmaj7: [-1, 3, 2, 0, 0, 0], Fmaj7: [-1, -1, 3, 2, 1, 0], Dsus4: [-1, -1, 0, 2, 3, 3], Asus2: [-1, 0, 2, 2, 0, 0],
  E5: [0, 2, 2, -1, -1, -1], A5: [-1, 0, 2, 2, -1, -1], D5: [-1, -1, 0, 2, 3, -1], G5: [3, 5, 5, -1, -1, -1],
};

/** Pitch class (0 to 11) of each chord's root. */
export const CHORD_ROOTS: Record<string, number> = Object.fromEntries(
  Object.keys(CHORD_SHAPES).map((c) => {
    const r = c.startsWith("Bb") ? 10 : NOTE_NAMES.indexOf(c[1] === "#" ? c.slice(0, 2) : c[0]);
    return [c, r];
  }),
);

export type ProgressionId = "pop" | "folk" | "rock" | "blues" | "ballad" | "minor" | "jazz" | "power" | "open";

export const PROGRESSIONS: Record<ProgressionId, { label: string; chords: string[] }> = {
  pop: { label: "Pop", chords: ["G", "D", "Em", "C"] },
  folk: { label: "Folk", chords: ["C", "Am", "F", "G"] },
  rock: { label: "Rock", chords: ["A", "D", "E", "A5"] },
  blues: { label: "Blues", chords: ["E7", "A7", "B7"] },
  ballad: { label: "Ballad", chords: ["D", "A", "Bm", "G"] },
  minor: { label: "Minor", chords: ["Am", "F", "C", "G"] },
  jazz: { label: "Jazz", chords: ["Dm7", "G7", "Cmaj7", "Am7"] },
  power: { label: "Power chords", chords: ["E5", "G5", "A5", "D5"] },
  open: { label: "Six open chords", chords: ["G", "C", "D", "Em", "Am", "E"] },
};

/** MIDI note per string for a chord shape (-1 for strings that are not played). */
export function chordMidi(chord: string): number[] {
  const shape = CHORD_SHAPES[chord] ?? CHORD_SHAPES.C;
  return shape.map((f, i) => (f < 0 ? -1 : STANDARD_TUNING[i] + f));
}

/* ── Small helpers ──────────────────────────────────────────────── */

export const fmtTime = (s: number) => {
  const safe = Number.isFinite(s) && s > 0 ? s : 0;
  const m = Math.floor(safe / 60);
  const sec = Math.floor(safe % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
