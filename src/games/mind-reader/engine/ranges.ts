/**
 * The three ranges both modes share. The original app had separate tables
 * (NUMBER_RANGES for "Find the number", PREDICTION_RANGES for the mind reader);
 * each mode still keeps its own table, keyed by these ids.
 */

export const RANGE_IDS = ["10", "100", "1000"] as const;
export type RangeId = (typeof RANGE_IDS)[number];

export const DEFAULT_RANGE: RangeId = "100";

export const RANGE_MAX: Record<RangeId, number> = { "10": 10, "100": 100, "1000": 1000 };

export function isRangeId(value: string): value is RangeId {
  return (RANGE_IDS as readonly string[]).includes(value);
}

/** 1000 reads "1,000": numbers on screen always group thousands. */
export function formatNumber(n: number): string {
  return n.toLocaleString("en");
}

/** "1 to 100". Plain words instead of a dash, per the copy rules. */
export function rangeLabel(range: RangeId): string {
  return `1 to ${formatNumber(RANGE_MAX[range])}`;
}

/** Questions that halving needs for `count` possibilities: ceil(log2(count)). */
export function halvingsFor(count: number): number {
  let steps = 0;
  let reach = 1;
  while (reach < count) {
    reach *= 2;
    steps += 1;
  }
  return steps;
}

/** "2 × 2 × 2 = 8": the doubling that explains why `steps` questions are enough. */
export function doublingSum(steps: number): string {
  return `${Array.from({ length: steps }, () => "2").join(" × ")} = ${formatNumber(2 ** steps)}`;
}
