"use client";

import { Check, MoveHorizontal, RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { REACH_MS, type ReachState } from "../play/hand-check";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
/** "Reach measured" closes itself after this long. */
const DONE_CLOSE_MS = 2800;

/** Time left until `until`, ticking from a timer (never read during render). */
function useCountdown(until: number | null) {
  const [left, setLeft] = useState(REACH_MS);
  useEffect(() => {
    if (until === null) return;
    const tick = () => setLeft(Math.max(0, until - performance.now()));
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 100);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [until]);
  return left;
}

/**
 * Measuring the visitor's reach, from Settings: six seconds of sweeping both
 * hands to the edges while a gold box grows on the stage, then the
 * instruments fit inside it. It sits where the dock is, so the camera stays clear.
 */
export function ReachCard({ reach, onAgain, onStandard, onClose }: { reach: ReachState; onAgain: () => void; onStandard: () => void; onClose: () => void }) {
  const measuring = reach.status === "measuring";
  const left = useCountdown(measuring ? reach.until : null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (reach.status !== "done") return;
    const timer = window.setTimeout(() => closeRef.current(), DONE_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [reach.status]);

  return (
    <motion.section
      key={reach.status}
      aria-live="polite"
      aria-label="Your reach"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE_OUT } }}
      className="pointer-events-auto flex w-full max-w-[34rem] flex-col gap-4 rounded-xl bg-canvas/92 p-5 shadow-float"
    >
      {measuring ? (
        <>
          <div className="flex items-start gap-3">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-game-soft text-game">
              <MoveHorizontal className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="type-title-3 text-fg">Reach out to the edges</h2>
              <p className="type-body text-fg-muted">Sweep both hands left, right, up and down, as far as is comfortable.</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Progress value={1 - left / REACH_MS} label="Measuring your reach" tone="game" className="flex-1" />
            <span className="type-label w-10 shrink-0 text-right tabular-nums text-fg-subtle">{Math.ceil(left / 1000)} s</span>
            <Button variant="ghost" onClick={onClose} className="-my-2 -mr-2 shrink-0">
              Stop
            </Button>
          </div>
        </>
      ) : reach.status === "done" ? (
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-game text-game-ink">
            <Check className="size-5" strokeWidth={3} />
          </span>
          <p className="type-body min-w-0 flex-1 font-semibold text-fg">Reach measured. The instruments now fit inside the gold box.</p>
          <Button variant="secondary" onClick={onClose} className="shrink-0">
            Done
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h2 className="type-title-3 text-fg">That area was small</h2>
            <p className="type-body text-fg-muted">Sweep your hands wider and try again, or keep the standard area.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="game" icon={<RotateCcw />} onClick={onAgain}>
              Measure again
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                onStandard();
                onClose();
              }}
            >
              Keep the standard area
            </Button>
          </div>
        </>
      )}
    </motion.section>
  );
}
