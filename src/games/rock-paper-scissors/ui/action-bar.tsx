"use client";

import { ArrowRight, Play, RotateCcw, Trophy } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { KeyHints, type KeyHint } from "@/components/ui/key-hints";
import { cn } from "@/lib/cn";
import { isRoundLive, type MatchView } from "../match-controller";

/**
 * The one thing to do next, always in the same place: start a round, play a
 * missed one again, the next round, or the results. During a round there is
 * no button (your hand is the input), only a short reminder.
 */
export function ActionBar({
  view,
  ready,
  notReadyText,
  touch,
  onStart,
  onSeeResults,
  className,
}: {
  view: MatchView;
  /** The camera and model are ready (always true with keys). */
  ready: boolean;
  /** Why a round can't start yet. */
  notReadyText?: string;
  touch: boolean;
  onStart: () => void;
  onSeeResults: () => void;
  className?: string;
}) {
  const { match, missed, inputMode } = view;
  const live = isRoundLive(view);
  const complete = match.phase === "match_complete";
  const last = match.lastResolvedRound;

  let key: string;
  let action: ReactNode = null;
  let label = "";
  if (complete) {
    key = "results";
    label = "See results";
    action = (
      <Button variant="game" size="lg" icon={<Trophy />} arrow onClick={onSeeResults}>
        {label}
      </Button>
    );
  } else if (missed) {
    key = "again";
    label = "Play the round again";
    action = (
      <Button variant="game" size="lg" icon={<RotateCcw />} onClick={onStart} disabled={!ready}>
        {label}
      </Button>
    );
  } else if (!live) {
    key = last ? "next" : "start";
    label = last ? "Next round" : "Start round";
    action = (
      <Button variant="game" size="lg" icon={last ? <ArrowRight /> : <Play />} onClick={onStart} disabled={!ready}>
        {label}
      </Button>
    );
  } else {
    key = "live";
  }

  const hints: KeyHint[] = [];
  if (action && (ready || complete)) hints.push({ keys: ["Space"], label });
  if (inputMode === "keys" && !complete) hints.push({ keys: ["R", "P", "S"], label: "Throw" });

  return (
    <div className={cn("flex min-h-14 flex-wrap items-center gap-x-5 gap-y-3", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={key}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          // After a reveal, the button waits for the cards and the verdict.
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1], delay: key === "next" || key === "results" ? 0.7 : 0 }}
          className="flex min-h-14 items-center"
        >
          {action ??
            (inputMode === "camera" ? (
              <p className="type-body text-fg-muted">Throw on Shoot and hold it until it&apos;s read.</p>
            ) : (
              <p className="type-body text-fg-muted">{touch ? "Tap a move. It's thrown on Shoot." : "Your pick is thrown on Shoot."}</p>
            ))}
        </motion.div>
      </AnimatePresence>
      {!touch && hints.length > 0 ? <KeyHints items={hints} /> : null}
      {!ready && !complete && notReadyText ? <span className="type-small text-fg-subtle">{notReadyText}</span> : null}
    </div>
  );
}
