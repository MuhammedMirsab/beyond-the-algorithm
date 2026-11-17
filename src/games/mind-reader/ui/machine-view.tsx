"use client";

import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { formatNumber, rangeLabel, type RangeId, RANGE_MAX } from "../engine/ranges";

type Layout = "big" | "numbers" | "dots";

const LAYOUT: Record<Layout, { cols: number; grid: string }> = {
  // 1 to 10: two rows of five big tiles.
  big: { cols: 5, grid: "gap-2 sm:gap-3" },
  // 1 to 100: ten by ten, numbered.
  numbers: { cols: 10, grid: "gap-1" },
  // 1 to 1,000: forty by twenty-five dots, no numbers.
  dots: { cols: 40, grid: "gap-[2px] sm:gap-[3px]" },
};

/**
 * What the machine "knows": every number in the range, bright while it could
 * still be yours and dimmed once an answer rules it out. This list is the
 * whole trick, so it stays on screen beside every question.
 */
export function MachineView({
  range,
  candidates,
  className,
}: {
  range: RangeId;
  /** Numbers still possible, ascending. */
  candidates: readonly number[];
  className?: string;
}) {
  const max = RANGE_MAX[range];
  const layout: Layout = max <= 10 ? "big" : max <= 100 ? "numbers" : "dots";
  const { cols, grid } = LAYOUT[layout];
  const last = candidates.length === 1 ? candidates[0] : null;

  const possible = useMemo(() => {
    const set = new Uint8Array(max + 1);
    for (const n of candidates) set[n] = 1;
    return set;
  }, [max, candidates]);

  const cells = useMemo(() => Array.from({ length: max }, (_, i) => i + 1), [max]);

  return (
    <figure className={cn("flex w-full min-w-0 flex-col gap-4 rounded-xl bg-surface p-3 shadow-ring sm:p-5", className)}>
      <div
        aria-hidden
        className={cn("mx-auto grid w-full", grid, layout === "big" ? "max-w-[26rem]" : "max-w-[30rem]")}
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {cells.map((n) => {
          const on = possible[n] === 1;
          const only = n === last;
          return (
            <span
              key={n}
              className={cn(
                "grid aspect-square place-items-center tabular-nums transition-[opacity,background-color,color] duration-200 ease-out",
                layout === "big" && "type-title-2 rounded-md",
                layout === "numbers" && "type-label rounded-xs",
                layout === "dots" && "rounded-full",
                only
                  ? layout === "dots"
                    ? "bg-fg"
                    : "bg-game text-game-ink"
                  : on
                    ? layout === "dots"
                      ? "bg-game"
                      : "bg-game-soft text-fg"
                    : layout === "dots"
                      ? "bg-fg/10"
                      : "bg-fg/[0.04] text-fg-faint opacity-60",
              )}
            >
              {layout === "dots" ? null : n}
            </span>
          );
        })}
      </div>
      <figcaption className="mx-auto flex w-full max-w-[30rem] flex-col gap-1.5">
        <span className="type-label tabular-nums text-fg-subtle">Possible numbers: {formatNumber(candidates.length)}</span>
        <span className="type-small text-fg-subtle">
          {layout === "dots"
            ? `Each dot is one number from ${rangeLabel(range)}. Bright dots could still be yours.`
            : "Bright numbers could still be yours. Each answer dims the ones that can't be."}
        </span>
      </figcaption>
    </figure>
  );
}
