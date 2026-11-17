import { Bot, Camera, Check, TimerOff, X, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import type { Difficulty, PlayerAnswer, Side } from "../engine/types";
import { cn } from "@/lib/cn";

export type Outcome = "found" | "fooled" | "timeout";

export function outcomeOf(answer: Pick<PlayerAnswer, "selectedOptionKey" | "isCorrect">): Outcome {
  if (answer.selectedOptionKey === null) return "timeout";
  return answer.isCorrect ? "found" : "fooled";
}

/** Right and wrong always come as a word, an icon and a colour together. */
export const OUTCOME: Record<Outcome, { title: string; short: string; icon: LucideIcon; tone: "success" | "danger" | "warning" }> = {
  found: { title: "You found it", short: "Found it", icon: Check, tone: "success" },
  fooled: { title: "It fooled you", short: "Fooled you", icon: X, tone: "danger" },
  timeout: { title: "Time's up", short: "Time's up", icon: TimerOff, tone: "warning" },
};

export const TONE_WELL: Record<"success" | "danger" | "warning", string> = {
  success: "bg-success/15 text-success",
  danger: "bg-danger/15 text-danger",
  warning: "bg-warning/15 text-warning",
};

export const LEVEL_NAME: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

/** What AI changed at each level, from the pairs themselves. */
export const LEVEL_CHANGE: Record<Difficulty, string> = {
  easy: "AI made its own, more polished version.",
  medium: "AI redrew the scene and changed a few things.",
  hard: "AI copied the photo almost exactly.",
};

export const LEVELS: Difficulty[] = ["easy", "medium", "hard"];

/** The big A or B on a photo. Decorative: the button's label carries the letter for screen readers. */
export function SideBadge({ side, size = "lg", className }: { side: Side; size?: "sm" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center bg-canvas text-fg shadow-ring",
        size === "lg" ? "type-title-2 size-11 rounded-md lg:type-title-1 lg:size-14" : "type-caption size-6 rounded-xs font-bold",
        className,
      )}
    >
      {side}
    </span>
  );
}

/** "AI-made" or "Real photo" on a photo once the round is over. */
export function TruthLabel({
  isReal,
  size = "lg",
  animate = true,
  className,
}: {
  isReal: boolean;
  size?: "sm" | "lg";
  animate?: boolean;
  className?: string;
}) {
  const Icon = isReal ? Camera : Bot;
  return (
    <motion.span
      initial={animate ? { opacity: 0, scale: 0.9 } : false}
      animate={{ opacity: 1, scale: 1 }}
      // The reveal is one of the rare moments that earns a little bounce.
      transition={{ type: "spring", duration: 0.35, bounce: isReal ? 0 : 0.25 }}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-semibold",
        size === "lg" ? "h-10 px-4 text-[0.9375rem] [&_svg]:size-[18px]" : "h-6 px-2 text-[0.75rem] [&_svg]:size-3.5",
        isReal ? "bg-canvas text-fg shadow-ring" : "bg-game text-game-ink",
        className,
      )}
    >
      <Icon aria-hidden strokeWidth={2.25} />
      {isReal ? (size === "lg" ? "Real photo" : "Real") : "AI-made"}
    </motion.span>
  );
}

/** Marks the photo the visitor picked, with a tick or a cross. */
export function PickLabel({ correct, size = "lg", className }: { correct: boolean; size?: "sm" | "lg"; className?: string }) {
  const Icon = correct ? Check : X;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-canvas font-semibold text-fg shadow-ring",
        size === "lg" ? "h-10 px-4 text-[0.9375rem] [&_svg]:size-[18px]" : "h-6 px-2 text-[0.75rem] [&_svg]:size-3.5",
        className,
      )}
    >
      <Icon aria-hidden strokeWidth={2.75} className={correct ? "text-success" : "text-danger"} />
      Your pick
    </span>
  );
}

/** A compact outcome for lists: icon, word, tone. */
export function OutcomeChip({ outcome, className }: { outcome: Outcome; className?: string }) {
  const meta = OUTCOME[outcome];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[0.8125rem] font-semibold [&_svg]:size-3.5",
        TONE_WELL[meta.tone],
        className,
      )}
    >
      <Icon aria-hidden strokeWidth={2.75} />
      {meta.short}
    </span>
  );
}

/** Seconds for people: "6.8s", "18s". */
export function formatSeconds(seconds: number): string {
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`;
}
