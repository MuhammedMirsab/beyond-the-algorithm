"use client";

import { ArrowRight, Check, Equal, Lock, Play, RotateCcw, ScanSearch, Trophy, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Score } from "@/components/ui/score";
import { Kbd } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import type { RoundOutcome } from "../engine/types";
import { isRoundLive, TARGET_WINS, type MatchView } from "../match-controller";
import { GESTURE_LABEL } from "./gesture-icon";
import { AiCard, PlayerCard, type AiCardState } from "./move-cards";

const OUTCOME: Record<RoundOutcome, { word: string; icon: ReactNode; className: string }> = {
  player_win: { word: "You win", icon: <Check strokeWidth={2.75} />, className: "text-success" },
  ai_win: { word: "AI wins", icon: <X strokeWidth={2.75} />, className: "text-danger" },
  draw: { word: "Draw", icon: <Equal strokeWidth={2.75} />, className: "text-fg-muted" },
};

const COUNTDOWN_WORD = { 3: "3", 2: "2", 1: "1", SHOOT: "Shoot" } as const;

const ENTER = { duration: 0.18, ease: [0.22, 1, 0.36, 1] } as const;

/** Space, on screens that probably have a keyboard. */
function SpaceKey() {
  return (
    <span className="type-small hidden items-center gap-2 text-fg-subtle lg:inline-flex">
      or press <Kbd>Space</Kbd>
    </span>
  );
}

