"use client";

import { AnimatePresence, motion } from "motion/react";
import { CirclePlus, FileSearch, RotateCcw, Sun, UserRoundPlus, ZoomIn, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { HowItWorks, ResultPanel } from "@/components/game/panels";
import { NameEntry, Scoreboard } from "@/components/game/scoreboard";
import { Button } from "@/components/ui/button";
import { Score, Stat } from "@/components/ui/score";
import { useLocalBoard } from "@/lib/leaderboard";
import { boardDetail, rankTier, ROUNDS, summarize, tallyByLevel, verdict, type LevelTally } from "../engine/scoring";
import type { ActiveQuestion, PlayerAnswer } from "../engine/types";
import { formatSeconds, LEVEL_CHANGE, LEVEL_NAME, LEVELS } from "./labels";
import { PhotoCredits } from "./photo-credits";
import { RoundReview, Thumb } from "./round-review";
import { cn } from "@/lib/cn";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

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

  const aiLabelled = questions.filter((q) => q.pair.aiItem.contentCredentials).length;
  const example = questions[0]?.pair;

  return (
    <ResultPanel
      label={`${tier.name} · ${answers.length} rounds`}
      title={verdict(summary.correct, summary.total)}
      score={<Score value={summary.score} label="Points" tone="game" />}
      stats={
        <>
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
          <Button variant="secondary" size="lg" icon={<UserRoundPlus />} onClick={onNextPlayer}>
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

      <HowItWorks
        intro={`You caught ${tally.easy.correct} of ${tally.easy.total} easy pairs, ${tally.medium.correct} of ${tally.medium.total} medium and ${tally.hard.correct} of ${tally.hard.total} hard. Here is how the AI made its photos, and why the hard ones are hard.`}
        steps={[
          {
            title: "It started from a real photo",
            text: "Every AI photo you saw began as the real photo next to it. An image model drew each one again from that photo.",
            visual: example ? (
              <div className="grid grid-cols-2 gap-2 p-2">
                <Thumb photo={example.realItem} alt={`The real photo: ${example.subject}`} className="ring-offset-sunken" />
                <Thumb photo={example.aiItem} alt={`The AI version: ${example.subject}`} className="ring-offset-sunken" />
              </div>
            ) : undefined,
          },
          {
            title: "It predicts pixels",
            text: "The model learned from a huge number of photos what usually goes together: sky above trees, curry next to rice. It fills every small patch with its best guess, so the whole picture looks right.",
          },
          {
            title: "It slips on details",
            text: "It copies patterns without knowing what things are. So it adds things that were never there, lights them from the wrong side, and smooths away tiny textures. Those slips are your clues.",
          },
        ]}
      />

      <SpotChecklist aiLabelled={aiLabelled} total={questions.length} />

      <RoundReview questions={questions} answers={answers} />

      <PhotoCredits questions={questions} />
    </ResultPanel>
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
        {LEVELS.map((level) => {
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
                  <span key={i} className={cn("size-2 rounded-full", i < t.correct ? "bg-game" : "bg-fg/15")} />
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const CHECKS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: CirclePlus, title: "Look for things that appeared", text: "Extra wires, objects or food that the scene doesn't need." },
  {
    icon: Sun,
    title: "Check the light",
    text: "Shadows, bright sides and reflections should all agree with where the light comes from.",
  },
  {
    icon: ZoomIn,
    title: "Zoom in on small things",
    text: "Text, hands, fur and tiny people often melt into smooth blobs or patterns that repeat.",
  },
  {
    icon: FileSearch,
    title: "Ask where it came from",
    text: "Who took it, and where was it first posted? A real photo usually has a source you can check.",
  },
];

/** Four checks for any photo, condensed from the original's detection guides. */
function SpotChecklist({ aiLabelled, total }: { aiLabelled: number; total: number }) {
  const labelled = aiLabelled === total ? `All ${total}` : `${aiLabelled} of the ${total}`;
  return (
    <section aria-labelledby="real-or-ai-checks" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="real-or-ai-checks" className="type-title-1 text-fg">
          How to spot an AI photo
        </h2>
        <p className="type-body-lg max-w-[40rem] text-fg-muted">Four checks that work on any photo, not only these.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {CHECKS.map((check, i) => {
          const Icon = check.icon;
          return (
            <li key={check.title} className="flex gap-4 rounded-lg bg-surface p-5 shadow-ring">
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-md bg-game-soft text-game">
                <Icon className="size-5" />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className="type-title-3 text-fg">{check.title}</h3>
                <p className="type-body text-fg-muted">{check.text}</p>
                {i === CHECKS.length - 1 && aiLabelled > 0 ? (
                  <p className="type-small mt-2 text-fg-subtle">
                    {labelled} AI photos you saw carry a signed label inside the file that says Google&apos;s AI made them. Labels
                    like this can be lost when a photo is re-saved, so no label doesn&apos;t prove a photo is real.
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
