"use client";

import { Check, Lock, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { GESTURES } from "../engine/aiPredictor";
import { explainGuess, type Reason } from "../engine/explain";
import { countHabits, type HabitCounts } from "../engine/insights";
import type { Gesture, PredictionBreakdown, RoundRecord } from "../engine/types";
import { isRoundLive, type MatchView } from "../match-controller";
import { GESTURE_LABEL, HandGlyph } from "./gesture-icon";
import { AiCard, type AiCardState } from "./move-cards";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export type GuessState = "before" | "sealed" | "revealed";

export interface GuessInfo {
  state: GuessState;
  /** The revealed round and what the AI thought before it. */
  round: RoundRecord | null;
  guess: PredictionBreakdown | null;
  reason: Reason | null;
  /** Rounds it had already seen before this match started (a rematch). */
  remembered: number;
}

/** Everything the panels need about the AI's last guess, from the match view. */
export function guessInfo(view: MatchView): GuessInfo {
  const { match, history, guesses, missed } = view;
  const live = isRoundLive(view);
  const last = match.lastResolvedRound;
  const remembered = history.length - match.matchRounds.length;
  if (live || missed) return { state: "sealed", round: null, guess: null, reason: null, remembered };
  if (!last) return { state: "before", round: null, guess: null, reason: null, remembered };
  const index = history.findIndex((r) => r.id === last.id);
  const guess = index >= 0 ? guesses[index] ?? null : null;
  const reason = guess ? explainGuess(guess, history.slice(0, index), last.difficulty) : null;
  return { state: "revealed", round: last, guess, reason, remembered };
}

export function aiCardState(view: MatchView): AiCardState {
  if (isRoundLive(view) || view.missed) return "locked";
  return view.match.lastResolvedRound ? "revealed" : "waiting";
}

/** Which round the card belongs to: a new id deals a new card. */
export function dealKey(view: MatchView): string | null {
  return view.match.sealedCommitment?.roundId ?? view.match.lastResolvedRound?.id ?? null;
}

const pct = (value: number) => Math.round(value * 100);

/** The AI's odds for your next throw, as bars. Hidden (empty tracks) while its guess is sealed. */
function OddsBars({ odds, highlight, hidden }: { odds: Record<Gesture, number>; highlight: Gesture | null; hidden: boolean }) {
  return (
    <ul className="flex flex-col gap-2">
      {GESTURES.map((g, i) => {
        const on = !hidden && g === highlight;
        return (
          <li key={g} className="grid grid-cols-[1.5rem_4.75rem_minmax(0,1fr)_2.75rem] items-center gap-x-2.5">
            <HandGlyph gesture={g} ink="var(--color-sunken)" className={cn("size-6 transition-colors duration-300", on ? "text-game" : "text-fg-muted")} />
            <span className={cn("type-small font-semibold transition-colors duration-300", on ? "text-fg" : "text-fg-muted")}>
              {GESTURE_LABEL[g]}
            </span>
            <span aria-hidden className="block h-2 overflow-hidden rounded-full bg-fg/10">
              <span
                className={cn(
                  "block h-full origin-left rounded-full transition-[transform,background-color] ease-out",
                  on ? "bg-game" : "bg-fg/35",
                  hidden ? "duration-200" : "duration-500",
                )}
                style={{
                  transform: `scaleX(${hidden ? 0 : Math.min(1, Math.max(0, odds[g]))})`,
                  transitionDelay: hidden ? "0ms" : `${380 + i * 70}ms`,
                }}
              />
            </span>
            <span
              className={cn(
                "type-small text-right font-semibold tabular-nums transition-colors duration-300",
                on ? "text-game" : "text-fg-subtle",
              )}
            >
              {hidden ? "?" : `${pct(odds[g])}%`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const EVEN: Record<Gesture, number> = { rock: 1 / 3, paper: 1 / 3, scissors: 1 / 3 };

/**
 * What the AI thought you'd throw, and why. Sealed while a round is live (the
 * odds would give its move away), revealed together with its card.
 */
export function GuessBlock({ info, className }: { info: GuessInfo; className?: string }) {
  const { state, round, guess, reason, remembered } = info;

  let title: ReactNode;
  let badge: ReactNode = null;
  let text: ReactNode;
  if (state === "revealed" && round && guess) {
    title = (
      <>
        It expected <span className="text-game">{round.predictedPlayerMove}</span>
      </>
    );
    badge = round.wasPredictionCorrect ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-game px-2 py-0.5 text-[0.8125rem] font-semibold text-game-ink [&_svg]:size-3.5">
        <Check strokeWidth={3} aria-hidden />
        Right
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full bg-fg/10 px-2 py-0.5 text-[0.8125rem] font-semibold text-fg-muted [&_svg]:size-3.5">
        <X strokeWidth={3} aria-hidden />
        Wrong
      </span>
    );
    text = reason?.text ?? null;
  } else if (state === "sealed") {
    title = (
      <span className="inline-flex items-center gap-2">
        <Lock className="size-[0.9em] text-game" strokeWidth={2.5} aria-hidden />
        Its guess is sealed
      </span>
    );
    text = "It decided before the chant, from your earlier throws only. You see it when the card flips.";
  } else if (remembered > 0) {
    title = "It remembers you";
    text = `It still has your ${remembered} ${remembered === 1 ? "throw" : "throws"} from the last match.`;
  } else {
    title = "It hasn't seen you play";
    text = "So its first move is a random pick. Every throw you make goes into its notes.";
  }

  const odds = state === "revealed" && guess ? guess.probabilities : EVEN;
  const highlight = state === "revealed" && round ? round.predictedPlayerMove : null;

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="type-label text-fg-subtle">Its guess</span>
        {badge ? (
          <motion.span
            key={round?.id ?? "badge"}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0.3, delay: 0.55 }}
          >
            {badge}
          </motion.span>
        ) : null}
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.p
          key={`${state}-${round?.id ?? remembered}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          transition={{ duration: 0.22, ease: EASE_OUT, delay: state === "revealed" ? 0.3 : 0 }}
          className="type-title-3 text-fg"
        >
          {title}
        </motion.p>
      </AnimatePresence>
      <OddsBars odds={odds} highlight={highlight} hidden={state === "sealed"} />
      <AnimatePresence mode="popLayout" initial={false}>
        {text ? (
          <motion.p
            key={`why-${state}-${round?.id ?? remembered}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.25, ease: EASE_OUT, delay: state === "revealed" ? 0.75 : 0 }}
            className="type-small text-fg-muted"
          >
            {state === "revealed" ? <span className="type-label mr-1.5 text-game">Why</span> : null}
            {text}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Its notes on you: the counts its guesses come from. */
export function Notes({ habits, className }: { habits: HabitCounts; className?: string }) {
  if (habits.total === 0) return null;
  const top = habits.favourite?.move ?? null;
  const rows: { label: string; value: ReactNode }[] = [
    {
      label: "Your throws",
      value: (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {GESTURES.map((g) => (
            <span key={g} className={cn("inline-flex items-center gap-1 tabular-nums", g === top ? "text-fg" : "text-fg-muted")}>
              <HandGlyph gesture={g} ink="var(--color-sunken)" className={cn("size-5", g === top ? "text-game" : "text-fg-muted")} />
              <span className="sr-only">{GESTURE_LABEL[g]}</span>
              {habits.counts[g]}
            </span>
          ))}
        </span>
      ),
    },
    {
      label: "After you win",
      value: habits.afterWin.total ? `same move ${habits.afterWin.stayed} of ${habits.afterWin.total}` : "no wins yet",
    },
    {
      label: "After you lose",
      value: habits.afterLoss.total ? `switched ${habits.afterLoss.switched} of ${habits.afterLoss.total}` : "no losses yet",
    },
  ];
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      <span className="type-label text-fg-subtle">Its notes on you</span>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="type-small text-fg-subtle">{row.label}</dt>
            <dd className="type-small font-semibold tabular-nums text-fg">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** How often its locked guess matched the throw, across everything it has seen of you. */
function GuessRecord({ habits }: { habits: HabitCounts }) {
  if (habits.guesses.total === 0) return null;
  return (
    <span className="type-label inline-flex items-center gap-1.5 tabular-nums text-fg-subtle">
      {/* The same dot marks a guessed throw on the round tape. */}
      <span aria-hidden className="size-1.5 rounded-full bg-game" />
      Guessed right {habits.guesses.correct} of {habits.guesses.total}
    </span>
  );
}

/**
 * The machine's side of the table: its card, its guess and its notes. A
 * dotted panel, like the other places where the machine shows what it sees.
 */
export function AiPanel({ view, showNotes = true, className }: { view: MatchView; showNotes?: boolean; className?: string }) {
  const info = guessInfo(view);
  const habits = countHabits(view.history);
  return (
    <section aria-label="The AI" className={cn("@container dot-field flex min-w-0 flex-col gap-4 rounded-xl bg-sunken p-4 shadow-ring sm:p-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="type-label text-game">AI</span>
        <GuessRecord habits={habits} />
      </div>
      <div className="grid flex-1 content-start gap-5 @[30rem]:grid-cols-[minmax(0,10.5rem)_minmax(0,1fr)]">
        <AiCard
          state={aiCardState(view)}
          move={info.state === "revealed" && info.round ? info.round.aiCounterMove : null}
          beat={view.beat}
          dealKey={dealKey(view)}
          className="w-full max-w-[10.5rem] justify-self-center [@media(max-height:46rem)]:max-w-[9rem]"
        />
        <div className="flex min-w-0 flex-col gap-5">
          <GuessBlock info={info} />
          {showNotes ? <Notes habits={habits} className="[@media(max-height:44rem)]:hidden" /> : null}
        </div>
      </div>
    </section>
  );
}
