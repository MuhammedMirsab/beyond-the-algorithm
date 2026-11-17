/** Ink rendering with perfect-freehand: velocity-aware, tapered, smooth strokes. */
import { getStroke } from "perfect-freehand";
import type { PenPoint, Stroke } from "./strokes";

export interface InkStyle {
  size: number;
  color: string;
}

/** Stroke width that reads well from a laptop seat and from across a room. */
export function inkSizeFor(width: number, height: number): number {
  return Math.min(22, Math.max(7, Math.min(width, height) * 0.016));
}

function outline(points: PenPoint[], w: number, h: number, size: number, complete: boolean) {
  return getStroke(
    points.map((p) => [p.x * w, p.y * h]),
    {
      size,
      thinning: 0.42,
      smoothing: 0.62,
      streamline: 0.42,
      simulatePressure: true,
      last: complete,
      start: { taper: false, cap: true },
      end: { taper: false, cap: true },
    },
  );
}

/** Closed, smoothed path through the outline points (quadratic midpoints). */
function toPath(pts: number[][]): Path2D {
  const path = new Path2D();
  const n = pts.length;
  if (n < 2) return path;
  path.moveTo((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
  for (let i = 1; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    path.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  path.closePath();
  return path;
}

export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  w: number,
  h: number,
  style: InkStyle,
  complete: boolean,
) {
  const pts = stroke.points;
  if (!pts.length) return;
  ctx.fillStyle = style.color;
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x * w, pts[0].y * h, style.size * 0.5, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.fill(toPath(outline(pts, w, h, style.size, complete)));
}

export function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  w: number,
  h: number,
  style: InkStyle,
) {
  for (const s of strokes) drawStroke(ctx, s, w, h, style, true);
}
