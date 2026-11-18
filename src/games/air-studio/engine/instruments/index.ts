import type { InstrumentId } from "../settings";
import type { Controller } from "./common";
import { PianoController } from "./piano";
import { SynthController } from "./synth";

/** Needs a running audio engine (engine.ensure()). */
export function createController(id: InstrumentId): Controller {
  switch (id) {
    case "piano":
      return new PianoController();
    case "synth":
      return new SynthController();
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
    id: "synth",
    name: "Synth",
    blurb: "Sweep your hands to bend the sound.",
    how: ["Move a hand sideways to change the note.", "Open your hand to play, make a fist to stop.", "Move faster for more wobble."],
    point: "tip",
    source: "synthesised",
  },
];

export const instrumentInfo = (id: InstrumentId) => INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0];
