"use client";

import { ArrowRight, RotateCcw, Trophy, X } from "lucide-react";
import { motion, useInView } from "motion/react";
import { useRef, type ReactNode } from "react";
import { NextPlayerIcon } from "@/components/game/next-player";
import { ResultPanel } from "@/components/game/panels";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Score, Stat } from "@/components/ui/score";
import { cn } from "@/lib/cn";
import { GESTURES } from "../engine/aiPredictor";
import { countHabits, describeHabits, type HabitCounts, type Insight } from "../engine/insights";
import type { Difficulty, RoundRecord } from "../engine/types";
import { TARGET_WINS, type MatchView } from "../match-controller";
import { GESTURE_LABEL, HandGlyph } from "./gesture-icon";
import { RpsHowItWorks } from "./how-it-works";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Every time a habit could show up, in order: true when it did. Real events, for the tallies. */
function habitEvents(history: readonly RoundRecord[], insight: Insight): boolean[] {
  const out: boolean[] = [];
  for (let i = 0; i < history.length - 1; i++) {
    const now = history[i];
    const next = history[i + 1];
    const same = next.playerMove === now.playerMove;
    if (insight.id === "after-loss" && now.outcome === "ai_win") out.push(!same);
    else if (insight.id === "after-win" && now.outcome === "player_win") out.push(same);
    else if (insight.id === "repeats") out.push(same);
    else if (insight.id === "transition" && now.playerMove === insight.moves[0]) out.push(next.playerMove === insight.moves[1]);
  }
  return out;
}

/** A row of dots: filled when the habit happened, hollow when it didn't. */
function Tally({ events, shown }: { events: boolean[]; shown: boolean }) {
  return (
    <span aria-hidden className="flex flex-wrap gap-1">
      {events.slice(-16).map((hit, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={shown ? { opacity: 1, scale: 1 } : undefined}
          transition={{ duration: 0.2, ease: EASE_OUT, delay: 0.15 + Math.min(i, 5) * 0.04 }}
          className={cn("size-3 rounded-full", hit ? "bg-game" : "shadow-[inset_0_0_0_1.5px_var(--color-fg-subtle)]")}
        />
      ))}
    </span>
  );
}

