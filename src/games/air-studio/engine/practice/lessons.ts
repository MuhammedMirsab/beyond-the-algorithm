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
  {
    id: "dr-quarters", inst: "drums", title: "Snare on every beat", level: "Beginner", bpm: 76, sig: "4/4",
    desc: "Hit the snare on every beat for 4 bars.",
    tip: "Use short flicks of the wrist. A big swing of the arm arrives late.",
    targets: pattern({ snare: "x---x---x---x---" }, 4), patch: { drums: { layout: "compact" } },
  },
  {
    id: "dr-backbeat", inst: "drums", title: "Kick and snare", level: "Beginner", bpm: 80, sig: "4/4",
    desc: "Kick on beats 1 and 3, snare on beats 2 and 4.",
    tip: "The kick is the wide pad at the bottom, so reach lower for it.",
    targets: pattern({ kick: "x-------x-------", snare: "----x-------x---" }, 4), patch: { drums: { layout: "compact" } },
  },
  {
    id: "dr-rock", inst: "drums", title: "Basic rock beat", level: "Intermediate", bpm: 84, sig: "4/4",
    desc: "One hand plays the hi-hat twice a beat. The other plays kick on 1 and 3, snare on 2 and 4.",
    tip: "Get the hi-hat steady first, then add the other hand.",
    targets: pattern({ hhc: "x-x-x-x-x-x-x-x-", kick: "x-------x-------", snare: "----x-------x---" }, 4), patch: { drums: { layout: "compact" } },
  },
  {
    id: "dr-fill", inst: "drums", title: "Tom fill and crash", level: "Advanced", bpm: 90, sig: "4/4",
    desc: "Two beats on each tom from high to low, then crash and kick together.",
    tip: "Swap hands on every hit, so neither hand hits twice in a row.",
    targets: [
      ...pattern({ tomh: "x-x-x-x---------", tomm: "--------x-x-x-x-" }, 1),
      ...pattern({ toml: "x-x-x-x-x-x-x-x-" }, 1).map((t) => ({ ...t, beat: t.beat + 4 })),
      { beat: 8, key: "crash" },
      { beat: 8, key: "kick" },
    ],
    patch: { drums: { layout: "standard" } },
  },
  {
    id: "gt-pop", inst: "guitar", title: "G, D, Em, C", level: "Beginner", bpm: 70, sig: "4/4",
    desc: "One strum per beat, 4 beats per chord. Raise or lower your chord hand to change chords.",
    tip: "Move your chord hand on beat 4, so the next chord is ready.",
    targets: chordsEvery(["G", "D", "Em", "C", "G", "D", "Em", "C"], 4, 4, 1), patch: { guitar: { progression: "pop", chordSelect: "height" } },
  },
  {
    id: "gt-folk", inst: "guitar", title: "C, Am, F, G", level: "Beginner", bpm: 76, sig: "4/4",
    desc: "Two strums per chord, on beats 1 and 3.",
    tip: "Fewer strums give you more time to change chords.",
    targets: chordsEvery(["C", "Am", "F", "G", "C", "Am", "F", "G"], 4, 2, 2), patch: { guitar: { progression: "folk", chordSelect: "height" } },
  },
  {
    id: "gt-eighths", inst: "guitar", title: "Down and up strums", level: "Advanced", bpm: 72, sig: "4/4",
    desc: "Strum down and up, twice a beat, through G, D, Em and C.",
    tip: "Keep your strumming hand swinging like a pendulum, even while you change chords.",
    targets: chordsEvery(["G", "D", "Em", "C"], 4, 8, 0.5), patch: { guitar: { progression: "pop", chordSelect: "height" } },
  },
  {
    id: "rh-quarters", inst: "percussion", title: "Steady beat", level: "Beginner", bpm: 90, sig: "4/4", anyKey: true,
    desc: "Hit any pad on every click.",
    tip: "Listen for the click and land with it. Don't chase it.",
    targets: pattern({ "*": "x---x---x---x---" }, 4), patch: { percussion: { layout: "hand", shake: false } },
  },
  {
    id: "rh-eighths", inst: "percussion", title: "Twice a beat", level: "Intermediate", bpm: 84, sig: "4/4", anyKey: true,
    desc: "Two even hits per beat. Use both hands.",
    tip: "Count out loud: 1 and 2 and 3 and 4 and.",
    targets: pattern({ "*": "x-x-x-x-x-x-x-x-" }, 4), patch: { percussion: { layout: "hand", shake: false } },
  },
  {
    id: "rh-sync", inst: "percussion", title: "Off the beat", level: "Intermediate", bpm: 84, sig: "4/4", anyKey: true,
    desc: "Hit on 1, halfway after 2, on 3, and halfway after 4.",
    tip: "The in-between hits land exactly halfway between two clicks.",
    targets: pattern({ "*": "x-----x-x-----x-" }, 4), patch: { percussion: { layout: "hand", shake: false } },
  },
  {
    id: "rh-clave", inst: "percussion", title: "Son clave", level: "Advanced", bpm: 92, sig: "4/4", anyKey: true,
    desc: "A two-bar rhythm from Cuba: three hits, then two.",
    tip: "Bar 1: on 1, halfway after 2, and on 4. Bar 2: on 2 and on 3.",
    targets: pattern({ "*": "x-----x-----x-------x---x-------" }, 3, 4), patch: { percussion: { layout: "latin", shake: false } },
  },
];

/** Lessons grouped by instrument, in the order of the instrument picker. */
export const LESSON_GROUPS: { inst: InstrumentId; title: string }[] = [
  { inst: "piano", title: "Piano" },
  { inst: "drums", title: "Drums" },
  { inst: "guitar", title: "Guitar" },
  { inst: "percussion", title: "Rhythm on percussion" },
];
