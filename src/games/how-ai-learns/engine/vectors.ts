/**
 * Small vector helpers for embeddings (copied from the original
 * visionEngine.ts, typed for Float32Array).
 */

/** Scale a vector to length 1. A zero vector stays zero. */
export function l2Normalize(vec: ArrayLike<number>): Float32Array {
  let sumSq = 0;
  for (let i = 0; i < vec.length; i++) sumSq += vec[i] * vec[i];
  const norm = Math.sqrt(sumSq) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

/** Cosine similarity of two vectors that are already L2-normalised: their dot product. */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) dot += a[i] * b[i];
  return dot;
}

/** Normalised mean of normalised vectors: the "average example" of a group. */
export function centroid(vectors: ArrayLike<number>[], dim: number): Float32Array {
  const mean = new Float64Array(dim);
  for (const v of vectors) for (let d = 0; d < dim; d++) mean[d] += v[d];
  return l2Normalize(mean);
}

/**
 * For each vector, its cosine similarity to the normalised mean of all the
 * others in the group. Groups of one have no "others" and give nothing.
 */
export function leaveOneOutSimilarities(vectors: ArrayLike<number>[], dim: number): number[] {
  if (vectors.length < 2) return [];
  const sum = new Float64Array(dim);
  for (const v of vectors) for (let d = 0; d < dim; d++) sum[d] += v[d];
  const rest = new Float64Array(dim);
  return vectors.map((v) => {
    for (let d = 0; d < dim; d++) rest[d] = sum[d] - v[d];
    return cosineSimilarity(v, l2Normalize(rest));
  });
}
