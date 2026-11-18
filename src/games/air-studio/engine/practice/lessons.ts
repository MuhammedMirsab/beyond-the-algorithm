import { parseNote } from "../music";
import type { InstrumentId, SettingsPatch } from "../settings";

/**
 * The original app's 16 lessons, with their targets and tempos unchanged and
 * the words rewritten for the booth. Progress is not saved: the best score
 * lives in memory until Next player.
 */

export interface Target {
  /** Beats from the first beat after the count-in. */
  beat: number;
  /** What to play: a MIDI note, a pad id, a chord, or "*" for any pad. */
  key: string;
}

export type LessonLevel = "Beginner" | "Intermediate" | "Advanced";

export interface Lesson {
  id: string;
  inst: InstrumentId;
  title: string;
  level: LessonLevel;
  desc: string;
  tip: string;
  bpm: number;
  sig: "4/4" | "3/4";
  targets: Target[];
  /** Settings applied while the lesson runs. */
  patch?: SettingsPatch;
  /** Any pad counts ("*" targets). */
  anyKey?: boolean;
}

/** Melody helper: "E4:1 D4:0.5 ..." (length in beats, 1 if left out; "r" is a rest). */
export function melody(s: string, startBeat = 0): Target[] {
  let b = startBeat;
  const out: Target[] = [];
  for (const tok of s.trim().split(/\s+/)) {
    const [n, d] = tok.split(":");
    if (n !== "r") out.push({ beat: b, key: String(parseNote(n)) });
    b += parseFloat(d ?? "1");
  }
  return out;
}

/** Drum-machine helper: one string per key, x for a hit, repeated for `bars`. */
export function pattern(map: Record<string, string>, bars: number, stepsPerBeat = 4): Target[] {
  const out: Target[] = [];
  for (let bar = 0; bar < bars; bar++) {
    for (const [key, pat] of Object.entries(map)) {
      [...pat].forEach((c, i) => {
        if (c === "x") out.push({ beat: bar * (pat.length / stepsPerBeat) + i / stepsPerBeat, key });
      });
    }
  }
  return out.sort((a, b) => a.beat - b.beat);
}

export function chordsEvery(chords: string[], beatsEach: number, strumsPerChord: number, strumStep: number): Target[] {
  const out: Target[] = [];
  chords.forEach((c, i) => {
    for (let k = 0; k < strumsPerChord; k++) out.push({ beat: i * beatsEach + k * strumStep, key: c });
  });
  return out;
}

const pianoBeginner = { level: "beginner" as const, key: 0, scale: "major" as const, octave: 4, chordAssist: "off" as const, activation: "line" as const };

export const LESSONS: Lesson[] = [
  {
    id: "pn-scale", inst: "piano", title: "C major scale", level: "Beginner", bpm: 66, sig: "4/4",
    desc: "Play C D E F G A B C going up, one note per beat.",
    tip: "Hover just above the line, move sideways, then dip.",
    targets: melody("C4 D4 E4 F4 G4 A4 B4 C5:2"), patch: { piano: pianoBeginner },
  },
  {
    id: "pn-mary", inst: "piano", title: "Mary had a little lamb", level: "Beginner", bpm: 80, sig: "4/4",
    desc: "A nursery tune on E, D, C and G.",
    tip: "For the same note twice, lift above the line between presses.",
    targets: melody("E4 D4 C4 D4 E4 E4 E4:2 D4 D4 D4:2 E4 G4 G4:2 E4 D4 C4 D4 E4 E4 E4 E4 D4 D4 E4 D4 C4:4"), patch: { piano: pianoBeginner },
  },
  {
    id: "pn-ode", inst: "piano", title: "Ode to joy", level: "Intermediate", bpm: 84, sig: "4/4",
    desc: "The famous tune from Beethoven's Ninth Symphony.",
    tip: "Near the end of each line, one note comes half a beat early.",
    targets: melody("E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:0.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:0.5 C4:2"), patch: { piano: pianoBeginner },
  },
  {
    id: "pn-chords", inst: "piano", title: "Four chords", level: "Beginner", bpm: 72, sig: "4/4",
    desc: "Chord help is on, so one finger plays a whole chord. Play C, F, G, C and hold each one for 4 beats.",
    tip: "Press on the first beat of each bar and hold.",
    targets: melody("C4:4 F4:4 G4:4 C4:4 C4:4 F4:4 G4:4 C4:4"), patch: { piano: { ...pianoBeginner, chordAssist: "triad" } },
  },
  {
    id: "pn-eighths", inst: "piano", title: "Fast scale", level: "Advanced", bpm: 80, sig: "4/4",
    desc: "Up and down the C major scale, two notes per beat.",
    tip: "Keep your fingertip below the line and slide to the next key.",
    targets: melody("C4:0.5 D4:0.5 E4:0.5 F4:0.5 G4:0.5 A4:0.5 B4:0.5 C5:0.5 B4:0.5 A4:0.5 G4:0.5 F4:0.5 E4:0.5 D4:0.5 C4:2"), patch: { piano: pianoBeginner },
  },
];

/** Lessons grouped by instrument, in the order of the instrument picker. */
export const LESSON_GROUPS: { inst: InstrumentId; title: string }[] = [
  { inst: "piano", title: "Piano" },
];
