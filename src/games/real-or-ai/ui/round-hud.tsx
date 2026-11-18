"use client";

import { motion } from "motion/react";
import { Clock3 } from "lucide-react";
import { useEffect, useRef } from "react";
import { LOW_TIME_SECONDS } from "../engine/timer";
import { fractionLeft, useSecondsLeft, type Clock } from "./countdown";
import { EASE_OUT, OUTCOME, OutcomeDot, SPRING, SPRING_POP, type Outcome } from "./labels";
import { cn } from "@/lib/cn";

/** Whether the clock is in its last seconds. */
const isLow = (clock: Clock, seconds: number) => clock.state === "running" && seconds <= LOW_TIME_SECONDS;

/**
 * Seconds left. In the last five the number turns to the warning colour and
 * beats once a second. role="timer" is not live, so screen readers aren't
 * told every second.
 */
export function TimerReadout({ clock, className }: { clock: Clock; className?: string }) {
  const seconds = useSecondsLeft(clock);
  const low = isLow(clock, seconds);
  return (
    <span
      className={cn(
        "flex items-center gap-1.5 transition-colors duration-200 ease-out",
        low ? "text-warning" : clock.state === "stopped" ? "text-fg-subtle" : "text-fg-muted",
        className,
      )}
    >
      <Clock3 aria-hidden className="size-5" />
      <span role="timer" aria-label={`${seconds} seconds left`} className="type-title-3 inline-block min-w-[2.7ch] tabular-nums text-current">
        {low ? (
          <motion.span
            key={seconds}
            className="inline-block"
            initial={{ scale: 1.28 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
          >
            {seconds}s
          </motion.span>
        ) : (
          `${seconds}s`
        )}
      </span>
    </span>
  );
}

/**
 * The bar, drawn straight from the clock: game colour while it runs, warning
 * in the last seconds, grey once the round is answered, refilling between rounds.
 */
export function TimerBar({ clock, className }: { clock: Clock; className?: string }) {
  const barRef = useRef<HTMLDivElement>(null);
  const seconds = useSecondsLeft(clock);
  const low = isLow(clock, seconds);

  // One style write per frame while the clock runs; no React render.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const draw = (refill = false) => {
      bar.style.transition = refill && !reduce ? "transform 450ms var(--ease-out), background-color 200ms" : "background-color 200ms";
      bar.style.transform = `scaleX(${fractionLeft(clock, performance.now())})`;
    };
    if (clock.state !== "running") {
      // Waiting refills the bar (the next round charging up); stopped freezes it where the answer came in.
      draw(clock.state === "waiting");
      return;
    }
    let raf = 0;
    const loop = () => {
      draw();
      if (fractionLeft(clock, performance.now()) > 0) raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [clock]);

  return (
    <div aria-hidden className={cn("h-1.5 w-full overflow-hidden rounded-full bg-fg/10", className)}>
      <div
        ref={barRef}
        className={cn(
          "h-full origin-left rounded-full will-change-transform",
          low ? "bg-warning" : clock.state === "stopped" ? "bg-fg-subtle" : "bg-game",
        )}
      />
    </div>
  );
}

/**
 * Where you are in the game, and how each round went: answered rounds turn
 * into a tick, a cross or a stopped clock; the current one is the long pill.
 */
function RoundTrack({ total, index, outcomes }: { total: number; index: number; outcomes: readonly (Outcome | undefined)[] }) {
  const played = outcomes.filter((o): o is Outcome => Boolean(o));
  const found = played.filter((o) => o === "found").length;
  const label =
    played.length === 0 ? `Round ${index + 1} of ${total}` : `Round ${index + 1} of ${total}. Found ${found} of ${played.length} so far.`;
  return (
    <div role="img" aria-label={label} className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => {
        const outcome = outcomes[i];
        const current = i === index && !outcome;
        return (
          <motion.span
            key={i}
            layout
            transition={SPRING}
            title={outcome ? `Round ${i + 1}: ${OUTCOME[outcome].short}` : undefined}
            className={cn(
              "grid shrink-0 place-items-center rounded-full",
              outcome ? "size-5" : current ? "h-2 w-7 bg-game" : "size-2 bg-fg/15",
            )}
          >
            {outcome ? (
              <motion.span initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={SPRING_POP}>
                <OutcomeDot outcome={outcome} />
              </motion.span>
            ) : null}
          </motion.span>
        );
      })}
    </div>
  );
}

export function RoundHud({
  index,
  total,
  outcomes,
  clock,
}: {
  index: number;
  total: number;
  outcomes: readonly (Outcome | undefined)[];
  clock: Clock;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex h-9 min-w-0 items-center gap-3">
        <span className="type-label shrink-0 tabular-nums text-fg-subtle">
          Round {index + 1} of {total}
        </span>
        <RoundTrack total={total} index={index} outcomes={outcomes} />
        <TimerReadout clock={clock} className="ml-auto" />
      </div>
      <TimerBar clock={clock} />
    </div>
  );
}
