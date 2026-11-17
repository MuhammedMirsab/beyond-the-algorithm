/**
 * Seeded shuffles and the stratified train / validation / test split, copied
 * from the original visionEngine.ts and fixed:
 *
 * - The original threw when a category had fewer than 3 photos. Now a small
 *   category simply trains on everything it has.
 * - The original LCG used its low bits for the swap index (they cycle with a
 *   short period); this uses the high bits, same sequence of states.
 * - The original could overlap or drop items when its Math.max(1, ...) guards
 *   kicked in; counts here always add up to n.
 */

/** Deterministic Fisher-Yates shuffle driven by a 32-bit LCG. Returns a copy. */
export function shuffleWithSeed<T>(arr: readonly T[], seed = 42): T[] {
  const out = [...arr];
  let s = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 4294967296;
    const j = Math.floor((s / 4294967296) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface HoldOut {
  /** Share of each category held out for validation, 0 to 1. */
  val: number;
  /** Share of each category held out for testing, 0 to 1. */
  test: number;
}

/** The original split: 70% train, 15% validation, 15% test. */
export const DEFAULT_HOLD_OUT: HoldOut = { val: 0.15, test: 0.15 };

export interface SplitCounts {
  train: number;
  val: number;
  test: number;
}

/**
 * How many of a category's n items go to each split. Below 3 items nothing is
 * held out. Otherwise each requested split gets at least one item, and
 * training always keeps at least one.
 */
export function splitCounts(n: number, holdOut: HoldOut = DEFAULT_HOLD_OUT): SplitCounts {
  const total = Math.max(0, Math.floor(n));
  if (total < 3) return { train: total, val: 0, test: 0 };
  let test = holdOut.test > 0 ? Math.max(1, Math.round(total * holdOut.test)) : 0;
  let val = holdOut.val > 0 ? Math.max(1, Math.round(total * holdOut.val)) : 0;
  // Give back to training until it has at least one item.
  while (total - test - val < 1) {
    if (val > 0) val--;
    else if (test > 0) test--;
    else break;
  }
  return { train: total - test - val, val, test };
}

export interface StratifiedSplit<T> {
  train: T[];
  val: T[];
  test: T[];
}

/**
 * Split per category so every category is represented in each part.
 * Category order is sorted so the result does not depend on input order.
 */
export function stratifiedSplit<T>(
  items: readonly T[],
  categoryOf: (item: T) => string,
  holdOut: HoldOut = DEFAULT_HOLD_OUT,
): StratifiedSplit<T> {
  const byCategory = new Map<string, T[]>();
  for (const item of items) {
    const key = categoryOf(item);
    const list = byCategory.get(key) ?? [];
    list.push(item);
    byCategory.set(key, list);
  }

  const out: StratifiedSplit<T> = { train: [], val: [], test: [] };
  const keys = [...byCategory.keys()].sort();
  keys.forEach((key, index) => {
    const list = byCategory.get(key) ?? [];
    const shuffled = shuffleWithSeed(list, 101 + index * 17);
    const counts = splitCounts(shuffled.length, holdOut);
    out.train.push(...shuffled.slice(0, counts.train));
    out.val.push(...shuffled.slice(counts.train, counts.train + counts.val));
    out.test.push(...shuffled.slice(counts.train + counts.val));
  });
  return out;
}

/** Drop repeats of the same item (same key), keeping the first. */
export function dedupe<T>(items: readonly T[], keyOf: (item: T) => string): { items: T[]; removed: number } {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return { items: out, removed: items.length - out.length };
}
