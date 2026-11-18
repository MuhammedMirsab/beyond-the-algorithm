/**
 * A flat map of the 1,280 numbers: principal component analysis (PCA) of the
 * visitor's own example embeddings, by power iteration. The two directions
 * along which their photos differ most become the map's two axes; every
 * photo, and later every camera frame, is placed by projecting its numbers
 * onto them.
 *
 * Only a picture: the model never uses this map. It decides with all 1,280
 * numbers. Pure functions (no DOM, no TF.js), so it is tested.
 */

export interface Projection {
  /** Average example: the map's centre. */
  mean: Float64Array;
  /** Two unit directions, the first explaining the most variation. */
  axes: [Float64Array, Float64Array];
  /** Share of all variation each axis shows, 0 to 1. */
  explained: [number, number];
}

export interface Point2 {
  x: number;
  y: number;
}

const ITERATIONS = 60;

function dotF(a: ArrayLike<number>, b: ArrayLike<number>) {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}

function normalise(v: Float64Array): number {
  const norm = Math.sqrt(dotF(v, v));
  if (norm < 1e-12) return 0;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return norm;
}

/**
 * Two main directions of the vectors. Deterministic: the start vector is
 * fixed, so the same examples always give the same map. Null with fewer than
 * 2 vectors or when they are all the same.
 */
export function fitProjection(vectors: readonly ArrayLike<number>[]): Projection | null {
  const n = vectors.length;
  if (n < 2) return null;
  const dim = vectors[0].length;
  const mean = new Float64Array(dim);
  for (const v of vectors) for (let d = 0; d < dim; d++) mean[d] += v[d];
  for (let d = 0; d < dim; d++) mean[d] /= n;
  const centred = vectors.map((v) => {
    const c = new Float64Array(dim);
    for (let d = 0; d < dim; d++) c[d] = v[d] - mean[d];
    return c;
  });
  let total = 0;
  for (const c of centred) total += dotF(c, c);
  if (total < 1e-12) return null;

  const axes: Float64Array[] = [];
  const explained: number[] = [];
  for (let k = 0; k < 2; k++) {
    // Start somewhere fixed but not special, so the result is repeatable.
    const v = new Float64Array(dim);
    for (let d = 0; d < dim; d++) v[d] = Math.sin(d * 12.9898 + k * 78.233) + 0.5;
    for (const axis of axes) {
      const along = dotF(v, axis);
      for (let d = 0; d < dim; d++) v[d] -= along * axis[d];
    }
    normalise(v);
    let eigen = 0;
    for (let it = 0; it < ITERATIONS; it++) {
      // v <- C v, with C = X^T X / n, without building the 1,280 x 1,280 matrix.
      const next = new Float64Array(dim);
      for (const c of centred) {
        const along = dotF(c, v);
        for (let d = 0; d < dim; d++) next[d] += along * c[d];
      }
      // Keep it apart from the first axis.
      for (const axis of axes) {
        const along = dotF(next, axis);
        for (let d = 0; d < dim; d++) next[d] -= along * axis[d];
      }
      eigen = normalise(next);
      if (eigen === 0) break;
      v.set(next);
    }
    if (eigen === 0) {
      // Everything lies on one line: any direction at right angles will do.
      v.fill(0);
      v[k % dim] = 1;
      for (const axis of axes) {
        const along = dotF(v, axis);
        for (let d = 0; d < dim; d++) v[d] -= along * axis[d];
      }
      normalise(v);
    }
    axes.push(v);
    let variance = 0;
    for (const c of centred) variance += dotF(c, v) ** 2;
    explained.push(variance / total);
  }
  return { mean, axes: [axes[0], axes[1]], explained: [explained[0], explained[1]] };
}

/** Where one vector lands on the map, in the map's own units. */
export function project(projection: Projection, vector: ArrayLike<number>): Point2 {
  const { mean, axes } = projection;
  let x = 0;
  let y = 0;
  for (let d = 0; d < mean.length; d++) {
    const c = (vector[d] ?? 0) - mean[d];
    x += c * axes[0][d];
    y += c * axes[1][d];
  }
  return { x, y };
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export function boundsOf(points: readonly Point2[]): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  // Never a zero-size box.
  if (maxX - minX < 1e-6) {
    minX -= 0.5;
    maxX += 0.5;
  }
  if (maxY - minY < 1e-6) {
    minY -= 0.5;
    maxY += 0.5;
  }
  return { minX, maxX, minY, maxY };
}

/** Map units to 0..1 inside the bounds, with a margin; points outside are held at the edge. */
export function toUnit(point: Point2, bounds: Bounds, margin = 0.1): Point2 {
  const fx = (point.x - bounds.minX) / (bounds.maxX - bounds.minX);
  const fy = (point.y - bounds.minY) / (bounds.maxY - bounds.minY);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { x: margin + (1 - 2 * margin) * clamp(fx), y: margin + (1 - 2 * margin) * clamp(fy) };
}

/** One example photo on the map, at 0..1 in both directions. */
export interface MapPoint {
  id: string;
  label: string;
  x: number;
  y: number;
}

/** The visitor's examples on a flat map, and what is needed to place new photos on it. */
export interface TrainMap {
  projection: Projection;
  bounds: Bounds;
  points: MapPoint[];
}

/** A map of the examples, or null when there are fewer than 2 different ones. */
export function buildMap(items: readonly { id: string; label: string; embedding: ArrayLike<number> }[]): TrainMap | null {
  const projection = fitProjection(items.map((item) => item.embedding));
  if (!projection) return null;
  const raw = items.map((item) => project(projection, item.embedding));
  const bounds = boundsOf(raw);
  return { projection, bounds, points: items.map((item, i) => ({ id: item.id, label: item.label, ...toUnit(raw[i], bounds) })) };
}

/** Where a new photo (or camera frame) lands on an existing map, 0..1. */
export function placeOnMap(map: TrainMap, embedding: ArrayLike<number>): Point2 {
  return toUnit(project(map.projection, embedding), map.bounds);
}
