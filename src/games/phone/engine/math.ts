/** Small numeric helpers shared by every sensor engine. Pure, no DOM. */

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Population standard deviation. */
export function stdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let sum = 0;
  for (const v of values) sum += (v - m) * (v - m);
  return Math.sqrt(sum / values.length);
}

/** What an app concludes from a reading, and the evidence it used. */
export interface Guess {
  label: string;
  because: string;
}

/** Push onto a fixed-length history, dropping the oldest values. */
export function pushLimited<T>(list: readonly T[], item: T, max: number): T[] {
  const next = list.length >= max ? list.slice(list.length - max + 1) : list.slice();
  next.push(item);
  return next;
}

/** "7:30 AM" from minutes after midnight. */
export function clockLabel(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Signed whole number with a real minus sign, e.g. "−12" or "8". */
export function signed(value: number): string {
  const n = Math.round(value);
  return n < 0 ? `−${Math.abs(n)}` : String(n);
}
