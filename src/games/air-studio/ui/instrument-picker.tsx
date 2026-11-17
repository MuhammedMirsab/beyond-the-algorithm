"use client";

import { Check } from "lucide-react";
import { INSTRUMENTS } from "../engine/instruments/index";
import type { InstrumentId } from "../engine/settings";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/cn";
import { InstrumentGlyph } from "./instrument-glyph";

/**
 * Five instrument cards. While one loads its sounds, its card shows the
 * download and the others wait.
 */
export function InstrumentCards({
  current,
  loading,
  onPick,
  className,
}: {
  current: InstrumentId | null;
  loading: { id: InstrumentId; progress: number } | null;
  onPick: (id: InstrumentId) => void;
  className?: string;
}) {
  return (
    <ul className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5", className)}>
      {INSTRUMENTS.map((inst, i) => {
        const isCurrent = current === inst.id;
        const isLoading = loading?.id === inst.id;
        return (
          <li key={inst.id} className={cn(i === INSTRUMENTS.length - 1 && "col-span-2 sm:col-span-1")}>
            <button
              type="button"
              onClick={() => onPick(inst.id)}
              disabled={!!loading}
              aria-busy={isLoading || undefined}
              aria-current={isCurrent || undefined}
              className={cn(
                "group/card relative flex size-full flex-col gap-4 rounded-xl bg-surface p-3 text-left shadow-ring sm:p-4",
                "transition-[background-color,scale,opacity] duration-150 ease-out active:scale-[0.98]",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg",
                "disabled:pointer-events-none",
                loading && !isLoading && "opacity-45",
                "hover:bg-raised",
              )}
            >
              <span
                className={cn(
                  "grid aspect-[4/3] w-full place-items-center rounded-lg transition-colors duration-150 ease-out",
                  isCurrent || isLoading ? "bg-game text-game-ink" : "bg-sunken text-fg group-hover/card:bg-game-soft group-hover/card:text-game",
                )}
              >
                <InstrumentGlyph id={inst.id} strokeWidth={2.5} className="size-14 sm:size-16 xl:size-20" />
              </span>
              <span className="flex flex-col gap-1 px-1 pb-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="type-title-3 text-fg">{inst.name}</span>
                  {isCurrent && !isLoading ? <Check aria-label="Playing now" className="size-5 shrink-0 text-game" strokeWidth={2.5} /> : null}
                </span>
                {isLoading ? (
                  <span className="flex flex-col gap-2 pt-1">
                    <span className="type-small text-fg-muted">Loading its sounds</span>
                    <Progress value={loading.progress} label={`Loading ${inst.name.toLowerCase()} sounds`} tone="game" />
                  </span>
                ) : (
                  <span className="type-small text-fg-muted">{inst.blurb}</span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
