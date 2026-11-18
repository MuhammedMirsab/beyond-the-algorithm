"use client";

import { Check, Equal, X } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { RoundOutcome, RoundRecord } from "../engine/types";
import { GESTURE_LABEL, HandGlyph } from "./gesture-icon";

const OUTCOME: Record<RoundOutcome, { icon: ReactNode; className: string; bar: string; text: string }> = {
  player_win: { icon: <Check strokeWidth={3} />, className: "text-success", bar: "bg-success", text: "You won" },
  ai_win: { icon: <X strokeWidth={3} />, className: "text-danger", bar: "bg-danger", text: "The AI won" },
  draw: { icon: <Equal strokeWidth={3} />, className: "text-fg-subtle", bar: "bg-fg/30", text: "Draw" },
};

/**
 * This match so far, newest on the right: your throw over the AI's, who won,
 * and a dot where its locked guess matched your throw (the same dot as "Guessed
 * right" on the AI's panel). When there's no room, the tape scrolls so the
 * newest round stays in view.
 */
export function RoundStrip({ rounds, max = 14, className }: { rounds: readonly RoundRecord[]; max?: number; className?: string }) {
  const shown = rounds.slice(-max);
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTo({ left: list.scrollWidth });
  }, [shown.length]);
  return (
    <section aria-label="This match" className={cn("flex min-w-0 items-stretch gap-2.5", className)}>
      <div aria-hidden className="type-label flex flex-col justify-around py-1 text-fg-subtle">
        <span>You</span>
        <span className="text-game">AI</span>
      </div>
      {shown.length === 0 ? (
        <p className="type-small flex min-h-[4.25rem] items-center text-fg-subtle">Your rounds show up here.</p>
      ) : (
        <ol ref={listRef} aria-label="Rounds this match" className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {shown.map((round) => {
            const outcome = OUTCOME[round.outcome];
            return (
              <motion.li
                key={round.id}
                layout="position"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1], delay: 0.5 }}
                className="relative flex w-10 shrink-0 flex-col items-center gap-0.5 overflow-hidden rounded-md bg-surface px-1 pb-2 pt-1.5 shadow-ring"
              >
                <HandGlyph gesture={round.playerMove} ink="var(--color-surface)" className="size-[1.375rem] text-fg" />
                <HandGlyph gesture={round.aiCounterMove} ink="var(--color-surface)" flip className="size-[1.375rem] text-game" />
                <span aria-hidden className={cn("grid size-4 place-items-center [&_svg]:size-3.5", outcome.className)}>
                  {outcome.icon}
                </span>
                <span aria-hidden className={cn("absolute inset-x-0 bottom-0 h-[3px]", outcome.bar)} />
                {round.wasPredictionCorrect ? (
                  <span aria-hidden className="absolute right-1 top-1 size-1.5 rounded-full bg-game" />
                ) : null}
                <span className="sr-only">
                  Round {round.roundNumber}: you threw {GESTURE_LABEL[round.playerMove]}, the AI threw{" "}
                  {GESTURE_LABEL[round.aiCounterMove]}. {outcome.text}.{" "}
                  {round.wasPredictionCorrect ? "It guessed your throw." : "It guessed wrong."}
                </span>
              </motion.li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
