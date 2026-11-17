"use client";

import { useMemo } from "react";
import { formatNumber } from "../engine/ranges";

/** Consecutive possible numbers merged into [start, length] runs, so the bar draws few shapes. */
function toRuns(possible: readonly number[]): [number, number][] {
  const runs: [number, number][] = [];
  for (const n of possible) {
    const last = runs[runs.length - 1];
    if (last && last[0] + last[1] === n) last[1] += 1;
    else runs.push([n, 1]);
  }
  return runs;
}

/**
 * What's still possible, drawn on the number line from 1 to max. Guesses
 * shrink the window; clues like "Is it even?" leave gaps inside it.
 */
export function PossibleBar({ max, possible }: { max: number; possible: readonly number[] }) {
  const runs = useMemo(() => toRuns(possible), [possible]);
  const low = possible[0] ?? 1;
  const high = possible[possible.length - 1] ?? max;
  // With only a few numbers left, give each a visible mark (1 of 1,000 is under a pixel wide).
  const minWidth = possible.length <= 5 ? max / 150 : 0;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="type-label tabular-nums text-fg-subtle">Possible numbers: {formatNumber(possible.length)}</span>
        <span className="type-label tabular-nums text-fg-subtle">
          {possible.length === 1 ? `Only ${formatNumber(low)}` : `${formatNumber(low)} to ${formatNumber(high)}`}
        </span>
      </div>
      <div className="h-4 overflow-hidden rounded-full bg-fg/10" aria-hidden>
        <svg viewBox={`0 0 ${max} 1`} preserveAspectRatio="none" className="block size-full">
          {runs.map(([start, length]) => {
            const width = Math.max(length, minWidth);
            return <rect key={start} x={start - 1 + (length - width) / 2} y={0} width={width} height={1} className="fill-game" />;
          })}
        </svg>
      </div>
      <div className="flex justify-between" aria-hidden>
        <span className="type-label tabular-nums text-fg-subtle">1</span>
        <span className="type-label tabular-nums text-fg-subtle">{formatNumber(max)}</span>
      </div>
    </div>
  );
}
