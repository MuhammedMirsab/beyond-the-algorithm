/**
 * Minimal isometric geometry for illustrations drawn in code.
 * True 30 degree isometric: x runs down-right, y runs down-left, z runs up.
 * Shapes are extruded convex outlines; the visible sides are the convex hull
 * of the top and bottom outlines (exact for convex shapes, cheap to draw).
 */

export type P2 = [number, number];

const COS30 = Math.cos(Math.PI / 6);

export interface Projector {
  (x: number, y: number, z: number): P2;
}

export function projector(k: number, ox: number, oy: number): Projector {
  return (x, y, z) => [ox + (x - y) * COS30 * k, oy + (x + y) * 0.5 * k - z * k];
}

/** Points around a rounded rectangle in the ground plane, clockwise. */
export function roundedRect(x: number, y: number, w: number, h: number, r: number, steps = 6): P2[] {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const corners: [number, number, number][] = [
    [x + w - rr, y + rr, -Math.PI / 2],
    [x + w - rr, y + h - rr, 0],
    [x + rr, y + h - rr, Math.PI / 2],
    [x + rr, y + rr, Math.PI],
  ];
  const pts: P2[] = [];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= steps; i++) {
      const a = start + (i / steps) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
  }
  return pts;
}

export function circle(cx: number, cy: number, r: number, steps = 28): P2[] {
  const pts: P2[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

function cross(o: P2, a: P2, b: P2) {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** Andrew's monotone chain. */
export function hull(points: P2[]): P2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const lower: P2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: P2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

export function pathOf(points: P2[]): string {
  return points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join("") + "Z";
}

/** An extruded outline: `side` is everything visible below the lid, `top` is the lid. */
export function slab(plan: P2[], z: number, height: number, project: Projector) {
  const top = plan.map(([x, y]) => project(x, y, z + height));
  const bottom = plan.map(([x, y]) => project(x, y, z));
  return { side: pathOf(hull([...top, ...bottom])), top: pathOf(top) };
}

/** Sort key: things further back (smaller x + y) and lower (smaller z) draw first. */
export function depth(x: number, y: number, z: number) {
  return x + y + z * 0.01;
}
