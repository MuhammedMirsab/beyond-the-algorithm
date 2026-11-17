export interface Vec2 {
  x: number;
  y: number;
}

export const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Signed polygon area (shoelace). Sign depends on winding. */
export function signedArea(poly: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/**
 * Convex hull (Andrew's monotone chain). For our four fingertips this always
 * yields a simple, non-self-intersecting polygon — so crossing hands never
 * produce the "bow-tie" artefact a fixed corner order would.
 */
export function convexHull(points: readonly Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export function centroid(poly: readonly Vec2[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  const n = Math.max(1, poly.length);
  return { x: x / n, y: y / n };
}

export function bounds(poly: readonly Vec2[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Inward-facing edge lines (nx, ny, c) so that `nx*x + ny*y + c` is the signed
 * distance to each edge, positive inside. Always fills 4 slots (a triangle
 * repeats its first edge) so the shader can stay branch-free.
 */
export function edgeLines(poly: readonly Vec2[], scale: number, out: Float32Array): Float32Array {
  out.fill(0);
  if (poly.length < 3) return out;
  const c = centroid(poly);
  for (let i = 0; i < 4; i++) {
    const a = poly[i % poly.length];
    const b = poly[(i + 1) % poly.length];
    let nx = -(b.y - a.y);
    let ny = b.x - a.x;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    if (nx * (c.x - a.x) + ny * (c.y - a.y) < 0) {
      nx = -nx;
      ny = -ny;
    }
    out[i * 3] = nx;
    out[i * 3 + 1] = ny;
    out[i * 3 + 2] = -(nx * a.x + ny * a.y) * scale;
  }
  return out;
}
