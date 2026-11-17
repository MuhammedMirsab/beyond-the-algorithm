/**
 * Formats seconds as m:ss.t.
 *
 * Rounds to tenths first and only then splits minutes and seconds. The
 * original split first and rounded the seconds afterwards, so 59.95 to
 * 59.99 s printed as "0:60.0".
 */
export function formatTime(sec: number): string {
  const tenths = Math.round(Math.max(0, Number.isFinite(sec) ? sec : 0) * 10);
  const m = Math.floor(tenths / 600);
  const rest = tenths - m * 600;
  const s = Math.floor(rest / 10);
  return `${m}:${String(s).padStart(2, "0")}.${rest % 10}`;
}

export const formatScore = (n: number) => Math.round(n).toLocaleString("en-US");

/** Whole degrees for readouts, e.g. 14.6 → "15°". */
export const formatDegrees = (deg: number) => `${Math.round(Math.abs(deg))}°`;

/** A mouth ratio (inner-lip gap / eye distance) to two decimals, e.g. "0.42". */
export const formatRatio = (r: number) => (Math.round(r * 100) / 100).toFixed(2);

/** Megabytes with one decimal, for download readouts. */
export const formatMB = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;
