import type { InstrumentId } from "../settings";
import type { Controller } from "./common";
import { DrumController } from "./drums";
import { GuitarController } from "./guitar";
import { PercussionController } from "./percussion";
import { PianoController } from "./piano";
import { SynthController } from "./synth";

/** Needs a running audio engine (engine.ensure()). */
export function createController(id: InstrumentId): Controller {
  switch (id) {
    case "piano":
      return new PianoController();
    case "drums":
      return new DrumController();
    case "guitar":
      return new GuitarController();
    case "synth":
      return new SynthController();
    case "percussion":
      return new PercussionController();
  }
}

export interface InstrumentInfo {
  id: InstrumentId;
  name: string;
  /** One line for the picker card. */
  blurb: string;
  /** How to play, in the order a visitor needs it. */
  how: string[];
  /** Which hand point the overlay marks: the fingertip for keys and pitch, the palm for strikes. */
  point: "tip" | "palm";
  /** What the sound is made from (for the reveal). */
  source: "recorded" | "synthesised";
}

export const INSTRUMENTS: InstrumentInfo[] = [
  {
    id: "piano",
    name: "Piano",
    blurb: "Dip a fingertip to press a key.",
    how: ["Move a fingertip sideways to choose a key.", "Dip it below the line to play. Lift it to stop.", "Both hands can play at once."],
    point: "tip",
    source: "recorded",
  },
  {
    id: "drums",
    name: "Drums",
    blurb: "Strike nine pads, from hi-hat to kick.",
    how: ["Tap down sharply over a pad.", "A faster hit plays louder.", "Slow down between hits, so a still hand stays quiet."],
    point: "palm",
    source: "synthesised",
  },
  {
    id: "guitar",
    name: "Guitar",
    blurb: "One hand picks the chord, the other strums.",
    how: ["Raise or lower your chord hand to pick a chord.", "Swing your other hand down or up through the strings.", "Make a fist with the strumming hand to mute."],
    point: "palm",
    source: "recorded",
  },
  {
    id: "synth",
    name: "Synth",
    blurb: "Sweep your hands to bend the sound.",
    how: ["Move a hand sideways to change the note.", "Open your hand to play, make a fist to stop.", "Move faster for more wobble."],
    point: "tip",
    source: "synthesised",
  },
  {
    id: "percussion",
    name: "Percussion",
    blurb: "Bongos, congas, claps and a shaker.",
    how: ["Tap down over a pad to play it.", "Make a fist and shake it for the shaker.", "A faster hit plays louder."],
    point: "palm",
    source: "synthesised",
  },
];

export const instrumentInfo = (id: InstrumentId) => INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0];
