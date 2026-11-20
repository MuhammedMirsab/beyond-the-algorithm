"use client";

import NumberFlow from "@number-flow/react";
import { Check, Equal, Lock, ScanSearch, Trophy, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { RoundOutcome } from "../engine/types";
import { isRoundLive, TARGET_WINS, type Beat, type MatchView } from "../match-controller";
import { GESTURE_LABEL, HandGlyph, WINS_LINE } from "./gesture-icon";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const BEAT_WORD: Record<Exclude<Beat, "lock">, string> = { rock: "Rock", paper: "Paper", scissors: "Scissors", shoot: "Shoot" };
const BEAT_INDEX: Record<Exclude<Beat, "lock">, number> = { rock: 1, paper: 2, scissors: 3, shoot: 4 };

export const OUTCOME_COPY: Record<RoundOutcome, { word: string; icon: ReactNode; className: string }> = {
  player_win: { word: "You win", icon: <Check strokeWidth={3} />, className: "text-success" },
  ai_win: { word: "AI wins", icon: <X strokeWidth={3} />, className: "text-danger" },
  draw: { word: "Draw", icon: <Equal strokeWidth={3} />, className: "text-fg-muted" },
};

/** When the verdict lands: the score ticks with it, after the AI's card has turned. */
const SCORE_DELAY_MS = 350;

/** A score that goes up a beat late (so it lands with the verdict) and resets at once. */
function useLandedScore(score: number): number {
  const [shown, setShown] = useState(score);
  useEffect(() => {
    if (score === shown) return;
    const timer = window.setTimeout(() => setShown(score), score > shown ? SCORE_DELAY_MS : 0);
    return () => window.clearTimeout(timer);
  }, [score, shown]);
  return Math.min(shown, score);
}

/** One side of the scoreboard: name, dot-matrix score and one pip per win needed (TARGET_WINS). */
function Side({ who, score: actual, align }: { who: "you" | "ai"; score: number; align: "left" | "right" }) {
  const ai = who === "ai";
  const score = useLandedScore(actual);
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", align === "right" ? "items-end text-right" : "items-start")}>
      <span className={cn("type-label", ai ? "text-game" : "text-fg-muted")}>{ai ? "AI" : "You"}</span>
      <div className={cn("flex items-center gap-3", align === "right" && "flex-row-reverse")}>
        <NumberFlow
          value={score}
          aria-label={`${ai ? "AI" : "You"}: ${actual}`}
          className={cn(
            "font-dots text-[2.75rem] font-extrabold leading-[0.85] tabular-nums [font-variation-settings:'ROND'_70] sm:text-[3.25rem] lg:text-[3.5rem]",
            ai ? "text-game" : "text-fg",
          )}
        />
        <ol aria-hidden className={cn("flex gap-1 max-sm:hidden sm:gap-1.5", align === "right" && "flex-row-reverse")}>
          {Array.from({ length: TARGET_WINS }, (_, i) => {
            const on = i < score;
            return (
              <li key={i} className="relative size-2 sm:size-2.5">
                <span className="absolute inset-0 rounded-full bg-fg/15" />
                {on ? (
                  <motion.span
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", duration: 0.45, bounce: 0.45 }}
                    className={cn("absolute inset-0 rounded-full", ai ? "bg-game" : "bg-fg")}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/** Four dots under the chant: where in "rock, paper, scissors, shoot" we are. */
function BeatDots({ at }: { at: number }) {
  return (
    <span aria-hidden className="flex gap-1.5">
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-5 rounded-full transition-colors duration-150",
            i <= at ? (at === 4 ? "bg-game" : "bg-fg") : "bg-fg/15",
          )}
        />
      ))}
    </span>
  );
}

interface Line {
  key: string;
  main: ReactNode;
  sub?: ReactNode;
  /** How it enters. */
  motion: "beat" | "verdict" | "calm";
}

function headline(view: MatchView, cameraMode: boolean, touch: boolean): Line {
  const { match, missed, beat } = view;
  const live = isRoundLive(view);
  const last = match.lastResolvedRound;

  if (live && beat === "lock") {
    return {
      key: `lock-${match.sealedCommitment?.roundId ?? ""}`,
      motion: "calm",
      main: (
        <span className="type-title-1 inline-flex items-center gap-3 text-game max-sm:text-[1.5rem]">
          <Lock className="size-7 max-sm:size-6" strokeWidth={2.5} aria-hidden />
          Locked in
        </span>
      ),
      sub: <span className="type-small text-fg-muted">Its move is set before you throw</span>,
    };
  }
  if (live && beat && beat !== "lock") {
    const shoot = beat === "shoot";
    return {
      key: `beat-${beat}-${match.sealedCommitment?.roundId ?? ""}`,
      motion: "beat",
      main: (
        <span className={cn("type-display-2 block whitespace-nowrap max-sm:text-[2.25rem]", shoot ? "text-game" : "text-fg")}>
          {BEAT_WORD[beat]}
        </span>
      ),
      sub: shoot ? (
        <span className="type-small font-semibold text-fg">
          {cameraMode ? "Show your hand now" : touch ? "Tap your move now" : "Pick your move now"}
        </span>
      ) : (
        <BeatDots at={BEAT_INDEX[beat]} />
      ),
    };
  }
  if (missed) {
    return {
      key: "missed",
      motion: "calm",
      main: (
        <span className="type-title-1 inline-flex items-center gap-3 text-fg max-sm:text-[1.5rem]">
          <ScanSearch className="size-7 text-fg-muted max-sm:size-6" aria-hidden />
          No throw seen
        </span>
      ),
      sub: <span className="type-small text-fg-muted">Its move stays locked. Play the round again.</span>,
    };
  }
  if (last && match.phase === "match_complete") {
    const won = match.winner === "player";
    return {
      key: "match-over",
      motion: "verdict",
      main: (
        <span className={cn("type-title-1 inline-flex items-center gap-3 max-sm:text-[1.375rem]", won ? "text-success" : "text-danger")}>
          {won ? <Trophy className="size-8" aria-hidden /> : <X className="size-8" strokeWidth={3} aria-hidden />}
          {won ? "You won the match" : "The AI won the match"}
        </span>
      ),
      sub: (
        <span className="type-small text-fg-muted">
          {won ? `${match.playerScore} to ${match.aiScore}` : `${match.aiScore} to ${match.playerScore}`} in {match.matchRounds.length} rounds
        </span>
      ),
    };
  }
  if (last) {
    const outcome = OUTCOME_COPY[last.outcome];
    const winner = last.outcome === "player_win" ? last.playerMove : last.outcome === "ai_win" ? last.aiCounterMove : null;
    return {
      key: `result-${last.id}`,
      motion: "verdict",
      main: (
        <span className={cn("type-title-1 inline-flex items-center gap-3 max-sm:text-[1.5rem] [&_svg]:size-8 max-sm:[&_svg]:size-6", outcome.className)}>
          {outcome.icon}
          {outcome.word}
        </span>
      ),
      sub: (
        <span className="type-small inline-flex items-center gap-2 text-fg-muted">
          <HandGlyph gesture={last.playerMove} className="size-5 text-fg" />
          <span className="sr-only">You: {GESTURE_LABEL[last.playerMove]}.</span>
          <span aria-hidden>vs</span>
          <HandGlyph gesture={last.aiCounterMove} flip className="size-5 text-game" />
          <span className="sr-only">AI: {GESTURE_LABEL[last.aiCounterMove]}.</span>
          <span className="ml-1">{winner ? WINS_LINE[winner] : `You both threw ${last.playerMove}`}</span>
        </span>
      ),
    };
  }
  return {
    key: "ready",
    motion: "calm",
    main: <span className="type-title-1 text-fg max-sm:text-[1.5rem]">Round {match.roundNumber}</span>,
    sub: <span className="type-small text-fg-muted">First to {TARGET_WINS} wins</span>,
  };
}

const ENTER: Record<Line["motion"], { initial: Record<string, number>; transition: object }> = {
  // The chant: each word punches in, fast.
  beat: { initial: { opacity: 0, scale: 1.4 }, transition: { duration: 0.2, ease: EASE_OUT } },
  // A result: waits for the card to turn, then lands with a little bounce.
  verdict: { initial: { opacity: 0, y: 10, scale: 0.96 }, transition: { type: "spring", duration: 0.5, bounce: 0.3, delay: 0.3 } },
  calm: { initial: { opacity: 0, y: 6 }, transition: { duration: 0.2, ease: EASE_OUT } },
};

/**
 * The scoreboard: you and the AI with your scores and pips, and between them
 * the one line that says what is happening now (the chant, the result).
 */
export function MatchHeader({ view, cameraMode, touch }: { view: MatchView; cameraMode: boolean; touch: boolean }) {
  const line = headline(view, cameraMode, touch);
  const enter = ENTER[line.motion];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 sm:gap-6">
      <Side who="you" score={view.match.playerScore} align="left" />
      <div className="relative grid min-h-[4.75rem] min-w-[9.5rem] place-items-center sm:min-w-[17rem] lg:min-h-[5.25rem] lg:min-w-[22rem]">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={line.key}
            initial={enter.initial}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: line.motion === "beat" ? 0.92 : 1, transition: { duration: 0.1 } }}
            transition={enter.transition}
            className="flex flex-col items-center gap-2 text-center"
          >
            {line.main}
            {line.sub}
          </motion.div>
        </AnimatePresence>
      </div>
      <Side who="ai" score={view.match.aiScore} align="right" />
    </div>
  );
}
