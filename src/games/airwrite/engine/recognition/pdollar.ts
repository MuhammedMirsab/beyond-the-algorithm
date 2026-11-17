/**
 * $P point-cloud recognizer (Vatavu, Anthony & Wobbrock, ICMI 2012).
 *
 * A character is treated as a cloud of points, so stroke order, stroke
 * direction and the number of strokes don't matter - ideal for letters
 * written in the air, where everyone forms them differently.
 */

export type XY = [number, number];
export type StrokeXY = XY[];

export interface CloudPoint {
  x: number;
  y: number;
  id: number;
}

export const CLOUD_SIZE = 32;
/** Shapes thinner than this (relative to their length) are treated as lines. */
export const LINE_LIKE = 0.3;
/** 0 = ignore width/height ratio entirely, 1 = keep it exactly. */
export let ASPECT_KEEP = 0.15;
export function setAspectKeep(v: number) {
  ASPECT_KEEP = v;
}

function pathLength(pts: CloudPoint[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].id === pts[i - 1].id) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return d;
}

function resample(input: CloudPoint[], n: number): CloudPoint[] {
  const pts = input.map((p) => ({ ...p }));
  const interval = pathLength(pts) / (n - 1);
  if (!(interval > 0)) return Array.from({ length: n }, () => ({ ...pts[0] }));
  let acc = 0;
  const out: CloudPoint[] = [{ ...pts[0] }];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].id !== pts[i - 1].id) continue;
    const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc + d >= interval && d > 0) {
      const t = (interval - acc) / d;
      const q = {
        x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x),
        y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y),
        id: pts[i].id,
      };
      out.push(q);
      pts.splice(i, 0, q);
      acc = 0;
    } else {
      acc += d;
    }
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1] });
  return out.slice(0, n);
}

function scaleAndCenter(pts: CloudPoint[]): CloudPoint[] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const size = Math.max(w, h) || 1;
  // Letters are written narrow or wide; mostly normalise that away for 2-D
  // shapes (keep a little, ASPECT_KEEP), but leave line-like shapes (I, 1, -) alone.
  let sx = 1;
  let sy = 1;
  const ratio = Math.min(w, h) / size;
  if (ratio > LINE_LIKE) {
    const a = w / h;
    const target = Math.pow(a, ASPECT_KEEP);
    if (a < 1) sx = target / a;
    else sy = a / target;
  }
  const scale = Math.max(w * sx, h * sy) || 1;
  const scaled = pts.map((p) => ({ x: ((p.x - minX) * sx) / scale, y: ((p.y - minY) * sy) / scale, id: p.id }));
  void size;
  let cx = 0;
  let cy = 0;
  for (const p of scaled) {
    cx += p.x;
    cy += p.y;
  }
  cx /= scaled.length;
  cy /= scaled.length;
  return scaled.map((p) => ({ x: p.x - cx, y: p.y - cy, id: p.id }));
}

/** Strokes -> normalised point cloud. */
export function toCloud(strokes: StrokeXY[], n = CLOUD_SIZE): CloudPoint[] {
  const pts: CloudPoint[] = [];
  strokes.forEach((s, id) => s.forEach(([x, y]) => pts.push({ x, y, id })));
  if (!pts.length) return [];
  return scaleAndCenter(resample(pts, n));
}

function cloudDistance(a: CloudPoint[], b: CloudPoint[], start: number): number {
  const n = a.length;
  const matched = new Uint8Array(n);
  let sum = 0;
  let i = start;
  do {
    let min = Infinity;
    let index = -1;
    for (let j = 0; j < n; j++) {
      if (matched[j]) continue;
      const dx = a[i].x - b[j].x;
      const dy = a[i].y - b[j].y;
      const d = dx * dx + dy * dy;
      if (d < min) {
        min = d;
        index = j;
      }
    }
    matched[index] = 1;
    const weight = 1 - ((i - start + n) % n) / n;
    sum += weight * Math.sqrt(min);
    i = (i + 1) % n;
  } while (i !== start);
  return sum;
}

/** Lower is more similar. */
export function cloudMatch(a: CloudPoint[], b: CloudPoint[]): number {
  const n = a.length;
  const step = Math.floor(Math.pow(n, 0.5));
  let min = Infinity;
  for (let i = 0; i < n; i += step) {
    min = Math.min(min, cloudDistance(a, b, i), cloudDistance(b, a, i));
  }
  return min;
}

export interface Template {
  char: string;
  cloud: CloudPoint[];
  aspect: number;
}

export function aspectOf(strokes: StrokeXY[]): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of strokes)
    for (const [x, y] of s) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  return (maxX - minX + 1e-6) / (maxY - minY + 1e-6);
}
