/**
 * Three of the lens recipes from shaders.ts, ported to TypeScript so the
 * How it works picture can run them on a tiny image, pixel by pixel. Same
 * numbers as the shader (recipes.test.ts checks the palette against it);
 * the shader's sampling of neighbouring pixels is left out at this size.
 */

/** A colour as three numbers from 0 to 1: how red, green and blue. */
export type RGB = readonly [number, number, number];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Brightness, weighted the way eyes see it (the shader's luma()). */
export const LUMA = [0.2126, 0.7152, 0.0722] as const;
export const luma = ([r, g, b]: RGB) => LUMA[0] * r + LUMA[1] * g + LUMA[2] * b;

/** Dots: the dot's radius as a fraction of its cell's half width (lensHalftone). */
export const dotRadius = (c: RGB) => 0.16 + 0.9 * Math.sqrt(luma(c));

const RAMP: RGB[] = [
  [0.02, 0.01, 0.1],
  [0.22, 0.02, 0.48],
  [0.7, 0.04, 0.52],
  [0.96, 0.24, 0.1],
  [1.0, 0.6, 0.02],
  [1.0, 0.92, 0.35],
  [1.0, 1.0, 0.95],
];

function thermalRamp(heat: number): RGB {
  const t = clamp(heat, 0, 1) * 6;
  const i = Math.min(5, Math.floor(t));
  const f = t - i;
  const a = RAMP[i];
  const b = RAMP[i + 1];
  return [mix(a[0], b[0], f), mix(a[1], b[1], f), mix(a[2], b[2], f)];
}

/** Thermal: bright and reddish means hot (lensThermal, without the grain). */
export function thermal(c: RGB): RGB {
  const warm = clamp(c[0] - Math.max(c[1], c[2]) + 0.04, 0, 0.45);
  const heat = smoothstep(0.04, 0.82, Math.pow(luma(c), 1.25) * 0.75 + warm * 1.35);
  return thermalRamp(heat);
}

/** Pixel art's 16 colours (the shader's PALETTE). */
export const PALETTE: RGB[] = [
  [0.04, 0.04, 0.07], [0.13, 0.17, 0.35], [0.47, 0.16, 0.36], [0.02, 0.49, 0.34],
  [0.64, 0.33, 0.22], [0.37, 0.35, 0.33], [0.75, 0.76, 0.79], [1.0, 0.96, 0.9],
  [0.98, 0.07, 0.31], [1.0, 0.62, 0.05], [1.0, 0.9, 0.2], [0.1, 0.86, 0.27],
  [0.2, 0.66, 1.0], [0.52, 0.47, 0.63], [1.0, 0.49, 0.66], [1.0, 0.79, 0.65],
];

/** Pixel art: the closest of the 16 colours (lensPixel, without its dither). */
export function nearestColour(c: RGB): RGB {
  const boosted: RGB = [clamp(c[0] * 1.1, 0, 1), clamp(c[1] * 1.1, 0, 1), clamp(c[2] * 1.1, 0, 1)];
  let best = PALETTE[0];
  let bestD = Infinity;
  for (const p of PALETTE) {
    const d = (boosted[0] - p[0]) ** 2 + (boosted[1] - p[1]) ** 2 + (boosted[2] - p[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** "rgb(228 176 140)" for SVG fills. */
export const css = ([r, g, b]: RGB) => `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;

/** 0 to 255, the way a camera stores each number. */
export const byte = (v: number) => Math.round(clamp(v, 0, 1) * 255);
