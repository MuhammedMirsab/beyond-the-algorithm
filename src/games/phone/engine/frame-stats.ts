import { clamp, type Guess } from "./math";

/**
 * What the phone can measure from one camera frame: how bright it is and how
 * sharp its edges are. The live camera and the simulated scene both go
 * through these functions, so the simulation shows the same maths.
 */

export interface FrameStats {
  /** Mean brightness, 0 (black) to 1 (white). */
  brightness: number;
  /** Edge strength, 0 (blurry or blank) to 1 (crisp detail). */
  sharpness: number;
}

/** Brightness of each pixel (Rec. 601 weights), 0 to 255. */
export function lumaFromRGBA(rgba: ArrayLike<number>, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  }
  return out;
}

/** Mean |Laplacian| that counts as fully sharp at 160 x 120. */
export const SHARPNESS_SCALE = 14;

export function frameStatsFromLuma(luma: Float32Array, width: number, height: number): FrameStats {
  let sum = 0;
  for (let i = 0; i < luma.length; i++) sum += luma[i];
  const brightness = luma.length ? sum / luma.length / 255 : 0;

  let edges = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = 4 * luma[i] - luma[i - 1] - luma[i + 1] - luma[i - width] - luma[i + width];
      edges += Math.abs(lap);
      count++;
    }
  }
  const sharpness = count ? clamp(edges / count / SHARPNESS_SCALE, 0, 1) : 0;
  return { brightness, sharpness };
}

export function frameStats(rgba: ArrayLike<number>, width: number, height: number): FrameStats {
  return frameStatsFromLuma(lumaFromRGBA(rgba, width, height), width, height);
}

/** Average brightness of each cell in a cols x rows grid, 0 to 1. The phone's-eye view. */
export function cellGrid(luma: Float32Array, width: number, height: number, cols: number, rows: number): Float32Array {
  const out = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const y0 = Math.floor((r * height) / rows);
    const y1 = Math.max(y0 + 1, Math.floor(((r + 1) * height) / rows));
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor((c * width) / cols);
      const x1 = Math.max(x0 + 1, Math.floor(((c + 1) * width) / cols));
      let sum = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) sum += luma[y * width + x];
      out[r * cols + c] = sum / ((y1 - y0) * (x1 - x0)) / 255;
    }
  }
  return out;
}

/** Below this edge score, small text can't be read. */
export const BLURRY_BELOW = 0.28;

/** The simulation's focus slider (0 blurry to 100 sharp) as a blur radius in pixels. */
export function blurFromFocus(focus: number): number {
  return Math.round((100 - clamp(focus, 0, 100)) / 20);
}

export function cameraGuess(stats: FrameStats): Guess {
  if (stats.brightness < 0.12) {
    return { label: "Too dark to recognise anything", because: "The picture is almost black, so there's no face or text to find." };
  }
  if (stats.brightness > 0.88) {
    return { label: "Too bright", because: "The picture is nearly white, so the details are washed out." };
  }
  if (stats.sharpness < BLURRY_BELOW) {
    return { label: "Too blurry to read text", because: "The edges are soft. A face might work, small text won't." };
  }
  return { label: "Clear enough to read", because: "Bright and sharp: good enough to recognise a face or read a sign." };
}

/* ── The simulated scene ──────────────────────────────────────────── */

export const SCENE_WIDTH = 120;
export const SCENE_HEIGHT = 160;

type RGB = readonly [number, number, number];

/**
 * A small made-up picture: a sign with lines of text above a face. Drawn
 * pixel by pixel so it needs no canvas and gives the same numbers every time.
 */
export function renderScene(width = SCENE_WIDTH, height = SCENE_HEIGHT): Uint8ClampedArray<ArrayBuffer> {
  const px = new Uint8ClampedArray(width * height * 4);
  const sx = width / SCENE_WIDTH;
  const sy = height / SCENE_HEIGHT;
  const set = (x: number, y: number, [r, g, b]: RGB) => {
    const p = (y * width + x) * 4;
    px[p] = r;
    px[p + 1] = g;
    px[p + 2] = b;
    px[p + 3] = 255;
  };
  const textRows = [24, 33, 42, 51];
  const words = [
    [16, 38, 44, 60, 66, 92],
    [16, 30, 36, 70, 76, 102],
    [16, 54, 60, 84],
    [16, 26, 32, 58, 64, 78, 84, 98],
  ];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / sx;
      const v = y / sy;
      // Wall: a soft vertical gradient.
      const t = v / SCENE_HEIGHT;
      let color: RGB = [Math.round(78 - 34 * t), Math.round(88 - 38 * t), Math.round(112 - 44 * t)];
      // Sign with text.
      if (u >= 10 && u < 110 && v >= 14 && v < 62) {
        color = [236, 233, 222];
        textRows.forEach((row, i) => {
          if (v >= row && v < row + 4) {
            const segs = words[i];
            for (let s = 0; s < segs.length; s += 2) if (u >= segs[s] && u < segs[s + 1]) color = [32, 36, 48];
          }
        });
      }
      // Shoulders.
      if (v >= 146) color = [44, 92, 150];
      // Face.
      const fx = (u - 60) / 25;
      const fy = (v - 112) / 31;
      if (fx * fx + fy * fy <= 1) {
        color = fy < -0.55 ? [58, 42, 34] : [204, 160, 126];
        const eye = (cx: number) => (u - cx) ** 2 + (v - 108) ** 2 <= 9;
        if (eye(51) || eye(69)) color = [28, 28, 30];
        if (u >= 52 && u < 68 && v >= 124 && v < 127) color = [122, 52, 54];
      }
      set(x, y, color);
    }
  }
  return px;
}

/**
 * The simulation's two controls: `light` 0 to 1 scales every pixel (0.5 is
 * the picture as drawn) and `blur` is a box-blur radius in pixels.
 */
export function applyLightAndFocus(src: Uint8ClampedArray, width: number, height: number, light: number, blur: number): Uint8ClampedArray<ArrayBuffer> {
  const gain = clamp(light, 0, 1) * 2;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    out[i] = src[i] * gain;
    out[i + 1] = src[i + 1] * gain;
    out[i + 2] = src[i + 2] * gain;
    out[i + 3] = 255;
  }
  const r = Math.round(clamp(blur, 0, 12));
  if (r === 0) return out;
  return boxBlur(boxBlur(out, width, height, r, true), width, height, r, false);
}

function boxBlur(src: Uint8ClampedArray, width: number, height: number, r: number, horizontal: boolean): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(src.length);
  const outer = horizontal ? height : width;
  const inner = horizontal ? width : height;
  for (let o = 0; o < outer; o++) {
    for (let i = 0; i < inner; i++) {
      let r0 = 0;
      let g0 = 0;
      let b0 = 0;
      let n = 0;
      for (let k = -r; k <= r; k++) {
        const j = i + k;
        if (j < 0 || j >= inner) continue;
        const p = horizontal ? (o * width + j) * 4 : (j * width + o) * 4;
        r0 += src[p];
        g0 += src[p + 1];
        b0 += src[p + 2];
        n++;
      }
      const q = horizontal ? (o * width + i) * 4 : (i * width + o) * 4;
      out[q] = r0 / n;
      out[q + 1] = g0 / n;
      out[q + 2] = b0 / n;
      out[q + 3] = 255;
    }
  }
  return out;
}
