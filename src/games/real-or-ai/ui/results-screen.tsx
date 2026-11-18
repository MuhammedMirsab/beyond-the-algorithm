"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { ResultPanel } from "@/components/game/panels";
import { NextPlayerIcon } from "@/components/game/next-player";
import { NameEntry, Scoreboard } from "@/components/game/scoreboard";
import { Button } from "@/components/ui/button";
import { Score, Stat } from "@/components/ui/score";
import { useLocalBoard } from "@/lib/leaderboard";
import { boardDetail, rankTier, ROUNDS, summarize, tallyByLevel, verdict, type LevelTally } from "../engine/scoring";
import type { ActiveQuestion, PlayerAnswer } from "../engine/types";
import { EASE_OUT, formatSeconds, LEVEL_CHANGE, LEVEL_NAME, LEVELS, OutcomeDot, outcomeOf, SPRING_POP } from "./labels";
import { ModelSteps } from "./model-steps";
import { PhotoCredits } from "./photo-credits";
import { RoundReview } from "./round-review";
import { Tells } from "./tells";
import { cn } from "@/lib/cn";

/** Confetti is for a near-perfect game only: 5 of 6 or better. */
const CONFETTI_MIN_CORRECT = ROUNDS - 1;
/** The amber game colour, its deep end and the text white, as hex (canvas-confetti needs hex). */
const CONFETTI_COLORS = ["#ffab4c", "#fd8537", "#f5f7f9"];

export function ResultsScreen({
  questions,
  answers,
  onPlayAgain,
  onNextPlayer,
}: {
  questions: readonly ActiveQuestion[];
  answers: readonly PlayerAnswer[];
  onPlayAgain: () => void;
  onNextPlayer: () => void;
}) {
  const summary = summarize(answers);
  const tier = rankTier(summary.accuracy);
  const tally = tallyByLevel(questions, answers);
  const board = useLocalBoard("real-or-ai");
  const [step, setStep] = useState<"name" | "board">("name");
  const [entryId, setEntryId] = useState<string | null>(null);
  const rankIndex = entryId ? board.entries.findIndex((e) => e.id === entryId) : -1;

  // A near-perfect game earns confetti, never under reduced motion.
  useEffect(() => {
    if (summary.correct < CONFETTI_MIN_CORRECT) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    import("canvas-confetti")
      .then(({ default: confetti }) => {
        if (cancelled) return;
        stop = () => confetti.reset();
        void confetti({
          particleCount: 120,
          spread: 80,
          startVelocity: 42,
          ticks: 220,
          origin: { x: 0.5, y: 0.3 },
          colors: CONFETTI_COLORS,
          disableForReducedMotion: true,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [summary.correct]);

  const submitName = (name: string) => {
    const { id } = board.add({ name, score: summary.score, detail: boardDetail(summary), tiebreak: summary.totalSeconds });
    setEntryId(id);
    setStep("board");
  };

  return (
    <ResultPanel
      label={`${tier.name} · ${answers.length} rounds`}
      title={verdict(summary.correct, summary.total)}
      score={<Score value={summary.score} label="Points" tone="game" />}
      stats={
        <>
          <RoundStrip questions={questions} answers={answers} />
          <Stat value={`${summary.correct} of ${summary.total}`} label="Correct" />
          <Stat value={formatSeconds(summary.averageSeconds)} label="Average per round" />
          {rankIndex >= 0 ? <Stat value={`#${rankIndex + 1}`} label="Rank today" /> : null}
        </>
      }
      actions={
        <>
          <Button variant="secondary" size="lg" icon={<RotateCcw />} onClick={onPlayAgain}>
            Play again
          </Button>
          <Button variant="secondary" size="lg" icon={<NextPlayerIcon />} onClick={onNextPlayer}>
            Next player
          </Button>
        </>
      }
    >
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            {step === "name" ? (
              <motion.div
                key="name"
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col gap-3 rounded-xl bg-surface p-5 shadow-ring sm:p-6"
              >
                <NameEntry onSubmit={submitName} onSkip={() => setStep("board")} />
                <p className="type-caption text-fg-subtle">Only the name you type and your score are saved, on this device.</p>
              </motion.div>
            ) : (
              <motion.div
                key="board"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
              >
                <Scoreboard entries={board.entries} highlightId={entryId} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <LevelCard tally={tally} />
      </div>

      <ModelSteps questions={questions} answers={answers} tally={tally} />

      <Tells questions={questions} answers={answers} />

      <RoundReview questions={questions} answers={answers} />

      <PhotoCredits questions={questions} />
    </ResultPanel>
  );
}

/**
 * The six AI photos in play order, each with how the round went: the game
 * at a glance, landing one after another.
 */
function RoundStrip({ questions, answers }: { questions: readonly ActiveQuestion[]; answers: readonly PlayerAnswer[] }) {
  return (
    <ol aria-label="Your rounds" className="flex w-full items-center gap-2">
      {answers.map((answer, i) => {
        const question = questions[answer.questionIndex];
        if (!question) return null;
        const outcome = outcomeOf(answer);
        return (
          <motion.li
            key={answer.pairId}
            initial={{ opacity: 0, y: 10, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ ...SPRING_POP, delay: 0.15 + Math.min(i, 5) * 0.06 }}
            className="relative"
          >
            <span className="relative block h-12 w-16 overflow-hidden rounded-sm bg-sunken shadow-ring sm:h-14 sm:w-20">
              <Image
                src={question.pair.aiItem.src}
                alt={`Round ${answer.questionIndex + 1}, ${LEVEL_NAME[question.pair.difficulty].toLowerCase()}: ${outcome === "found" ? "you found it" : outcome === "fooled" ? "it fooled you" : "time ran out"}`}
                fill
                sizes="80px"
                draggable={false}
                className="select-none object-cover"
              />
            </span>
            <OutcomeDot outcome={outcome} className="absolute -bottom-1.5 -right-1.5 ring-[3px] ring-surface" />
          </motion.li>
        );
      })}
    </ol>
  );
}

/** Real data: how the visitor did as the changes got smaller. */
function LevelCard({ tally }: { tally: LevelTally }) {
  return (
    <section aria-labelledby="real-or-ai-levels" className="flex flex-col gap-5 rounded-xl bg-surface p-5 shadow-ring sm:p-6">
      <h2 id="real-or-ai-levels" className="type-title-3 text-fg">
        Level by level
      </h2>
      <ul className="flex flex-col gap-4">
        {LEVELS.map((level, row) => {
          const t = tally[level];
          return (
            <li key={level} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1">
              <span className="type-body font-semibold text-fg">{LEVEL_NAME[level]}</span>
              <span className="type-body font-semibold tabular-nums text-fg">
                {t.correct} of {t.total}
              </span>
              <span className="type-small text-fg-subtle">{LEVEL_CHANGE[level]}</span>
              <span aria-hidden className="flex justify-end gap-1">
                {Array.from({ length: t.total }, (_, i) => (
                  <motion.span
                    key={i}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ ...SPRING_POP, delay: 0.3 + (row * 2 + i) * 0.05 }}
                    className={cn("size-2.5 rounded-full", i < t.correct ? "bg-game" : "bg-fg/15")}
                  />
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
