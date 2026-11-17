/**
 * Lens registry. The array index is the lens id used by the fragment shader
 * (`lens(int id, …)` in shaders.ts): keep the two in the same order.
 *
 * `blurb` says, in plain words, what the computer does to the pixels inside
 * the frame. Visitors read it on the projector, so it stays short and honest
 * (the thermal lens can't feel heat, the X-ray lens can't see through you).
 */
export interface Lens {
  id: string;
  name: string;
  blurb: string;
  /** Accent for the canvas chrome (label dot, pinch ripple). Never purple. */
  accent: string;
}

export const LENSES = [
  { id: "halftone", name: "Halftone", blurb: "Each patch of pixels becomes one dot. Brighter patch, bigger dot.", accent: "#f4f1ea" },
  { id: "thermal", name: "Thermal", blurb: "Bright and reddish areas glow hot. It only sees colour, not heat.", accent: "#ff7a1a" },
  { id: "night", name: "Night vision", blurb: "Dark pixels are brightened and tinted green.", accent: "#5dff8a" },
  { id: "ascii", name: "ASCII", blurb: "Each patch of pixels becomes a letter or symbol.", accent: "#b6ff3b" },
  { id: "dither", name: "1-bit", blurb: "Only black and white dots, in a pattern that fakes grey.", accent: "#e8e4da" },
  { id: "xray", name: "X-ray", blurb: "Light and dark swap places and edges glow. It can't see through you.", accent: "#8fd3ff" },
  { id: "blueprint", name: "Blueprint", blurb: "Only the edges are kept, drawn in white on blue.", accent: "#6b9bff" },
  { id: "pixel", name: "8-bit", blurb: "Big square pixels and only 16 colours, like old video games.", accent: "#ff3d7f" },
  { id: "glitch", name: "Glitch", blurb: "Rows of pixels slide sideways and the colours split apart.", accent: "#3df5c4" },
  { id: "loupe", name: "Loupe", blurb: "The middle of your frame, 2.2 times bigger.", accent: "#ffd166" },
] as const satisfies readonly Lens[];

export const LENS_COUNT = LENSES.length;

/** Keyboard label for a lens: 1 to 9, then 0 for the tenth. */
export const lensKey = (index: number) => String((index + 1) % 10);

export const wrapLens = (index: number) => ((index % LENS_COUNT) + LENS_COUNT) % LENS_COUNT;
