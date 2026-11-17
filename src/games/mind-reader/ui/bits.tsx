import { ArrowDown, ArrowUp, Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { Chip } from "@/components/ui/chip";
import { Kbd } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import type { GuessResult } from "../engine/human";
import { formatNumber } from "../engine/ranges";

/** "Yes" or "No" with a tick or a cross, so the answer never rests on colour. */
export function AnswerChip({ yes, className }: { yes: boolean; className?: string }) {
  return (
    <Chip icon={yes ? <Check /> : <X />} className={cn("text-fg", className)}>
      {yes ? "Yes" : "No"}
    </Chip>
  );
}

/** A key hint inside a button, shown on laptop-sized screens only. */
export function ButtonKey({ children, onGame = false }: { children: ReactNode; onGame?: boolean }) {
  return (
    <Kbd aria-hidden className={cn("ml-1 hidden lg:inline-grid", onGame && "bg-game-ink/15 text-game-ink shadow-none")}>
      {children}
    </Kbd>
  );
}

const RESULT_COPY: Record<GuessResult, { icon: ReactNode; word: string }> = {
  higher: { icon: <ArrowUp aria-hidden />, word: "higher" },
  lower: { icon: <ArrowDown aria-hidden />, word: "lower" },
  correct: { icon: <Check aria-hidden />, word: "correct" },
};

/** A row of guesses: 50↑ 25↓ 37✓. Arrows say which way the number was. */
export function GuessTrail({ guesses, className }: { guesses: { value: number; result: GuessResult }[]; className?: string }) {
  return (
    <ol className={cn("flex flex-wrap gap-2", className)}>
      {guesses.map((g, i) => (
        <li
          key={`${g.value}-${i}`}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 font-semibold tabular-nums [&_svg]:size-4",
            g.result === "correct" ? "bg-game text-game-ink" : "bg-fg/[0.07] text-fg",
          )}
        >
          {formatNumber(g.value)}
          <span className={g.result === "correct" ? "text-game-ink" : "text-game"}>{RESULT_COPY[g.result].icon}</span>
          <span className="sr-only">{RESULT_COPY[g.result].word}</span>
        </li>
      ))}
    </ol>
  );
}
