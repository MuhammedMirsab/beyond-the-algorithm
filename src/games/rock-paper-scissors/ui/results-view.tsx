"use client";

import { ArrowRight, Lock, Repeat, Repeat2, RotateCcw, Shuffle, Trophy, UserRoundPlus, X } from "lucide-react";
import type { ReactNode } from "react";
import { HowItWorks, ResultPanel } from "@/components/game/panels";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { ConfidenceBars } from "@/components/ui/meter";
import { Score, Stat } from "@/components/ui/score";
import { Card } from "@/components/ui/surface";
import { GESTURES } from "../engine/aiPredictor";
import { countHabits, describeHabits, type HabitCounts, type Insight } from "../engine/insights";
import type { Difficulty, Gesture } from "../engine/types";
import { TARGET_WINS, type MatchView } from "../match-controller";
import { GESTURE_LABEL, GestureIcon } from "./gesture-icon";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

const INSIGHT_ICON: Record<Exclude<Insight["id"], "favourite" | "transition">, ReactNode> = {
  "after-loss": <Shuffle />,
  "after-win": <Repeat />,
  repeats: <Repeat2 />,
};

function InsightIcon({ insight }: { insight: Insight }) {
  if (insight.id === "transition" && insight.moves.length === 2) {
    return (
      <span aria-hidden className="flex shrink-0 items-center gap-1 text-game">
        <GestureIcon gesture={insight.moves[0]} className="size-6" />
        <ArrowRight className="size-4 text-fg-subtle" />
        <GestureIcon gesture={insight.moves[1]} className="size-6" />
      </span>
    );
  }
  if (insight.id === "favourite" || insight.id === "transition") return null;
  return (
    <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-md bg-game-soft text-game [&_svg]:size-5">
      {INSIGHT_ICON[insight.id]}
    </span>
  );
}