/** Your move mix as three columns, with the line random play would give. */
function MoveMix({ habits }: { habits: HabitCounts }) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useInView(ref, { once: true, amount: 0.5 });
  const top = habits.favourite?.move ?? null;
  return (
    <div ref={ref} className="relative mt-2 flex h-40 items-end justify-around gap-4 px-2">
      {/* What picking at random gives: one in three each. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-[calc(2.25rem+(100%-4rem)*0.333)] border-t-2 border-dashed border-fg/25">
        <span className="type-label absolute -top-5 right-0 text-fg-subtle">Random 33%</span>
      </div>
      {GESTURES.map((g, i) => {
        const share = habits.total ? habits.counts[g] / habits.total : 0;
        const on = g === top;
        return (
          <div key={g} className="relative flex h-full w-16 flex-col items-center gap-2">
            <span className={cn("type-small shrink-0 font-semibold tabular-nums", on ? "text-game" : "text-fg-muted")}>
              {percent(habits.counts[g], habits.total)}%
            </span>
            <div className="flex min-h-0 w-full flex-1 items-end">
              <motion.span
                className={cn("block w-full origin-bottom rounded-t-md", on ? "bg-game" : "bg-fg/30")}
                style={{ height: `${Math.max(2, share * 100)}%` }}
                initial={{ scaleY: 0 }}
                animate={shown ? { scaleY: 1 } : undefined}
                transition={{ duration: 0.6, ease: EASE_OUT, delay: 0.1 + i * 0.08 }}
              />
            </div>
            <HandGlyph gesture={g} ink="var(--color-surface)" className={cn("size-7 shrink-0", on ? "text-game" : "text-fg-muted")} />
            <span className="sr-only">
              {GESTURE_LABEL[g]}: {habits.counts[g]} of {habits.total}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HabitCard({ insight, history }: { insight: Insight; history: readonly RoundRecord[] }) {
  const ref = useRef<HTMLLIElement>(null);
  const shown = useInView(ref, { once: true, amount: 0.6 });
  const events = habitEvents(history, insight);
  return (
    <li ref={ref} className="flex flex-col gap-3 rounded-lg bg-surface p-5 shadow-ring">
      <div className="flex items-start gap-3">
        {insight.id === "transition" && insight.moves.length === 2 ? (
          <span aria-hidden className="flex shrink-0 items-center gap-1 pt-0.5">
            <HandGlyph gesture={insight.moves[0]} ink="var(--color-surface)" className="size-7 text-fg" />
            <ArrowRight className="size-4 text-fg-subtle" />
            <HandGlyph gesture={insight.moves[1]} ink="var(--color-surface)" className="size-7 text-game" />
          </span>
        ) : null}
        <p className="type-body-lg font-semibold text-fg">{insight.text}</p>
      </div>
      {events.length > 0 ? <Tally events={events} shown={shown} /> : null}
      <p className="type-small text-fg-subtle">{insight.random}</p>
    </li>
  );
}

/** "What it noticed about you": the habits behind its guesses, with real counts only. */
function Noticed({ history, habits, insights }: { history: readonly RoundRecord[]; habits: HabitCounts; insights: Insight[] }) {
  const favourite = insights.find((i) => i.id === "favourite");
  const others = insights.filter((i) => i.id !== "favourite");
  return (
    <section aria-labelledby="rps-noticed" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="rps-noticed" className="type-title-1 text-fg">
          What it noticed about you
        </h2>
        <p className="type-body-lg max-w-[40rem] text-fg-muted">
          From your {habits.total} {habits.total === 1 ? "throw" : "throws"}. A rematch starts with all of this. Next player wipes it.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex flex-col gap-3 rounded-lg bg-surface p-5 shadow-ring sm:p-6">
          <h3 className="type-title-3 text-fg">{favourite?.text ?? "Your moves"}</h3>
          <MoveMix habits={habits} />
        </div>
        <ul className="flex flex-col gap-3">
          {others.map((insight) => (
            <HabitCard key={insight.id} insight={insight} history={history} />
          ))}
          {others.length === 0 ? (
            <li className="flex flex-col gap-1 rounded-lg bg-surface p-5 shadow-ring">
              <p className="type-body-lg font-semibold text-fg">No other habit stood out.</p>
              <p className="type-small text-fg-subtle">
                Your switches and repeats were close to what picking at random gives. That makes you harder to guess.
              </p>
            </li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}

/**
 * The end of a match: who won, how often the AI guessed the visitor's move
 * against the 33% that random guessing gets, what it noticed, and how it works.
 */
export function ResultsView({
  view,
  difficulty,
  onRematch,
  onNextPlayer,
}: {
  view: MatchView;
  difficulty: Difficulty;
  onRematch: () => void;
  onNextPlayer: () => void;
}) {
  const { match, history, guesses } = view;
  const won = match.winner === "player";
  const rounds = match.matchRounds;
  const correct = rounds.filter((r) => r.wasPredictionCorrect).length;
  const accuracy = percent(correct, rounds.length);
  const habits = countHabits(history);
  const insights = describeHabits(habits, 4);

  // Honest about small samples: only a clear gap from 33% counts as reading you.
  let verdict: ReactNode;
  if (accuracy >= 50) verdict = "It read you better than chance.";
  else if (accuracy <= 20) verdict = "You were harder to read than random.";
  else verdict = "Close to what random guessing gets.";

  return (
    <ResultPanel
      label={`Match over · ${DIFFICULTY_LABEL[difficulty]} · First to ${TARGET_WINS}`}
      badge={
        <Chip tone={won ? "success" : "danger"} icon={won ? <Trophy /> : <X />}>
          {won ? "You won" : "The AI won"}
        </Chip>
      }
      title={won ? `You beat it ${match.playerScore} to ${match.aiScore}` : `It beat you ${match.aiScore} to ${match.playerScore}`}
      score={
        <div className="flex flex-col gap-2 md:items-end">
          <Score value={accuracy} suffix="%" label="Guessed your throw" tone="game" className="md:items-end" />
          <span className="type-small text-fg-muted">{verdict}</span>
        </div>
      }
      stats={
        <>
          <Stat value={rounds.length} label="Rounds played" />
          <Stat value={`${correct} of ${rounds.length}`} label="Throws it saw coming" />
          <Stat value="33%" label="Random guessing gets" />
        </>
      }
      actions={
        <>
          <Button variant="game" size="lg" icon={<RotateCcw />} onClick={onRematch}>
            Rematch
          </Button>
          <Button variant="secondary" size="lg" icon={<NextPlayerIcon />} onClick={onNextPlayer}>
            Next player
          </Button>
          <span className="type-small self-center text-fg-subtle">A rematch keeps its notes on you.</span>
        </>
      }
    >
      <Noticed history={history} habits={habits} insights={insights} />
      <RpsHowItWorks history={history} guesses={guesses} rounds={rounds} insights={insights} />
    </ResultPanel>
  );
}
