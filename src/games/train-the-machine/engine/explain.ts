/**
 * Numbers for "How it works", computed the way the classifier computes them
 * (classifier.ts, train()): every example is centred on the average of all
 * examples and scaled to length 1, each move's pattern is the average of its
 * centred examples (scaled to length 1), and "how alike" is the dot product
 * of two such vectors (cosine similarity), shown from 0 to 100%.
 */

const dot = (a: readonly number[], b: readonly number[]) => {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
};

function unit(values: readonly number[]): number[] {
  const norm = Math.sqrt(dot(values, values));
  return norm > 1e-9 ? values.map((v) => v / norm) : values.map(() => 0);
}

function average(vectors: readonly (readonly number[])[], length: number): number[] {
  const sum = new Array<number>(length).fill(0);
  for (const v of vectors) for (let i = 0; i < length; i++) sum[i] += v[i] ?? 0;
  return sum.map((v) => v / Math.max(1, vectors.length));
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export interface MoveSpread {
  /** How alike each example is to its own move's pattern, 0 to 1, in the order given. */
  toPattern: number[];
  /** The average of toPattern. */
  mean: number;
  /** The least alike example, 0 to 1. */
  min: number;
}

/**
 * For each move: how alike each of its examples is to the move's pattern.
 * All close to 100% means the examples were nearly the same, so the model
 * knows one narrow version of the move; lower and spread out means variety.
 */
export function spreadByMove(byMove: Readonly<Record<string, readonly (readonly number[])[]>>): Record<string, MoveSpread> {
  const ids = Object.keys(byMove).filter((id) => byMove[id].length > 0);
  const all = ids.flatMap((id) => byMove[id]);
  const out: Record<string, MoveSpread> = {};
  if (all.length === 0) return out;
  const length = all[0].length;
  const mean = average(all, length);
  const centred = (v: readonly number[]) => v.map((x, i) => x - (mean[i] ?? 0));

  for (const id of ids) {
    const c = byMove[id].map(centred);
    const pattern = unit(average(c, length));
    const toPattern = c.map(unit).map((u) => clamp01(dot(u, pattern)));
    out[id] = {
      toPattern,
      mean: toPattern.reduce((a, b) => a + b, 0) / toPattern.length,
      min: Math.min(...toPattern),
    };
  }
  return out;
}

/** The 44 numbers, in the groups extractFeatureVector() writes them, in order. */
export const FEATURE_GROUPS: readonly { id: string; label: string; count: number }[] = [
  { id: "points", label: "Where 13 points are", count: 26 },
  { id: "legs", label: "Legs", count: 4 },
  { id: "arms", label: "Arms", count: 3 },
  { id: "hand", label: "Hand", count: 5 },
  { id: "motion", label: "Movement", count: 6 },
];
