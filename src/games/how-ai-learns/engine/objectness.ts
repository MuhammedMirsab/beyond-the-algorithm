/**
 * "Is one of its things in the picture at all?" Decided from the picture and
 * the visitor's own examples, with no extra "nothing" photos.
 *
 * The visitor's photos share most of what is around the object: the room,
 * the table, the visitor's hand. The average of the groups' average examples
 * stands for that shared scene. What moves one group's photos away from it is
 * the object. A camera picture is scored by how far it moves from the shared
 * scene in the direction of one of the groups:
 *
 *   score = max over groups of  cos(picture - scene, group average - scene)
 *
 * A picture of the empty scene barely moves in any group's direction, so its
 * score sits near 0. A picture of a phone, even a different phone, moves
 * towards the phone group. Pure functions (no DOM, no TF.js), so it is tested.
 */

import { l2Normalize } from "./vectors";

/** The shared scene and each group's direction away from it. */
export interface ObjectAxes {
  scene: Float64Array;
  /** Unit directions, one per group, same order as the centroids. */
  directions: Float64Array[];
}

/** From the groups' average examples (normalised centroids). */
export function objectAxes(centroids: ArrayLike<number>[]): ObjectAxes {
  const dim = centroids[0]?.length ?? 0;
  const scene = new Float64Array(dim);
  for (const c of centroids) for (let d = 0; d < dim; d++) scene[d] += c[d] / centroids.length;
  const directions = centroids.map((c) => {
    const v = new Float64Array(dim);
    for (let d = 0; d < dim; d++) v[d] = c[d] - scene[d];
    return Float64Array.from(l2Normalize(v));
  });
  return { scene, directions };
}

/** How strongly a picture leans towards its closest group, -1 to 1. Near 0: nothing stands out. */
export function objectScore(axes: ObjectAxes, embedding: ArrayLike<number>): number {
  const dim = axes.scene.length;
  const offset = new Float64Array(dim);
  let lenSq = 0;
  for (let d = 0; d < dim; d++) {
    offset[d] = embedding[d] - axes.scene[d];
    lenSq += offset[d] * offset[d];
  }
  const len = Math.sqrt(lenSq);
  if (!len) return 0;
  let best = -1;
  for (const dir of axes.directions) {
    let dot = 0;
    for (let d = 0; d < dim; d++) dot += offset[d] * dir[d];
    best = Math.max(best, dot / len);
  }
  return best;
}

/**
 * Each training example's score against the groups with that example left
 * out of its own group's average: what a new photo of one of the things can
 * expect. Groups of one keep their only example.
 */
export function leaveOneOutObjectScores(byGroup: ArrayLike<number>[][]): number[] {
  const dim = byGroup.find((g) => g.length)?.[0]?.length ?? 0;
  if (!dim || byGroup.length < 2) return [];
  const sums = byGroup.map((vectors) => {
    const s = new Float64Array(dim);
    for (const v of vectors) for (let d = 0; d < dim; d++) s[d] += v[d];
    return s;
  });
  const centroids = sums.map((s) => l2Normalize(s));
  const scores: number[] = [];
  byGroup.forEach((vectors, g) => {
    if (vectors.length < 2) return;
    for (const v of vectors) {
      const rest = new Float64Array(dim);
      for (let d = 0; d < dim; d++) rest[d] = sums[g][d] - v[d];
      const loo = centroids.map((c, i) => (i === g ? l2Normalize(rest) : c));
      scores.push(objectScore(objectAxes(loo), v));
    }
  });
  return scores;
}

export const OBJECT_SHARE = 0.35;
export const OBJECT_MIN = 0.1;
export const OBJECT_MAX = 0.3;

/**
 * The score a camera picture needs before it names anything: a share of the
 * typical example's score, kept between 0.1 and 0.3. An empty scene scores
 * near 0; the examples usually score 0.5 or more.
 */
export function objectCutoffFrom(scores: readonly number[]): number {
  if (!scores.length) return OBJECT_MIN;
  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return Number(Math.max(OBJECT_MIN, Math.min(OBJECT_MAX, median * OBJECT_SHARE)).toFixed(3));
}
