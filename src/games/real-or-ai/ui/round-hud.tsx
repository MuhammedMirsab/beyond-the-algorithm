import { Clock3 } from "lucide-react";
import { StepDots } from "@/components/ui/progress";
import { Chip } from "@/components/ui/chip";
import { LOW_TIME_SECONDS, type TimerState } from "../engine/timer";
import type { Difficulty } from "../engine/types";
import { LEVEL_NAME } from "./labels";
import { cn } from "@/lib/cn";

export type ClockMode = "waiting" | "running" | "stopped";

/**
 * Seconds left, as a number and a bar. The bar is set from real elapsed time
 * on every 200 ms tick and slides linearly between ticks, so it never drifts.
 * role="timer" is not live, so screen readers aren't spammed every second.
 */
export function TimerReadout({ timer, mode, className }: { timer: TimerState; mode: ClockMode; className?: string }) {
  const low = mode === "running" && timer.secondsLeft <= LOW_TIME_SECONDS;
  return (
    <span className={cn("flex items-center gap-1.5", low ? "text-warning" : "text-fg-muted", className)}>
      <Clock3 aria-hidden className="size-5" />
      <span role="timer" aria-label={`${timer.secondsLeft} seconds left`} className="type-title-3 tabular-nums text-current">
        {timer.secondsLeft}s
      </span>
    </span>
  );
}

export function TimerBar({ timer, mode, className }: { timer: TimerState; mode: ClockMode; className?: string }) {
  const low = mode === "running" && timer.secondsLeft <= LOW_TIME_SECONDS;
  return (
    <div aria-hidden className={cn("h-1.5 w-full overflow-hidden rounded-full bg-fg/10", className)}>
      <div
        className={cn(
          "h-full origin-left rounded-full transition-[transform,background-color] duration-200 ease-linear motion-reduce:transition-none",
          low ? "bg-warning" : "bg-game",
        )}
        style={{ transform: `scaleX(${timer.fraction})` }}
      />
    </div>
  );
}

export function RoundHud({
  index,
  total,
  difficulty,
  timer,
  mode,
}: {
  index: number;
  total: number;
  difficulty: Difficulty;
  timer: TimerState;
  mode: ClockMode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-9 min-w-0 items-center gap-3">
        <span className="type-label shrink-0 tabular-nums text-fg-subtle">
          Round {index + 1} of {total}
        </span>
        <StepDots total={total} current={index} label="Round" />
        <Chip className="hidden sm:inline-flex">{LEVEL_NAME[difficulty]}</Chip>
        <TimerReadout timer={timer} mode={mode} className="ml-auto" />
      </div>
      <TimerBar timer={timer} mode={mode} />
    </div>
  );
}