/** "What it noticed about you": the habits behind its guesses, with real counts only. */
function Noticed({ habits, insights }: { habits: HabitCounts; insights: Insight[] }) {
  const favourite = insights.find((i) => i.id === "favourite");
  const others = insights.filter((i) => i.id !== "favourite");
  return (
    <section aria-labelledby="rps-noticed" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="rps-noticed" className="type-title-1 text-fg">
          What it noticed about you
        </h2>
        <p className="type-body-lg max-w-[40rem] text-fg-muted">
          From your {habits.total} {habits.total === 1 ? "round" : "rounds"}. A rematch starts with all of this. Next
          player wipes it.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card className="flex flex-col gap-5 p-5 sm:p-6">
          <h3 className="type-title-3 text-fg">{favourite?.text ?? "Your moves"}</h3>
          <ConfidenceBars
            rows={GESTURES.map((g) => ({ id: g, label: GESTURE_LABEL[g], value: habits.total ? habits.counts[g] / habits.total : 0 }))}
            highlight={habits.favourite?.move ?? null}
          />
          <p className="type-small text-fg-subtle">Picking at random would give about 33% each.</p>
        </Card>
        <ul className="flex flex-col gap-3">
          {others.map((insight) => (
            <li key={insight.id} className="flex items-center gap-4 rounded-lg bg-surface p-5 shadow-ring">
              <InsightIcon insight={insight} />
              <div className="flex min-w-0 flex-col gap-1">
                <p className="type-body-lg font-semibold text-fg">{insight.text}</p>
                <p className="type-small text-fg-subtle">{insight.random}</p>
              </div>
            </li>
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

function MoveRow({ moves }: { moves: Gesture[] }) {
  return (
    <div className="dot-field flex min-h-20 flex-wrap content-center items-center gap-1.5 px-4 py-3 text-fg">
      {moves.map((move, i) => (
        <GestureIcon key={i} gesture={move} className="size-6" />
      ))}
      <span className="sr-only">Your moves: {moves.map((m) => GESTURE_LABEL[m]).join(", ")}</span>
    </div>
  );
}

function Pair({ left, right, leftLabel, rightLabel, lock }: { left: Gesture; right: Gesture; leftLabel: string; rightLabel: string; lock?: boolean }) {
  return (
    <div className="dot-field flex min-h-20 items-center justify-center gap-4 px-4 py-3">
      <span className="flex flex-col items-center gap-1">
        <GestureIcon gesture={left} className="size-7 text-fg" />
        <span className="type-label text-fg-subtle">{leftLabel}</span>
      </span>
      <ArrowRight className="size-4 text-fg-subtle" aria-hidden />
      <span className="flex flex-col items-center gap-1">
        <span className="flex items-center gap-1 text-game">
          {lock ? <Lock className="size-4" aria-hidden /> : null}
          <GestureIcon gesture={right} className="size-7" />
        </span>
        <span className="type-label text-fg-subtle">{rightLabel}</span>
      </span>
    </div>
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
  const { match, history } = view;
  const won = match.winner === "player";
  const rounds = match.matchRounds;
  const correct = rounds.filter((r) => r.wasPredictionCorrect).length;
  const accuracy = percent(correct, rounds.length);
  const habits = countHabits(history);
  const insights = describeHabits(habits, 4);
  const strongest = insights.find((i) => i.id !== "favourite") ?? insights[0];
  const lastRound = rounds[rounds.length - 1] ?? history[history.length - 1];

  return (
    <ResultPanel
      label={`Match over · ${DIFFICULTY_LABEL[difficulty]} · First to ${TARGET_WINS}`}
      title={won ? `You beat it ${match.playerScore} to ${match.aiScore}` : `It beat you ${match.aiScore} to ${match.playerScore}`}
      score={
        <div className="flex flex-col gap-4 md:items-end">
          <Chip tone={won ? "success" : "danger"} icon={won ? <Trophy /> : <X />} className="self-start md:self-end">
            {won ? "You won" : "The AI won"}
          </Chip>
          <Score value={accuracy} suffix="%" label="Guessed your move" tone="game" className="md:items-end" />
        </div>
      }
      stats={
        <>
          <Stat value={rounds.length} label="Rounds played" />
          <Stat value={`${correct} of ${rounds.length}`} label="Rounds it guessed your move" />
          <Stat value="33%" label="Random guessing gets" />
        </>
      }
      actions={
        <>
          <Button variant="game" size="lg" icon={<RotateCcw />} onClick={onRematch}>
            Rematch
          </Button>
          <Button variant="secondary" size="lg" icon={<UserRoundPlus />} onClick={onNextPlayer}>
            Next player
          </Button>
        </>
      }
    >
      <Noticed habits={habits} insights={insights} />
      <HowItWorks
        intro="It never sees your hand before it decides. It only counts what you did in earlier rounds."
        steps={[
          {
            title: "It remembers your moves",
            text: `Every throw goes into a list. It has ${history.length} of yours, and nothing else about you.`,
            visual: <MoveRow moves={history.slice(-14).map((r) => r.playerMove)} />,
          },
          {
            title: "It looks for patterns",
            text: (
              <>
                What you play after rock, what you do after losing, which move you like most.{" "}
                {strongest ? strongest.text : null}
              </>
            ),
            visual:
              habits.transition && habits.transition.count >= 2 ? (
                <Pair
                  left={habits.transition.from}
                  right={habits.transition.to}
                  leftLabel="After"
                  rightLabel={`${habits.transition.count} of ${habits.transition.total}`}
                />
              ) : (
                <MoveRow moves={GESTURES.flatMap((g) => Array.from({ length: Math.min(habits.counts[g], 6) }, () => g))} />
              ),
          },
          {
            title: "It plays what beats your likely next move",
            text: `It locks that move in before the countdown, so it can't change it after seeing your hand. It guessed right ${correct} of ${rounds.length} times, ${accuracy}%. Random guessing gets about 33%.`,
            visual: lastRound ? (
              <Pair left={lastRound.predictedPlayerMove} right={lastRound.aiCounterMove} leftLabel="Its guess" rightLabel="Its move" lock />
            ) : undefined,
          },
        ]}
      />
    </ResultPanel>
  );
}
