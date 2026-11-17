import { Check, Equal, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { RoundOutcome, RoundRecord } from "../engine/types";
import { GESTURE_LABEL, GestureIcon } from "./gesture-icon";

const OUTCOME: Record<RoundOutcome, { icon: ReactNode; className: string; text: string }> = {
  player_win: { icon: <Check strokeWidth={2.5} />, className: "text-success", text: "You won" },
  ai_win: { icon: <X strokeWidth={2.5} />, className: "text-danger", text: "The AI won" },
  draw: { icon: <Equal strokeWidth={2.5} />, className: "text-fg-subtle", text: "Draw" },
};

/**
 * The last few rounds of this match, one column each: your move, the AI's
 * move, and who won (an icon as well as a colour).
 */
export function RoundStrip({ rounds, max = 8, className }: { rounds: readonly RoundRecord[]; max?: number; className?: string }) {
  const shown = rounds.slice(-max);
  if (shown.length === 0) return null;
  return (
    <div className={cn("flex items-stretch gap-3", className)}>
      <div aria-hidden className="type-label flex flex-col justify-between py-2 text-fg-subtle">
        <span className="flex h-5 items-center">You</span>
        <span className="flex h-5 items-center text-game">AI</span>
        <span className="h-4" />
      </div>
      <ol aria-label="Last rounds" className="no-scrollbar flex min-w-0 gap-1.5 overflow-x-auto">
        {shown.map((round) => {
          const outcome = OUTCOME[round.outcome];
          return (
            <li key={round.id} className="flex shrink-0 flex-col items-center gap-1.5 rounded-md bg-surface px-1.5 py-2 shadow-ring">
              <GestureIcon gesture={round.playerMove} className="size-5 text-fg" />
              <GestureIcon gesture={round.aiCounterMove} className="size-5 text-game" />
              <span aria-hidden className={cn("grid size-4 place-items-center [&_svg]:size-4", outcome.className)}>
                {outcome.icon}
              </span>
              <span className="sr-only">
                Round {round.roundNumber}: you played {GESTURE_LABEL[round.playerMove]}, the AI played{" "}
                {GESTURE_LABEL[round.aiCounterMove]}. {outcome.text}.
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