/** The big line of the round: the countdown, the result, or a miss. */
function Headline({ view }: { view: MatchView }) {
  const { match, missed } = view;
  const live = isRoundLive(view);
  const last = match.lastResolvedRound;

  let key: string;
  let content: ReactNode;
  if (live && match.countdownValue !== null) {
    key = `count-${match.countdownValue}`;
    content = <span className="type-score block text-game">{COUNTDOWN_WORD[match.countdownValue]}</span>;
  } else if (missed) {
    key = "missed";
    content = (
      <span className="flex items-center gap-3 text-fg-muted [&_svg]:size-7">
        <ScanSearch aria-hidden />
        <span className="type-title-1">No throw seen</span>
      </span>
    );
  } else if (last && match.phase === "match_complete") {
    const won = match.winner === "player";
    key = "match-over";
    content = (
      <span className={cn("flex items-center gap-3 [&_svg]:size-8", won ? "text-success" : "text-danger")}>
        {won ? <Trophy aria-hidden /> : <X strokeWidth={2.75} aria-hidden />}
        <span className="type-title-1">{won ? "You won the match" : "The AI won the match"}</span>
      </span>
    );
  } else if (last) {
    const outcome = OUTCOME[last.outcome];
    key = `result-${last.id}`;
    content = (
      <span className={cn("flex items-center gap-3 [&_svg]:size-8", outcome.className)}>
        {outcome.icon}
        <span className="type-title-1">{outcome.word}</span>
      </span>
    );
  } else {
    key = "ready";
    content = <span className="type-title-1 text-fg-muted">Ready when you are</span>;
  }

  const isCount = key.startsWith("count-");
  return (
    <div className="relative grid min-h-20 place-items-center lg:min-h-24">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={key}
          initial={isCount ? { opacity: 0, scale: 0.8 } : { opacity: 0, y: 8 }}
          animate={isCount ? { opacity: 1, scale: 1 } : { opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          transition={key.startsWith("result-") || key === "match-over" ? { type: "spring", duration: 0.45, bounce: 0.25 } : ENTER}
          className="text-center"
        >
          {content}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/**
 * The match side of the arena: the score, the round's headline, the two
 * cards, what just happened, the AI's comment and the one action.
 */
export function MatchPanel({
  view,
  ready,
  notReadyText,
  onStart,
  onSeeResults,
}: {
  view: MatchView;
  /** The camera and model are ready (always true with keys). */
  ready: boolean;
  /** Why the round can't start yet. */
  notReadyText?: string;
  onStart: () => void;
  onSeeResults: () => void;
}) {
  const { match, learning, missed, inputMode } = view;
  const live = isRoundLive(view);
  const last = match.lastResolvedRound;
  const complete = match.phase === "match_complete";
  const revealed = !live && !missed && last !== null;
  const aiState: AiCardState = live || missed ? "locked" : revealed ? "revealed" : "waiting";
  const shoot = live && match.countdownValue === "SHOOT";
  const roundShown = live || missed ? match.roundNumber : Math.max(1, match.matchRounds.length);

  // One polite announcement per change: the count, then the result.
  let announcement = "";
  if (live && match.countdownValue !== null) announcement = COUNTDOWN_WORD[match.countdownValue];
  else if (missed) announcement = "Didn't catch your hand. Play the round again.";
  else if (revealed && last) {
    announcement = `${OUTCOME[last.outcome].word}. You played ${GESTURE_LABEL[last.playerMove]}, the AI played ${GESTURE_LABEL[last.aiCounterMove]}.`;
    if (complete) announcement += match.winner === "player" ? " You won the match." : " The AI won the match.";
  }

  let status: ReactNode;
  if (live && !shoot) {
    status = (
      <p className="type-body inline-flex items-center gap-2 font-semibold text-fg">
        <Lock className="size-4 shrink-0 text-game" aria-hidden />
        Locked in before you throw
      </p>
    );
  } else if (shoot) {
    status =
      inputMode === "camera" ? (
        <p className="type-body font-semibold text-fg">Show your hand now</p>
      ) : (
        <p className="type-body font-semibold text-fg">
          <span className="lg:hidden">Pick your move now</span>
          <span className="hidden items-center gap-1.5 lg:inline-flex">
            Press <Kbd>R</Kbd> <Kbd>P</Kbd> or <Kbd>S</Kbd>
          </span>
        </p>
      );
  } else if (missed) {
    status = (
      <p className="type-body max-w-[30rem] text-fg-muted">
        <span className="font-semibold text-fg">Didn&apos;t catch your hand.</span> Hold it up and make the shape clearly.
        The AI keeps its locked move.
      </p>
    );
  } else if (revealed && last) {
    status = (
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
        <p className="type-body text-fg-muted">
          It guessed <span className="font-semibold text-fg">{last.predictedPlayerMove}</span>, so it played{" "}
          <span className="font-semibold text-fg">{last.aiCounterMove}</span>.
        </p>
        {last.wasPredictionCorrect ? <Chip icon={<Check />}>Right guess</Chip> : <Chip icon={<X />}>Wrong guess</Chip>}
      </div>
    );
  } else {
    status = <p className="type-body max-w-[30rem] text-fg-muted">It picks its move before each countdown, from your earlier moves.</p>;
  }

  let action: ReactNode = null;
  if (complete) {
    action = (
      <Button variant="game" size="lg" arrow onClick={onSeeResults}>
        See results
      </Button>
    );
  } else if (missed) {
    action = (
      <Button variant="game" size="lg" icon={<RotateCcw />} onClick={onStart} disabled={!ready}>
        Play the round again
      </Button>
    );
  } else if (!live) {
    action = (
      <Button variant="game" size="lg" icon={last ? <ArrowRight /> : <Play />} onClick={onStart} disabled={!ready}>
        {last ? "Next round" : "Start round"}
      </Button>
    );
  }

  return (
    <section aria-label="Match" className="flex min-w-0 flex-col gap-4 lg:gap-5">
      <div className="flex items-end justify-between gap-4">
        <Score value={match.playerScore} label="You" />
        <div className="flex flex-col items-center gap-1 pb-0.5 text-center">
          <span className="type-label text-fg-subtle">First to {TARGET_WINS}</span>
          <span className="type-caption tabular-nums text-fg-subtle">Round {roundShown}</span>
        </div>
        <Score value={match.aiScore} label="AI" tone="game" className="items-end text-right" />
      </div>

      <Headline view={view} />

      <div className="flex items-center justify-center gap-4 sm:gap-8">
        <PlayerCard move={revealed && last ? last.playerMove : null} revealKey={last?.id ?? null} />
        <span aria-hidden className="type-title-3 pb-6 text-fg-subtle">
          vs
        </span>
        <AiCard state={aiState} move={revealed && last ? last.aiCounterMove : null} />
      </div>

      <div className="flex min-h-14 flex-col items-center justify-center text-center">{status}</div>

      <p className={cn("type-body-lg max-w-[34rem] self-center text-center transition-colors duration-150", live ? "text-fg-subtle" : "text-fg")}>
        <span className="type-label mr-2 align-[0.15em] text-game">AI</span>
        {learning.lastCommentary}
      </p>

      <div className="flex min-h-14 flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {action}
        {action && (ready || complete) ? <SpaceKey /> : null}
        {!ready && !complete && notReadyText ? <span className="type-small text-fg-subtle">{notReadyText}</span> : null}
      </div>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
    </section>
  );
}
