/**
 * Renders the strokes into a tightly cropped picture (ink on transparent),
 * shown next to the result. It also records how surface pixels map onto the
 * picture, so the letters the recogniser found can be boxed on top of it.
 */
import { drawStrokes, inkSizeFor } from "./render";
import type { Stroke } from "./strokes";

export interface InkImage {
  /** PNG data URL. */
  dataUrl: string;
  /** Picture size in pixels. */
  width: number;
  height: number;
  /** Surface pixel (x, y) lands at ((x - originX) * scale, (y - originY) * scale) in the picture. */
  originX: number;
  originY: number;
  scale: number;
  /** Ink width on the surface, in surface pixels. */
  inkSize: number;
}

const MAX_SIDE = 1024;

export function exportInk(strokes: Stroke[], surface: { width: number; height: number }, color: string): InkImage | null {
  const pts = strokes.flatMap((s) => s.points);
  if (!pts.length) return null;
  const { width: W, height: H } = surface;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x * W);
    maxX = Math.max(maxX, p.x * W);
    minY = Math.min(minY, p.y * H);
    maxY = Math.max(maxY, p.y * H);
  }
  const ink = inkSizeFor(W, H);
  const pad = Math.max(ink * 2, Math.max(maxX - minX, maxY - minY) * 0.08);
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  // A tiny mark (a dot) still gets a sensible frame, with the ink centred in it.
  const bw = Math.max(maxX - minX, ink * 6);
  const bh = Math.max(maxY - minY, ink * 6);
  minX -= (bw - (maxX - minX)) / 2;
  minY -= (bh - (maxY - minY)) / 2;
  const scale = Math.min(MAX_SIDE / Math.max(bw, bh), 2);
  const cw = Math.max(1, Math.round(bw * scale));
  const ch = Math.max(1, Math.round(bh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // Map surface pixels to the cropped, scaled picture.
  ctx.setTransform(scale, 0, 0, scale, -minX * scale, -minY * scale);
  drawStrokes(ctx, strokes, W, H, { size: ink, color });

  return { dataUrl: canvas.toDataURL("image/png"), width: cw, height: ch, originX: minX, originY: minY, scale, inkSize: ink };
}
