import { clamp, type Guess } from "./math";

/**
 * Light maths from the original LightExperiment: a 0 to 100 "room light"
 * slider mapped to lux on a cube curve (10 lux in a dark room up to about
 * 100,000 lux in sunlight) and the screen brightness that follows it. The
 * original picked modes and presets from the slider position, which called a
 * 12,500 lux room a classroom; modes now come from lux.
 */

export const SLIDER_MIN = 2;
export const SLIDER_MAX = 100;

export function luxFromSlider(v: number): number {
  return Math.round(Math.pow(clamp(v, 0, 100) / 100, 3) * 99990 + 10);
}

/** Auto-brightness: about 15% in the dark up to 100% in full sun. */
export function screenBrightness(v: number): number {
  return Math.round(15 + clamp(v, 0, 100) * 0.85);
}

export type LightMode = "night" | "indoor" | "outdoor";

export function lightMode(lux: number): LightMode {
  if (lux < 50) return "night";
  if (lux <= 5000) return "indoor";
  return "outdoor";
}

export const LIGHT_MODE_LABEL: Record<LightMode, string> = {
  night: "Night mode",
  indoor: "Indoor mode",
  outdoor: "Outdoor boost",
};

export function lightGuessFromLux(lux: number): Guess {
  const mode = lightMode(lux);
  if (mode === "night") return { label: "Dark: night, or in a bag", because: "Under 50 lux. Even a dim room is brighter." };
  if (mode === "indoor") return { label: "Indoors", because: "Between 50 and 5,000 lux: room lights, not the sun." };
  return { label: "Outside in daylight", because: "Over 5,000 lux. Only daylight gets this bright." };
}

/** Presets on the cube curve. Classroom lights are about 500 lux. */
export const LIGHT_PRESETS = [
  { id: "dark", label: "Dark room", value: 5 },
  { id: "classroom", label: "Classroom", value: 17 },
  { id: "sunny", label: "Sunny playground", value: 95 },
] as const;

/**
 * The live version has no light sensor to read (browsers don't expose it), so
 * it uses how bright the front camera's picture is, 0 to 1. The camera adjusts
 * itself to the light, so this is a rough estimate, and the UI says so.
 */
export function sliderFromCamera(brightness: number): number {
  return clamp(Math.round(brightness * 100), 0, 100);
}

export function lightGuessFromCamera(brightness: number): Guess {
  if (brightness < 0.12) return { label: "Dark: night, or covered", because: "The camera picture is almost black." };
  if (brightness < 0.7) return { label: "Indoors", because: "A medium-bright picture, the kind room lights give." };
  return { label: "Very bright: a window or outside", because: "The picture is close to white." };
}
