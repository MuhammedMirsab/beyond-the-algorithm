import type { InstrumentId } from "../engine/settings";

/**
 * The coach: one short line at a time, only when it helps. Camera problems
 * come first (no hands, too dark, too close); otherwise it teaches the
 * current instrument one move at a time, moving on as the visitor plays,
 * and goes quiet once they have it. Pure: numbers in, a line out.
 */

export type CoachTone = "tip" | "good" | "warn";
export type CoachIcon = "hands" | "light" | "closer" | "back" | "steady" | "play" | "check" | "next";

export interface CoachLine {
  id: string;
  text: string;
  tone: CoachTone;
  icon: CoachIcon;
  /** Nothing else matters until this is fixed: shown large, in the middle. */
  big?: boolean;
}

export interface CoachInput {
  mode: "camera" | "mouse";
  /** The stage is live: tracking runs (or the pretend hand does) and the instrument is loaded. */
  live: boolean;
  instrument: InstrumentId;
  leftHanded: boolean;
  /** A touch screen: say "tap", not "click". */
  touch: boolean;
  left: boolean;
  right: boolean;
  /** Average hand size (wrist to middle knuckle, frame heights), or null with no hands. */
  size: number | null;
  /** Milliseconds since a hand was last seen. */
  noHandsFor: number;
  /** 0 to 255. */
  brightness: number;
  /** Share of recent frames with a hand, and the model's frame rate. */
  detectRate: number;
  fps: number;
  /** Notes, hits or strums played on this instrument. */
  events: number;
  /** Milliseconds since this instrument last played (Infinity before the first). */
  sinceEvent: number;
  /** Milliseconds since the stage went live. */
  sinceLive: number;
}

/** Which line of an instrument's lesson: line i shows from STEP_AT[i] notes until STEP_AT[i + 1]. */
export const STEP_AT = [0, 1, 4, 8, 14];
/** No notes for this long with hands in view: the first line comes back as a reminder. */
export const IDLE_REMIND_MS = 10_000;
/** No hand for this long: ask for hands. */
export const NO_HANDS_MS = 1500;

export const DARK = 55;
export const TOO_CLOSE = 0.2;
export const TOO_FAR = 0.065;

/** The instrument's moves, in the order a visitor needs them. */
function lines(i: CoachInput): string[] {
  const cam = i.mode === "camera";
  const click = i.touch ? "Tap" : "Click";
  switch (i.instrument) {
    case "percussion":
      return cam
        ? [
            "Hit the air over a pad. A quick move down plays it.",
            "That's a hit. The camera saw your hand move down fast.",
            "Make a fist and shake it for the shaker.",
            "Hit faster to play louder.",
          ]
        : [
            `${click} a pad, or flick the ${i.touch ? "finger" : "mouse"} down over it.`,
            "That's a hit. A quick move down counts, just like a real hand.",
            ...(i.touch ? [] : ["Hold Space for a fist, then shake the mouse for the shaker."]),
          ];
    case "piano":
      return cam
        ? [
            "Point a finger, then dip it below the dotted line to play.",
            "That's a note. Lift your finger above the line to let go.",
            "Move sideways for other keys. Both hands can play.",
            "Dip faster to play louder.",
          ]
        : [
            `${click} a key, or move the pointer down across the dotted line.`,
            "That's a note. Move back above the line to let go.",
            "Slide sideways below the line to play the next keys.",
          ];
    case "synth":
      return cam
        ? [
            "Open your hand to play. Move it sideways to change the note.",
            "That's the synth. Higher is brighter. Make a fist to stop.",
            "Move faster for more wobble.",
          ]
        : [
            "Move the pointer over the stage to play. Sideways changes the note.",
            i.touch ? "That's the synth. Lift your finger to stop." : "That's the synth. Hold Space to make a fist and stop.",
          ];
  }
}

/** The camera's own numbers, in order of what to fix first (camera mode only). */
export function cameraLine(i: CoachInput): CoachLine | null {
  if (i.mode !== "camera" || !i.live) return null;
  if (i.brightness < DARK) return { id: "dark", text: "It's too dark for the camera to see your hands. Face a light.", tone: "warn", icon: "light", big: !i.left && !i.right };
  if (!i.left && !i.right && i.noHandsFor >= NO_HANDS_MS) return { id: "no-hands", text: "Raise your hands so the camera can see them.", tone: "warn", icon: "hands", big: true };
  if (i.size !== null && i.size > TOO_CLOSE) return { id: "too-close", text: "Step back a little, so your hands fit.", tone: "warn", icon: "back" };
  if (i.size !== null && i.size < TOO_FAR) return { id: "too-far", text: "Come a little closer to the camera.", tone: "warn", icon: "closer" };
  if ((i.left || i.right) && (i.detectRate < 0.6 || i.fps < 14)) return { id: "unsteady", text: "Tracking is unsteady. More light, or a plain background, helps.", tone: "warn", icon: "steady" };
  return null;
}

/** The next move to learn on this instrument, or a reminder; null once the visitor has it. */
export function lessonLine(i: CoachInput): CoachLine | null {
  if (!i.live) return null;
  const steps = lines(i);
  // Gone quiet with a hand up: back to the first move.
  const handUp = i.mode === "mouse" || i.left || i.right;
  if (i.events > 0 && i.sinceEvent >= IDLE_REMIND_MS && handUp) return { id: `${i.instrument}-remind`, text: steps[0], tone: "tip", icon: "play" };
  let step = 0;
  for (let k = 0; k < STEP_AT.length; k++) if (i.events >= STEP_AT[k]) step = k;
  if (step >= steps.length) return null;
  const good = step === 1;
  return { id: `${i.instrument}-${step}`, text: steps[step], tone: good ? "good" : "tip", icon: good ? "check" : "play" };
}

/** The one line worth saying now: a camera problem first, else the next move. */
export function coachLine(i: CoachInput): CoachLine | null {
  return cameraLine(i) ?? lessonLine(i);
}

/** When part of the studio appears, the coach points to it once. */
export const REVEAL_LINES: Record<1 | 2 | 3, CoachLine> = {
  1: { id: "reveal-1", text: "More instruments are in the bar below.", tone: "tip", icon: "next" },
  2: { id: "reveal-2", text: "New below: play along with a band, or record a take.", tone: "tip", icon: "next" },
  3: { id: "reveal-3", text: "New below: practice, with a score for your timing.", tone: "tip", icon: "next" },
};
