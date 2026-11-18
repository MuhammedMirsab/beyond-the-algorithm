/**
 * Lens registry (visitors see them as "filters"). The array index is the lens
 * id used by the fragment shader (`lens(int id, …)` in shaders.ts): keep the
 * two in the same order.
 *
 * The order is the order of the picker and of pinching through: vivid and
 * cheap to draw first (the first frame a visitor makes should look great on
 * any laptop), the face-tracking Cartoon third, the subtler ones after.
 *
 * `recipe` says, in plain words, what the graphics card does to the pixels
 * inside the frame. It is shown in How it works, never over the camera, and
 * stays honest (the thermal lens can't feel heat, the X-ray lens can't see
 * through you).
 */
export interface Lens {
  id: string;
  name: string;
  recipe: string;
  /** Accent for the canvas chrome (label dot, pinch ripple). Never purple. */
  accent: string;
}

export const LENSES = [
  {
    id: "pixel",
    name: "Pixel art",
    recipe: "Each square block of pixels becomes one big pixel, painted in the closest of 16 colours, like an old video game.",
    accent: "#ff3d7f",
  },
  {
    id: "thermal",
    name: "Thermal",
    recipe: "Bright and reddish areas glow hot, dark ones go cold. It only reads colour: it can't feel heat.",
    accent: "#ff7a1a",
  },
  {
    id: "cartoon",
    name: "Cartoon",
    recipe: "A face model finds your eyes, nose and chin. Your eyes grow and get big shiny irises, your chin shrinks, your skin is smoothed and your face is lit like a 3D film.",
    accent: "#ffb38a",
  },
  {
    id: "halftone",
    name: "Dots",
    recipe: "Each small patch of pixels becomes one dot. The brighter the patch, the bigger the dot.",
    accent: "#f4f1ea",
  },
  {
    id: "ascii",
    name: "Text",
    recipe: "Each patch of pixels becomes a character: a dot for the darkest patches, an @ for the brightest.",
    accent: "#b6ff3b",
  },
  {
    id: "night",
    name: "Night vision",
    recipe: "Dark pixels are brightened, tinted green and given a little grain.",
    accent: "#5dff8a",
  },
  {
    id: "xray",
    name: "X-ray",
    recipe: "Light and dark swap places and the edges glow. It can't see through you.",
    accent: "#8fd3ff",
  },
  {
    id: "blueprint",
    name: "Blueprint",
    recipe: "Only the edges are kept, drawn in white on blue graph paper.",
    accent: "#6b9bff",
  },
  {
    id: "dither",
    name: "Black and white",
    recipe: "Only black and white dots, in a pattern that fakes shades of grey.",
    accent: "#e8e4da",
  },
  {
    id: "glitch",
    name: "Glitch",
    recipe: "Rows of pixels slide sideways and the red, green and blue split apart.",
    accent: "#3df5c4",
  },
  {
    id: "loupe",
    name: "Zoom",
    recipe: "The middle of your frame, 2.2 times bigger.",
    accent: "#ffd166",
  },
] as const satisfies readonly Lens[];

export type LensId = (typeof LENSES)[number]["id"];

export const LENS_COUNT = LENSES.length;

/** The Cartoon lens (the only one that also runs the face model). */
export const CARTOON_LENS = LENSES.findIndex((l) => l.id === "cartoon");

/** Keyboard shortcut for a lens: 1 to 9, 0 for the tenth, then the minus key (next to 0). */
export const lensKey = (index: number) => (index < 10 ? String((index + 1) % 10) : "-");

export const wrapLens = (index: number) => ((index % LENS_COUNT) + LENS_COUNT) % LENS_COUNT;
