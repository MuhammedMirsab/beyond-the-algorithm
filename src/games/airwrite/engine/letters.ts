/**
 * Turns the recogniser's own working into things a visitor can see: the
 * letters it split the ink into (boxes on the picture) and, for one letter,
 * the 32-point cloud it compared with the closest shape in its library.
 * Uses the same segment() and toCloud() the recogniser runs, so it shows
 * exactly what happened.
 */
import { CLOUD_SIZE, cloudMatch, toCloud, type CloudPoint, type StrokeXY } from "./recognition/pdollar";
import { segment } from "./recognition/recognize";
import { TEMPLATES } from "./recognition/templates";

export { CLOUD_SIZE };

/** One letter the recogniser found, as percentages of the picture. */
export interface LetterBox {
  /** The character it was read as, when the reading lines up letter for letter. */
  char: string | null;
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Segmentation {
  boxes: LetterBox[];
  words: number;
}

/** How surface pixels map onto the exported picture (see exportInk). */
export interface PictureFrame {
  width: number;
  height: number;
  originX: number;
  originY: number;
  scale: number;
  inkSize: number;
}

const clamp = (v: number) => Math.min(100, Math.max(0, v));

/** Characters of a reading, one per letter group (words are joined by single spaces). */
const charsOf = (text: string) => [...text.replace(/\s+/g, "")];

/**
 * `strokes` are in surface pixels, as passed to recognizeStrokes(). `text` is
 * the reading; pass null to draw the boxes without letters.
 */
export function segmentLetters(strokes: StrokeXY[], text: string | null, frame: PictureFrame): Segmentation {
  const words = segment(strokes.filter((s) => s.length > 0));
  const groups = words.flat();
  const chars = text ? charsOf(text) : [];
  const labelled = chars.length === groups.length;
  // The box surrounds the drawn ink, not just the centre line of the strokes.
  const pad = frame.inkSize * 0.8;
  const boxes = groups.map((g, i): LetterBox => {
    const x0 = (g.minX - pad - frame.originX) * frame.scale;
    const y0 = (g.minY - pad - frame.originY) * frame.scale;
    const x1 = (g.maxX + pad - frame.originX) * frame.scale;
    const y1 = (g.maxY + pad - frame.originY) * frame.scale;
    const left = clamp((x0 / frame.width) * 100);
    const top = clamp((y0 / frame.height) * 100);
    return {
      char: labelled ? chars[i] : null,
      left,
      top,
      width: clamp((x1 / frame.width) * 100) - left,
      height: clamp((y1 / frame.height) * 100) - top,
    };
  });
  return { boxes, words: words.length };
}

export interface LetterClouds {
  char: string;
  /** The visitor's first letter as the recogniser saw it. */
  yours: CloudPoint[];
  /** The closest library shape for the letter it was read as. */
  library: CloudPoint[];
}

function templatesFor(char: string) {
  return TEMPLATES[char] ?? TEMPLATES[char.toUpperCase()] ?? TEMPLATES[char.toLowerCase()] ?? null;
}

/** The first letter's point cloud next to the library shape it was matched with. */
export function firstLetterClouds(strokes: StrokeXY[], text: string): LetterClouds | null {
  const groups = segment(strokes.filter((s) => s.length > 0)).flat();
  const chars = charsOf(text);
  if (!groups.length || chars.length !== groups.length) return null;
  const variants = templatesFor(chars[0]);
  if (!variants) return null;
  const yours = toCloud(groups[0].strokes);
  let library: CloudPoint[] = [];
  let best = Infinity;
  for (const variant of variants) {
    const cloud = toCloud(variant);
    const d = cloudMatch(yours, cloud);
    if (d < best) {
      best = d;
      library = cloud;
    }
  }
  return library.length ? { char: chars[0], yours, library } : null;
}

/** A stand-in before the visitor has written anything: two library drawings of the same letter. */
export function sampleClouds(): LetterClouds {
  const [first, second] = TEMPLATES.A;
  return { char: "A", yours: toCloud(second ?? first), library: toCloud(first) };
}
