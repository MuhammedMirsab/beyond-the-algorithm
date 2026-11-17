/**
 * Ready-made pairs of moves (from the original's QUICK_PRESETS and
 * data/presets.js, minus the object pairs this game no longer supports).
 */
import { classTraits } from "./traits";

export type MoveIcon = "wave" | "clap" | "open" | "fist" | "up" | "down" | "thumb" | "point" | "custom";

export interface MovePreset {
  name: string;
  /** What to do, shown while recording. */
  hint: string;
  icon: MoveIcon;
}

export interface PresetPair {
  id: string;
  /** What kind of difference the machine has to find. */
  kind: string;
  moves: [MovePreset, MovePreset];
}

export const PRESET_PAIRS: PresetPair[] = [
  {
    id: "wave-clap",
    kind: "Two movements",
    moves: [
      { name: "Wave", hint: "Wave one hand side to side, above your shoulder.", icon: "wave" },
      { name: "Clap", hint: "Clap in front of your chest, again and again.", icon: "clap" },
    ],
  },
  {
    id: "open-fist",
    kind: "Two hand shapes",
    moves: [
      { name: "Open hand", hint: "Hold up one hand, fingers spread, palm to the camera.", icon: "open" },
      { name: "Fist", hint: "Hold up one hand, closed in a fist.", icon: "fist" },
    ],
  },
  {
    id: "up-down",
    kind: "Two poses",
    moves: [
      { name: "Hands up", hint: "Raise both hands above your head.", icon: "up" },
      { name: "Hands down", hint: "Let both arms hang by your sides.", icon: "down" },
    ],
  },
  {
    id: "thumb-point",
    kind: "Two hand shapes",
    moves: [
      { name: "Thumbs up", hint: "Hold up a thumbs up next to your shoulder.", icon: "thumb" },
      { name: "Pointing", hint: "Point one finger straight up.", icon: "point" },
    ],
  },
];

/** Longest name a visitor can type for their own move. */
export const MOVE_NAME_MAX = 16;

/** Instructions for a move the visitor named themselves. */
export function customHint(name: string): string {
  const traits = classTraits(name);
  if (traits.moving) return "Keep doing the move the whole time it records.";
  if (traits.needsHands) return "Hold your hand up to the camera, the same way each time.";
  return "Hold the move still until it takes the example.";
}

/** Tidy a typed name: single spaces, no padding, first letter upper case. */
export function tidyMoveName(raw: string): string {
  const name = raw.replace(/\s+/g, " ").trim().slice(0, MOVE_NAME_MAX);
  return name.charAt(0).toUpperCase() + name.slice(1);
}
